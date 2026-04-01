import * as path from 'node:path'
import * as vscode from 'vscode'
import { loadGrammarContributions, tryResolveConfigPath } from './grammarConfig'
import {
  buildDetailedGrammarSourceEntries,
  buildGrammarSourceSet,
  SourcedGrammarContribution
} from './grammarSources'
import { loadProviderGrammarContributions } from './grammarProvider'
import { loadInstalledGrammarContributions } from './installedGrammars'
import { formatDuration, logError, logInfo, logRunBoundary, startStopwatch } from './log'
import { parseHeaderLine } from './syntaxTest'
import { collectTabbedTargetDocumentLines, formatTabOffsetWarning } from './tabWarnings'
import {
  buildLineOnlyGrammarTestCase,
  collectRunnableSourceLinesFromLines,
  GrammarTestCase,
  GrammarTestFailure,
  RunnableSourceLine,
  resolveFailureAssertionDocumentLine,
  resolveFailureAssertionRange
} from './testingModel'
import { rememberTestFailureSourceLocation } from './testMessageActions'
import { parseGrammarTestCaseWithCompat } from './tmgrammarTestCompat'

const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as {
  createRegistry: (grammars: Array<{ injectTo?: string[]; language?: string; path: string; scopeName: string }>) => unknown
}
const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as {
  parseGrammarTestCase: (value: string) => GrammarTestCase
  runGrammarTestCase: (registry: unknown, testCase: GrammarTestCase) => Promise<TestFailure[]>
}

const REFRESH_DEBOUNCE_MS = 120
const TEST_CONTROLLER_ID = 'tmGrammarTestTools'
const TEST_CONTROLLER_LABEL = 'TM Grammar Test Tools'

export function registerTestingController(context: vscode.ExtensionContext): vscode.Disposable {
  const controller = vscode.tests.createTestController(TEST_CONTROLLER_ID, TEST_CONTROLLER_LABEL)
  const pendingRefreshes = new Map<string, NodeJS.Timeout>()
  const runnableLineCache = new Map<string, readonly number[]>()

  controller.refreshHandler = async () => {
    await refreshAllOpenDocuments(controller, runnableLineCache)
  }

  const runProfile = controller.createRunProfile(
    'Run',
    vscode.TestRunProfileKind.Run,
    async (request, cancellationToken) => {
      await runTests(controller, request, cancellationToken)
    },
    true
  )
  const debugProfile = controller.createRunProfile(
    'Debug',
    vscode.TestRunProfileKind.Debug,
    async (request, cancellationToken) => {
      logInfo('Debug test execution currently uses the same runner as Run; debugger integration is not implemented.')
      await runTests(controller, request, cancellationToken)
    },
    true
  )

  void refreshAllOpenDocuments(controller, runnableLineCache)

  const subscriptions: vscode.Disposable[] = [
    controller,
    runProfile,
    debugProfile,
    vscode.workspace.onDidOpenTextDocument((document) => {
      scheduleRefresh(controller, pendingRefreshes, runnableLineCache, document)
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      maybeInvalidateChangedDocumentTestResults(controller, runnableLineCache, event)
      scheduleRefresh(controller, pendingRefreshes, runnableLineCache, event.document)
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearPendingRefresh(pendingRefreshes, document.uri.toString())
      runnableLineCache.delete(document.uri.toString())
      controller.items.delete(getFileTestItemId(document.uri))
    })
  ]

  return new vscode.Disposable(() => {
    for (const timeout of pendingRefreshes.values()) {
      clearTimeout(timeout)
    }
    pendingRefreshes.clear()

    for (const subscription of subscriptions) {
      subscription.dispose()
    }
  })
}

async function runTests(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
  cancellationToken: vscode.CancellationToken
): Promise<void> {
  const run = controller.createTestRun(request)

  try {
    const requestedItems = request.include?.length
      ? request.include
      : Array.from(controller.items).map(([, item]) => item)

    for (const testItem of requestedItems) {
      if (cancellationToken.isCancellationRequested) {
        break
      }

      await runTestItem(run, testItem, cancellationToken)
    }
  } finally {
    run.end()
  }
}

async function runTestItem(
  run: vscode.TestRun,
  testItem: vscode.TestItem,
  cancellationToken: vscode.CancellationToken
): Promise<void> {
  const target =
    testItem.parent && testItem.uri
      ? {
          kind: 'line' as const,
          lineNumber: testItem.range?.start.line,
          uri: testItem.uri
        }
      : testItem.uri
        ? {
            kind: 'file' as const,
            uri: testItem.uri
          }
        : undefined

  if (!target) {
    return
  }

  const label =
    target.kind === 'file'
      ? `test file ${path.basename(target.uri.fsPath || target.uri.toString())}`
      : `test line ${target.lineNumber! + 1} in ${path.basename(target.uri.fsPath || target.uri.toString())}`
  const stopwatch = startStopwatch()
  logRunBoundary(label, 'start')
  run.started(testItem)

  try {
    const document = await vscode.workspace.openTextDocument(target.uri)
    const text = document.getText()
    const parsedTestCase = parseGrammarTestCaseWithCompat(text, parseGrammarTestCase)
    const header = parseHeaderLine(document.lineCount > 0 ? document.lineAt(0).text : '')
    const lines = splitIntoLines(text)
    const runnableSourceLines = collectRunnableSourceLinesFromLines(lines, header.commentToken)

    const testCase =
      target.kind === 'file'
        ? parsedTestCase
        : buildLineOnlyGrammarTestCase(
            parsedTestCase,
            resolveSourceLineNumberForDocumentLine(runnableSourceLines, target.lineNumber ?? -1)
          )
    logTestTabWarning(lines, runnableSourceLines, header.commentToken, target)
    const testContext = await loadTestContext(document)

    const registryStopwatch = startStopwatch()
    const registry = createRegistry(testContext.grammars)
    logInfo(`Testing registry created in ${formatDuration(registryStopwatch())}.`)

    const runStopwatch = startStopwatch()
    const failures = await runGrammarTestCase(registry, testCase)
    logInfo(`Assertion test execution completed in ${formatDuration(runStopwatch())}.`)
    const renderedFailures = failures.map((failure) => renderTestFailure(failure, testCase, runnableSourceLines, document))

    if (target.kind === 'file') {
      reportFileRunResult(run, testItem, renderedFailures, runnableSourceLines)
      appendTestRunOutput(run, testItem, label, renderedFailures)
    } else {
      reportLineRunResult(run, testItem, renderedFailures)
      appendTestRunOutput(run, testItem, label, renderedFailures)
    }

    logInfo(`Test run completed: ${label} in ${formatDuration(stopwatch())}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    run.errored(testItem, new vscode.TestMessage(message), stopwatch())
    run.appendOutput(toOutputBlock([`ERROR ${label}`, message]), undefined, testItem)
    logError(`${message}\nTest run failed after ${formatDuration(stopwatch())}: ${label}`)
  } finally {
    logRunBoundary(label, 'end')
  }
}

function reportFileRunResult(
  run: vscode.TestRun,
  fileItem: vscode.TestItem,
  renderedFailures: readonly RenderedTestFailure[],
  runnableSourceLines: readonly RunnableSourceLine[]
): void {
  const failuresBySourceLineNumber = new Map<number, RenderedTestFailure[]>()
  for (const renderedFailure of renderedFailures) {
    const bucket = failuresBySourceLineNumber.get(renderedFailure.failure.srcLine)
    if (bucket) {
      bucket.push(renderedFailure)
    } else {
      failuresBySourceLineNumber.set(renderedFailure.failure.srcLine, [renderedFailure])
    }
  }

  for (const [, childItem] of fileItem.children) {
    run.started(childItem)
    const sourceLineNumber = resolveSourceLineNumberForDocumentLine(runnableSourceLines, childItem.range?.start.line ?? -1)
    const lineFailures = failuresBySourceLineNumber.get(sourceLineNumber) ?? []

    if (lineFailures.length === 0) {
      run.passed(childItem)
      continue
    }

    run.failed(childItem, lineFailures.map((failure) => failure.message))
  }

  if (renderedFailures.length === 0) {
    run.passed(fileItem)
    return
  }

  run.failed(fileItem, renderedFailures.map((failure) => failure.message))
}

function reportLineRunResult(
  run: vscode.TestRun,
  lineItem: vscode.TestItem,
  renderedFailures: readonly RenderedTestFailure[]
): void {
  if (renderedFailures.length === 0) {
    run.passed(lineItem)
    return
  }

  run.failed(lineItem, renderedFailures.map((failure) => failure.message))
}

async function refreshAllOpenDocuments(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>
): Promise<void> {
  await Promise.all(
    vscode.workspace.textDocuments.map((document) => refreshDocumentTests(controller, runnableLineCache, document))
  )
}

function scheduleRefresh(
  controller: vscode.TestController,
  pendingRefreshes: Map<string, NodeJS.Timeout>,
  runnableLineCache: Map<string, readonly number[]>,
  document: vscode.TextDocument
): void {
  if (!isSupportedTestDocument(document)) {
    return
  }

  const documentKey = document.uri.toString()
  clearPendingRefresh(pendingRefreshes, documentKey)
  pendingRefreshes.set(
    documentKey,
    setTimeout(() => {
      pendingRefreshes.delete(documentKey)
      void refreshDocumentTests(controller, runnableLineCache, document)
    }, REFRESH_DEBOUNCE_MS)
  )
}

async function refreshDocumentTests(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>,
  document: vscode.TextDocument
): Promise<void> {
  if (!isSupportedTestDocument(document)) {
    return
  }

  const documentKey = document.uri.toString()
  const fileItemId = getFileTestItemId(document.uri)
  const existingFileItem = controller.items.get(fileItemId)

  if (document.lineCount === 0) {
    runnableLineCache.delete(documentKey)
    if (existingFileItem) {
      resetTestResults(controller, [existingFileItem, ...Array.from(existingFileItem.children).map(([, item]) => item)])
      controller.invalidateTestResults(existingFileItem)
    }
    controller.items.delete(fileItemId)
    return
  }

  let header
  try {
    header = parseHeaderLine(document.lineAt(0).text)
  } catch {
    runnableLineCache.delete(documentKey)
    if (existingFileItem) {
      resetTestResults(controller, [existingFileItem, ...Array.from(existingFileItem.children).map(([, item]) => item)])
      controller.invalidateTestResults(existingFileItem)
    }
    controller.items.delete(fileItemId)
    return
  }

  const lines = splitIntoLines(document.getText())
  const runnableSourceLines = collectRunnableSourceLinesFromLines(lines, header.commentToken)
  if (runnableSourceLines.length === 0) {
    runnableLineCache.delete(documentKey)
    if (existingFileItem) {
      resetTestResults(controller, [existingFileItem, ...Array.from(existingFileItem.children).map(([, item]) => item)])
      controller.invalidateTestResults(existingFileItem)
    }
    controller.items.delete(fileItemId)
    return
  }

  let fileItem = existingFileItem
  if (!fileItem) {
    fileItem = controller.createTestItem(fileItemId, path.basename(document.uri.fsPath || document.uri.path), document.uri)
    controller.items.add(fileItem)
  }

  runnableLineCache.set(documentKey, runnableSourceLines.map((line) => line.documentLine))
  fileItem.range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(0).range.end)
  fileItem.children.replace(
    runnableSourceLines.map((sourceLine) => {
      const lineNumber = sourceLine.documentLine + 1
      const lineItem = controller.createTestItem(
        getLineTestItemId(document.uri, sourceLine.documentLine),
        `Line ${lineNumber}`,
        document.uri
      )
      lineItem.description = sourceLine.text.trim()
      lineItem.range = document.lineAt(sourceLine.documentLine).range
      return lineItem
    })
  )
}

async function loadTestContext(document: vscode.TextDocument): Promise<{ grammars: Array<{ injectTo?: string[]; language?: string; path: string; scopeName: string }> }> {
  const stopwatch = startStopwatch()
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const autoLoadInstalledGrammars = configuration.get<boolean>('autoLoadInstalledGrammars') ?? true
  const logGrammarDetails = configuration.get<boolean>('logGrammarDetails') ?? false

  const localConfigStopwatch = startStopwatch()
  const localGrammars = await loadOptionalLocalGrammarContributions(document)
  if (localGrammars.length > 0) {
    logInfo(`Testing loaded local grammar config in ${formatDuration(localConfigStopwatch())}.`)
  }

  const header = parseHeaderLine(document.lineAt(0).text)
  const providerGrammars = await loadProviderGrammarContributions(document, header.scopeName)
  const installedGrammarStopwatch = startStopwatch()
  const installedGrammars = autoLoadInstalledGrammars ? loadInstalledGrammarContributions() : []
  const grammarSources = buildGrammarSourceSet(
    installedGrammars,
    localGrammars,
    providerGrammars,
    autoLoadInstalledGrammars
  )

  if (autoLoadInstalledGrammars) {
    logInfo(`Testing loaded installed grammar contributions in ${formatDuration(installedGrammarStopwatch())}.`)
  }

  logInfo(
    `Testing grammar sources: installed=${grammarSources.installedCount}, local=${grammarSources.localCount}, provider=${grammarSources.providerCount}`
  )
  if (logGrammarDetails) {
    logDetailedGrammarSourceEntries(
      buildDetailedGrammarSourceEntries(installedGrammars, localGrammars, providerGrammars, autoLoadInstalledGrammars)
    )
  }
  logInfo(`Resolved test context in ${formatDuration(stopwatch())}.`)

  return {
    grammars: grammarSources.grammars.map((grammar) => ({
      injectTo: grammar.injectTo,
      language: grammar.language,
      path: grammar.path,
      scopeName: grammar.scopeName
    }))
  }
}

async function loadOptionalLocalGrammarContributions(document: vscode.TextDocument) {
  const configPath = await tryResolveConfigPath(document)
  if (!configPath) {
    logInfo('No local package.json grammar config found for the test target document.')
    return []
  }

  logInfo(`Using local grammar config for testing: ${configPath}`)
  return loadGrammarContributions(configPath)
}

function renderTestFailure(
  failure: TestFailure,
  testCase: GrammarTestCase,
  runnableSourceLines: readonly RunnableSourceLine[],
  document: vscode.TextDocument
): RenderedTestFailure {
  const lines = splitIntoLines(document.getText())
  const header = parseHeaderLine(document.lineAt(0).text)
  const sourceLine = runnableSourceLines.find((line) => line.sourceLineNumber === failure.srcLine)
  const sourceDocumentLine = sourceLine?.documentLine ?? 0
  const documentLine = document.lineAt(sourceDocumentLine)
  const assertionRange = resolveFailureAssertionRange(testCase, failure)
  const rawEndCharacter = assertionRange?.end ?? failure.end
  const rawStartCharacter = assertionRange?.start ?? failure.start
  const endCharacter = Math.min(rawEndCharacter, documentLine.text.length)
  const startCharacter = Math.min(rawStartCharacter, endCharacter)
  const sourceRange = new vscode.Range(sourceDocumentLine, startCharacter, sourceDocumentLine, endCharacter)
  const assertionDocumentLine = resolveFailureAssertionDocumentLine(
    lines,
    header.commentToken,
    sourceDocumentLine,
    failure
  )
  const assertionLine = clampDocumentLine(assertionDocumentLine ?? sourceDocumentLine, document)
  const assertionLocation = new vscode.Location(document.uri, document.lineAt(assertionLine).range)
  const humanSourceLine = sourceDocumentLine + 1
  const summaryParts: string[] = []

  if (failure.missing.length > 0) {
    summaryParts.push(`Missing scopes: ${failure.missing.join(', ')}`)
  }

  if (failure.unexpected.length > 0) {
    summaryParts.push(`Unexpected scopes: ${failure.unexpected.join(', ')}`)
  }

  const detailParts: string[] = [
    summaryParts.length > 0 ? summaryParts.join('; ') : 'Assertion failed'
  ]

  if (failure.actual.length > 0) {
    detailParts.push(`Actual scopes: ${failure.actual.join(', ')}`)
  }

  const message = new vscode.TestMessage(detailParts.join('\n'))
  message.location = assertionLocation
  message.contextValue = 'tmGrammarTestTools.failure'
  rememberTestFailureSourceLocation(message, assertionLocation, new vscode.Location(document.uri, sourceRange))

  return {
    failure,
    message,
    outputSummary: `Line ${humanSourceLine}: ` + (summaryParts.length > 0 ? summaryParts.join('; ') : 'Assertion failed')
  }
}

function appendTestRunOutput(
  run: vscode.TestRun,
  testItem: vscode.TestItem,
  label: string,
  renderedFailures: readonly RenderedTestFailure[]
): void {
  if (renderedFailures.length === 0) {
    run.appendOutput(toOutputBlock([`PASS ${label}`]), undefined, testItem)
    return
  }

  run.appendOutput(
    toOutputBlock([
      `FAIL ${label}`,
      ...renderedFailures.map((failure) => failure.outputSummary)
    ]),
    undefined,
    testItem
  )
}

function toOutputBlock(lines: readonly string[]): string {
  return `${lines.join('\r\n')}\r\n`
}

function resolveSourceLineNumberForDocumentLine(
  runnableSourceLines: readonly RunnableSourceLine[],
  documentLine: number
): number {
  const sourceLine = runnableSourceLines.find((line) => line.documentLine === documentLine)
  if (!sourceLine) {
    throw new Error(`Could not resolve a runnable source line for document line ${documentLine + 1}.`)
  }

  return sourceLine.sourceLineNumber
}

function getFileTestItemId(uri: vscode.Uri): string {
  return `file:${uri.toString()}`
}

function getLineTestItemId(uri: vscode.Uri, documentLine: number): string {
  return `line:${uri.toString()}:${documentLine}`
}

function clearPendingRefresh(pendingRefreshes: Map<string, NodeJS.Timeout>, documentKey: string): void {
  const timeout = pendingRefreshes.get(documentKey)
  if (!timeout) {
    return
  }

  clearTimeout(timeout)
  pendingRefreshes.delete(documentKey)
}

function isSupportedTestDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' || document.uri.scheme === 'untitled'
}

function maybeInvalidateChangedDocumentTestResults(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>,
  event: vscode.TextDocumentChangeEvent
): void {
  const document = event.document
  const fileItem = controller.items.get(getFileTestItemId(document.uri))
  if (!fileItem) {
    return
  }

  const previousRunnableLines = runnableLineCache.get(document.uri.toString()) ?? []
  const currentRunnableLines = collectRunnableSourceDocumentLines(document)
  const removedRunnableLines = previousRunnableLines.filter((line) => !currentRunnableLines.includes(line))

  for (const removedLine of removedRunnableLines) {
    const removedItem = fileItem.children.get(getLineTestItemId(document.uri, removedLine))
    if (removedItem) {
      resetTestResults(controller, [removedItem])
      controller.invalidateTestResults(removedItem)
    }
  }

  if (
    event.contentChanges.some((change) => changeChangesLineStructure(change)) ||
    event.contentChanges.some((change) => touchesRunnableSourceLine(change, previousRunnableLines))
  ) {
    controller.invalidateTestResults(fileItem)
  }
}

function splitIntoLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/)
}

function collectRunnableSourceDocumentLines(document: vscode.TextDocument): readonly number[] {
  if (!isSupportedTestDocument(document) || document.lineCount === 0) {
    return []
  }

  try {
    const header = parseHeaderLine(document.lineAt(0).text)
    const lines = splitIntoLines(document.getText())
    return collectRunnableSourceLinesFromLines(lines, header.commentToken).map((line) => line.documentLine)
  } catch {
    return []
  }
}

function clampDocumentLine(line: number, document: vscode.TextDocument): number {
  if (document.lineCount === 0) {
    return 0
  }

  return Math.max(0, Math.min(line, document.lineCount - 1))
}

function sameLineSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const rightSet = new Set(right)
  return left.every((line) => rightSet.has(line))
}

function changeChangesLineStructure(change: vscode.TextDocumentContentChangeEvent): boolean {
  return change.range.start.line !== change.range.end.line || /\r?\n/.test(change.text)
}

function touchesRunnableSourceLine(
  change: vscode.TextDocumentContentChangeEvent,
  runnableLines: readonly number[]
): boolean {
  return runnableLines.some((line) => line >= change.range.start.line && line <= change.range.end.line)
}

function resetTestResults(controller: vscode.TestController, items: readonly vscode.TestItem[]): void {
  if (items.length === 0) {
    return
  }

  // VS Code does not expose a direct "clear result for this test item" API.
  // A run that includes the items and ends without reporting statuses resets
  // their stale pass/fail state back to neutral.
  const run = controller.createTestRun(new vscode.TestRunRequest(items), 'Reset stale TM Grammar Test results', false)
  run.end()
}

function logDetailedGrammarSourceEntries(entries: readonly SourcedGrammarContribution[]): void {
  if (entries.length === 0) {
    logInfo('Grammar load order: <none>')
    return
  }

  logInfo(`Grammar load order (${entries.length}):`)
  for (const [index, entry] of entries.entries()) {
    const injectTo =
      entry.grammar.injectTo && entry.grammar.injectTo.length > 0
        ? ` injectTo=${entry.grammar.injectTo.join(',')}`
        : ''
    const language = entry.grammar.language ? ` language=${entry.grammar.language}` : ''
    logInfo(
      `  ${index + 1}. [${entry.source}] ${entry.grammar.scopeName || '<no scope>'} -> ${entry.grammar.path}${language}${injectTo}`
    )
  }
}

type TestFailure = GrammarTestFailure

interface RenderedTestFailure {
  failure: TestFailure
  message: vscode.TestMessage
  outputSummary: string
}

function logTestTabWarning(
  lines: readonly string[],
  runnableSourceLines: readonly RunnableSourceLine[],
  commentToken: string,
  target:
    | {
        kind: 'file'
        uri: vscode.Uri
      }
    | {
        kind: 'line'
        lineNumber: number | undefined
        uri: vscode.Uri
      }
): void {
  const sourceDocumentLines =
    target.kind === 'file'
      ? runnableSourceLines.map((line) => line.documentLine)
      : target.lineNumber === undefined
        ? []
        : [target.lineNumber]

  const warning = formatTabOffsetWarning(
    collectTabbedTargetDocumentLines(lines, sourceDocumentLines, commentToken),
    'tested source/assertion'
  )
  if (warning) {
    logInfo(warning)
  }
}
