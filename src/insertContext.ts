import * as vscode from 'vscode'
import { AssertionGenerationContext, AssertionGenerationOptions } from './assertionGenerator'
import { loadGrammarContributions, tryResolveConfigPath } from './grammarConfig'
import { buildDetailedGrammarSourceEntries, buildGrammarSourceSet } from './grammarSources'
import { getEssentialGrammarSummaryLines, resolveSourcedGrammarEntries } from './grammarDebug'
import { loadProviderGrammarContributions } from './grammarProvider'
import { loadInstalledGrammarContributions } from './installedGrammars'
import { formatDuration, logInfo, startStopwatch } from './log'
import { ScopeMode } from './render'
import { resolveScopeMode } from './scopeMode'
import { collectSourceLines, parseHeaderLine, SourceLine } from './syntaxTest'
import { collectTabbedTargetDocumentLines, formatTabOffsetWarning } from './tabWarnings'

export interface InsertContext {
  assertionGenerationContext: AssertionGenerationContext
  assertionGenerationOptions: AssertionGenerationOptions
  document: vscode.TextDocument
  sourceLines: readonly SourceLine[]
}

export async function loadInsertContext(
  editor: vscode.TextEditor,
  scopeModeOverride: ScopeMode | undefined,
  targetMode: 'line' | 'range'
): Promise<InsertContext> {
  const stopwatch = startStopwatch()
  const document = editor.document
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const autoLoadInstalledGrammars = configuration.get<boolean>('autoLoadInstalledGrammars') ?? true
  const logGrammarDetails = configuration.get<boolean>('logGrammarDetails') ?? false
  const assertionGenerationOptions: AssertionGenerationOptions = {
    compactRanges: configuration.get<boolean>('compactRanges') ?? true,
    scopeMode: resolveScopeMode(configuration.get<string>('scopeMode'), scopeModeOverride)
  }
  logInfo(`Insert assertions requested for ${document.uri.fsPath}`)
  logInfo(`Workspace folder: ${workspaceFolder?.uri.fsPath ?? '<none>'}`)
  logInfo(`Target mode: ${targetMode}`)
  logInfo(
    `Render options: scopeMode=${assertionGenerationOptions.scopeMode}, compactRanges=${assertionGenerationOptions.compactRanges}, autoLoadInstalledGrammars=${autoLoadInstalledGrammars}`
  )

  if (document.lineCount === 0) {
    throw new Error('Expected a syntax test file with a header line.')
  }

  const header = parseHeaderLine(document.lineAt(0).text)
  logInfo(`Parsed syntax test header with scope ${header.scopeName}`)
  const sourceLines = collectSourceLines(document, header.commentToken)

  if (sourceLines.length === 0) {
    throw new Error('No source lines were found under the syntax test header.')
  }

  const localGrammars = await loadOptionalLocalGrammarContributions(document)
  const providerGrammars = await loadProviderGrammarContributions(document, header.scopeName)
  const installedGrammarStopwatch = startStopwatch()
  const installedGrammars = autoLoadInstalledGrammars ? loadInstalledGrammarContributions() : []
  const grammarSources = buildGrammarSourceSet(
    installedGrammars,
    localGrammars,
    providerGrammars,
    autoLoadInstalledGrammars
  )
  const unresolvedSourcedGrammars = buildDetailedGrammarSourceEntries(
    installedGrammars,
    localGrammars,
    providerGrammars,
    autoLoadInstalledGrammars
  )
  const sourcedGrammars = await resolveSourcedGrammarEntries(unresolvedSourcedGrammars)
  if (autoLoadInstalledGrammars) {
    logInfo(`Loaded installed grammar contributions in ${formatDuration(installedGrammarStopwatch())}.`)
  }
  logInfo(
    `Grammar sources: installed=${grammarSources.installedCount}, local=${grammarSources.localCount}, provider=${grammarSources.providerCount}`
  )
  getEssentialGrammarSummaryLines(
    sourcedGrammars,
    header.scopeName,
    'Enable tmGrammarTestTools.logGrammarDetails for the full trace.'
  ).forEach((line) => logInfo(line))
  logInfo(`Resolved insert context in ${formatDuration(stopwatch())}.`)

  return {
    assertionGenerationContext: {
      commentToken: header.commentToken,
      grammars: sourcedGrammars.map((entry) => entry.grammar),
      logGrammarDetails,
      onGrammarTrace: logGrammarDetails ? (lines) => lines.forEach((line) => logInfo(line)) : undefined,
      scopeName: header.scopeName,
      sourceLines,
      sourcedGrammars
    },
    assertionGenerationOptions,
    document,
    sourceLines
  }
}

export function logTargetTabWarning(
  document: vscode.TextDocument,
  sourceDocumentLines: readonly number[],
  commentToken: string,
  targetLabel: string
): void {
  const lines = Array.from({ length: document.lineCount }, (_, lineNumber) => document.lineAt(lineNumber).text)
  const warning = formatTabOffsetWarning(
    collectTabbedTargetDocumentLines(lines, sourceDocumentLines, commentToken),
    targetLabel
  )
  if (warning) {
    logInfo(warning)
  }
}

async function loadOptionalLocalGrammarContributions(document: vscode.TextDocument) {
  const stopwatch = startStopwatch()
  const configPath = await tryResolveConfigPath(document)
  if (!configPath) {
    logInfo('No local package.json grammar config found for the active document.')
    return []
  }

  logInfo(`Using local grammar config: ${configPath}`)
  const grammars = await loadGrammarContributions(configPath)
  logInfo(`Loaded local grammar config in ${formatDuration(stopwatch())}.`)
  return grammars
}
