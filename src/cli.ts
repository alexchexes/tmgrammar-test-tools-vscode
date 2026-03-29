import * as path from 'path'
import { promises as fs } from 'fs'
import {
  AssertionGenerationContext,
  AssertionGenerationOptions,
  generateLineAssertionBlock,
  generateRangeAssertionBlock
} from './assertionGenerator'
import { findGrammarConfigPathForFile, loadGrammarContributionsFromConfig } from './grammarPackage'
import { buildGrammarSourceSet } from './grammarSources'
import { resolveProjectRootForFile } from './projectRoots'
import { ScopeMode } from './render'
import { SelectionInput, collectSelectionRangeTargets } from './selectionTargets'
import { collectSourceLinesFromLines, parseHeaderLine } from './syntaxTestCore'
import { runGrammarProvider } from './providerRunner'

interface CliArguments {
  compactRanges: boolean
  configPath?: string
  filePath: string
  help: boolean
  lineTargets: number[]
  outputMode: 'json' | 'plain'
  providerCommand?: string
  providerCwd?: string
  providerTimeoutMs?: number
  rangeTargets: RangeSpec[]
  scopeMode: ScopeMode
}

interface RangeSpec {
  endCharacter: number
  endLine: number
  startCharacter: number
  startLine: number
}

interface CliOutput {
  commentToken: string
  filePath: string
  scopeName: string
  targets: CliTargetOutput[]
}

type CliTargetOutput = CliLineTargetOutput | CliRangeTargetOutput

interface CliLineTargetOutput {
  assertionLines: readonly string[]
  documentLine: number
  kind: 'line'
  sourceText: string
}

interface CliRangeTargetOutput {
  assertionLines: readonly string[]
  documentLine: number
  kind: 'range'
  ranges: readonly { endIndex: number; startIndex: number }[]
  sourceText: string
}

export async function runCli(argv: readonly string[]): Promise<CliOutput> {
  const args = parseArguments(argv)
  if (args.help) {
    throw new Error(buildHelpText())
  }

  const filePath = path.resolve(args.filePath)
  const fileContent = await fs.readFile(filePath, 'utf8')
  const lines = splitIntoLines(fileContent)

  if (lines.length === 0) {
    throw new Error('Expected a syntax test file with a header line.')
  }

  const header = parseHeaderLine(lines[0])
  const sourceLines = collectSourceLinesFromLines(lines, header.commentToken)
  if (sourceLines.length === 0) {
    throw new Error('No source lines were found under the syntax test header.')
  }

  const projectRoot = await resolveProjectRootForFile(filePath)
  const configPath = await findGrammarConfigPathForFile(filePath, {
    configuredPath: args.configPath,
    relativeBase: process.cwd()
  })
  const localGrammars = configPath ? await loadGrammarContributionsFromConfig(configPath) : []
  const providerGrammars =
    args.providerCommand?.trim()
      ? await runGrammarProvider(
          {
            filePath,
            projectRoot
          },
          {
            command: args.providerCommand,
            cwd: args.providerCwd,
            timeoutMs: args.providerTimeoutMs
          }
        )
      : []
  const grammarSources = buildGrammarSourceSet([], localGrammars, providerGrammars, false)

  if (grammarSources.grammars.length === 0) {
    throw new Error(
      'Could not find any grammars to load. Provide --config or --provider-command, or run the CLI from inside a grammar package.'
    )
  }

  const generationContext: AssertionGenerationContext = {
    commentToken: header.commentToken,
    grammars: grammarSources.grammars,
    scopeName: header.scopeName,
    sourceLines
  }
  const generationOptions: AssertionGenerationOptions = {
    compactRanges: args.compactRanges,
    scopeMode: args.scopeMode
  }
  const sourceLineIndexes = new Map(sourceLines.map((line, index) => [line.documentLine, index]))
  const targets: CliTargetOutput[] = []

  for (const documentLine of args.lineTargets) {
    const sourceLineIndex = sourceLineIndexes.get(documentLine - 1)
    if (sourceLineIndex === undefined) {
      throw new Error(`Line ${documentLine} does not point to a source line in the syntax test.`)
    }

    const sourceLine = sourceLines[sourceLineIndex]
    targets.push({
      assertionLines: await generateLineAssertionBlock(generationContext, sourceLineIndex, generationOptions),
      documentLine,
      kind: 'line',
      sourceText: sourceLine.text
    })
  }

  const rangeTargets = collectSelectionRangeTargets(
    sourceLines,
    args.rangeTargets.map(toSelectionInput)
  )

  for (const rangeTarget of rangeTargets) {
    const sourceLineIndex = sourceLineIndexes.get(rangeTarget.sourceLine.documentLine)
    if (sourceLineIndex === undefined) {
      continue
    }

    const generated = await generateRangeAssertionBlock(
      generationContext,
      sourceLineIndex,
      rangeTarget,
      generationOptions
    )
    targets.push({
      assertionLines: generated.assertionLines,
      documentLine: rangeTarget.sourceLine.documentLine + 1,
      kind: 'range',
      ranges: generated.ranges,
      sourceText: rangeTarget.sourceLine.text
    })
  }

  return {
    commentToken: header.commentToken,
    filePath,
    scopeName: header.scopeName,
    targets: targets.sort((left, right) => left.documentLine - right.documentLine)
  }
}

async function main(): Promise<void> {
  try {
    const output = await runCli(process.argv.slice(2))
    const args = parseArguments(process.argv.slice(2))
    process.stdout.write(renderCliOutput(output, args.outputMode))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isHelpMessage = message === buildHelpText()
    const stream = isHelpMessage ? process.stdout : process.stderr
    stream.write(`${message}\n`)
    process.exitCode = isHelpMessage ? 0 : 1
  }
}

if (require.main === module) {
  void main()
}

function toSelectionInput(rangeSpec: RangeSpec): SelectionInput {
  return {
    activeCharacter: rangeSpec.startCharacter,
    activeLine: rangeSpec.startLine,
    endCharacter: rangeSpec.endCharacter,
    endLine: rangeSpec.endLine,
    isEmpty: false,
    startCharacter: rangeSpec.startCharacter,
    startLine: rangeSpec.startLine
  }
}

function parseArguments(argv: readonly string[]): CliArguments {
  const args: CliArguments = {
    compactRanges: true,
    filePath: '',
    help: false,
    lineTargets: [],
    outputMode: 'json',
    rangeTargets: [],
    scopeMode: 'full'
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]

    switch (argument) {
      case '--help':
      case '-h':
        args.help = true
        return args
      case '--file':
        args.filePath = readValue(argv, ++index, '--file')
        break
      case '--config':
        args.configPath = readValue(argv, ++index, '--config')
        break
      case '--provider-command':
        args.providerCommand = readValue(argv, ++index, '--provider-command')
        break
      case '--provider-cwd':
        args.providerCwd = readValue(argv, ++index, '--provider-cwd')
        break
      case '--provider-timeout-ms':
        args.providerTimeoutMs = parsePositiveNumber(readValue(argv, ++index, '--provider-timeout-ms'), argument)
        break
      case '--scope-mode':
        args.scopeMode = parseScopeMode(readValue(argv, ++index, '--scope-mode'))
        break
      case '--compact-ranges':
        args.compactRanges = true
        break
      case '--no-compact-ranges':
        args.compactRanges = false
        break
      case '--json':
        args.outputMode = 'json'
        break
      case '--plain':
        args.outputMode = 'plain'
        break
      case '--line':
        args.lineTargets.push(parsePositiveNumber(readValue(argv, ++index, '--line'), '--line'))
        break
      case '--range':
        args.rangeTargets.push(parseRangeSpec(readValue(argv, ++index, '--range')))
        break
      default:
        throw new Error(`Unknown argument: ${argument}\n${buildHelpText()}`)
    }
  }

  if (!args.filePath) {
    throw new Error(`Missing required --file argument.\n${buildHelpText()}`)
  }

  if (args.lineTargets.length === 0 && args.rangeTargets.length === 0) {
    throw new Error(`Specify at least one --line or --range target.\n${buildHelpText()}`)
  }

  return args
}

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${flag}.`)
  }

  return value
}

function parsePositiveNumber(value: string, flag: string): number {
  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${flag} expects a positive integer, received: ${value}`)
  }

  return parsedValue
}

function parseScopeMode(value: string): ScopeMode {
  if (value === 'full' || value === 'minimal') {
    return value
  }

  throw new Error(`--scope-mode must be either "full" or "minimal", received: ${value}`)
}

function parseRangeSpec(value: string): RangeSpec {
  const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(value)
  if (!match) {
    throw new Error(
      `--range must use startLine:startColumn-endLine:endColumn with 1-based inclusive columns, received: ${value}`
    )
  }

  const [, startLineRaw, startColumnRaw, endLineRaw, endColumnRaw] = match
  const startLine = Number.parseInt(startLineRaw, 10)
  const startColumn = Number.parseInt(startColumnRaw, 10)
  const endLine = Number.parseInt(endLineRaw, 10)
  const endColumn = Number.parseInt(endColumnRaw, 10)

  if (startLine <= 0 || endLine <= 0 || startColumn <= 0 || endColumn <= 0) {
    throw new Error(`--range values must be positive, received: ${value}`)
  }

  const range = {
    endCharacter: endColumn,
    endLine: endLine - 1,
    startCharacter: startColumn - 1,
    startLine: startLine - 1
  }

  if (range.endLine < range.startLine || (range.endLine === range.startLine && range.endCharacter <= range.startCharacter)) {
    throw new Error(`--range end must be after start, received: ${value}`)
  }

  return range
}

function splitIntoLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/)
}

function buildHelpText(): string {
  return [
    'Usage: node out/cli.js --file <syntax-test-file> [targets...] [options]',
    '',
    'Targets:',
    '  --line <document-line>             Generate assertions for a 1-based source line.',
    '  --range <startLine:startCol-endLine:endCol>',
    '                                     Generate assertions for a selected range using 1-based inclusive columns.',
    '',
    'Options:',
    '  --config <package.json>            Optional grammar package.json path.',
    '  --provider-command <command>       Optional grammar provider command.',
    '  --provider-cwd <cwd>               Optional grammar provider working directory.',
    '  --provider-timeout-ms <ms>         Provider command timeout in milliseconds.',
    '  --scope-mode <full|minimal>        Assertion rendering mode. Defaults to full.',
    '  --json                             Print structured JSON output. This is the default.',
    '  --plain                            Print only generated assertion lines.',
    '  --compact-ranges                   Enable disjoint caret compaction. Defaults to enabled.',
    '  --no-compact-ranges                Disable disjoint caret compaction.',
    '  --help                             Show this help text.'
  ].join('\n')
}

function renderCliOutput(output: CliOutput, outputMode: 'json' | 'plain'): string {
  if (outputMode === 'json') {
    return `${JSON.stringify(output, null, 2)}\n`
  }

  const blocks = output.targets
    .map((target) => target.assertionLines.join('\n'))
    .filter((block) => block.length > 0)

  return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : ''
}
