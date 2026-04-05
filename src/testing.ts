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
import { getEffectiveTmGrammarConfiguration, getEffectiveWorkspaceFolder } from './settings'
import { collectTabbedTargetDocumentLines, formatTabOffsetWarning } from './tabWarnings'
import { buildWorkspaceDiscoveryExcludePattern, getWorkspaceTestDiscoveryConfiguration } from './testDiscovery'
import {
  buildTargetedGrammarTestCaseText,
  collectRunnableSourceLinesFromLines,
  GrammarTestCase,
  GrammarTestFailure,
  RunnableSourceLine,
  resolveFailureAssertionDocumentLine,
  resolveFailureAssertionRange
} from './testingModel'
import { rememberTestFailureSourceLocation } from './testMessageActions'
import { parseGrammarTestCaseWithCompat } from './tmgrammarTestCompat'
import { GrammarContribution } from './grammarTypes'

type VscodeTmgrammarTestCommonApi = {
  createRegistry: (grammars: readonly { injectTo?: string[]; language?: string; path: string; scopeName: string }[]) => unknown
}
type VscodeTmgrammarTestUnitApi = {
  parseGrammarTestCase: (value: string) => GrammarTestCase
  runGrammarTestCase: (registry: unknown, testCase: GrammarTestCase) => Promise<TestFailure[]>
}
type VscodeTmgrammarTestParsingApi = {
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[]
}
type VscodeTmgrammarTestRuntime = VscodeTmgrammarTestCommonApi & VscodeTmgrammarTestUnitApi & VscodeTmgrammarTestParsingApi

let vscodeTmgrammarTestRuntime: VscodeTmgrammarTestRuntime | undefined

const REFRESH_DEBOUNCE_MS = 120
const TEST_CONTROLLER_ID = 'tmGrammarTestTools'
const TEST_CONTROLLER_LABEL = 'TM Grammar Test Tools'

interface TestRunExecutionContext {
  installedGrammars?: readonly GrammarContribution[]
  localGrammarLoads: Map<string, Promise<GrammarContribution[]>>
  providerGrammarLoads: Map<string, Promise<GrammarContribution[]>>
  registries: Map<string, unknown>
}

export function registerTestingController(context: vscode.ExtensionContext): vscode.Disposable {
  void context
  const controller = vscode.tests.createTestController(TEST_CONTROLLER_ID, TEST_CONTROLLER_LABEL)
  const pendingRefreshes = new Map<string, NodeJS.Timeout>()
  const globDiscoveredFileItemIds = new Set<string>()
  const runnableLineCache = new Map<string, readonly number[]>()

  controller.refreshHandler = async (token) => {
    await refreshAllTests(controller, runnableLineCache, globDiscoveredFileItemIds, token)
  }
  controller.resolveHandler = async (item) => {
    await resolveTestItem(controller, runnableLineCache, globDiscoveredFileItemIds, item)
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

  void refreshAllTests(controller, runnableLineCache, globDiscoveredFileItemIds)

  const subscriptions: vscode.Disposable[] = [
    controller,
    runProfile,
    debugProfile,
    vscode.workspace.onDidOpenTextDocument((document) => {
      scheduleRefresh(controller, pendingRefreshes, runnableLineCache, globDiscoveredFileItemIds, document)
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      maybeInvalidateChangedDocumentTestResults(controller, runnableLineCache, event)
      scheduleRefresh(controller, pendingRefreshes, runnableLineCache, globDiscoveredFileItemIds, event.document)
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearPendingRefresh(pendingRefreshes, document.uri.toString())
      runnableLineCache.delete(document.uri.toString())

      const fileItemId = getFileTestItemId(document.uri)
      const fileItem = controller.items.get(fileItemId)
      if (!fileItem) {
        return
      }

      if (globDiscoveredFileItemIds.has(fileItemId)) {
        resetPlaceholderFileItem(controller, fileItem)
        return
      }

      controller.items.delete(fileItemId)
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

function getVscodeTmgrammarTestRuntime(): VscodeTmgrammarTestRuntime {
  if (vscodeTmgrammarTestRuntime) {
    return vscodeTmgrammarTestRuntime
  }

  const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as VscodeTmgrammarTestCommonApi
  const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as VscodeTmgrammarTestUnitApi
  const { parseScopeAssertion } = require('vscode-tmgrammar-test/dist/unit/parsing') as VscodeTmgrammarTestParsingApi

  vscodeTmgrammarTestRuntime = {
    createRegistry,
    parseGrammarTestCase,
    parseScopeAssertion,
    runGrammarTestCase
  }

  return vscodeTmgrammarTestRuntime
}

async function runTests(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
  cancellationToken: vscode.CancellationToken
): Promise<void> {
  const run = controller.createTestRun(request)
  const executionContext = createTestRunExecutionContext()

  try {
    const requestedItems = request.include?.length
      ? request.include
      : Array.from(controller.items).map(([, item]) => item)

    for (const testItem of requestedItems) {
      if (cancellationToken.isCancellationRequested) {
        break
      }

      await runTestItem(controller, run, testItem, cancellationToken, executionContext)
    }
  } finally {
    run.end()
  }
}

async function runTestItem(
  controller: vscode.TestController,
  run: vscode.TestRun,
  testItem: vscode.TestItem,
  cancellationToken: vscode.CancellationToken,
  executionContext: TestRunExecutionContext
): Promise<void> {
  void cancellationToken
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
      ? `test file ${getTestRunLabelPath(target.uri)}`
      : `test line ${target.lineNumber! + 1} in ${getTestRunLabelPath(target.uri)}`
  const stopwatch = startStopwatch()
  logRunBoundary(label, 'start', true)
  logInfo(`Target file: ${getAbsoluteLogTargetPath(target.uri)}`)
  if (target.kind === 'line') {
    logInfo(`Target line: ${target.lineNumber! + 1}`)
  }
  run.started(testItem)

  try {
    const document = await vscode.workspace.openTextDocument(target.uri)
    const text = document.getText()
    const header = parseHeaderLine(document.lineCount > 0 ? document.lineAt(0).text : '')
    const lines = splitIntoLines(text)
    const runnableSourceLines = collectRunnableSourceLinesFromLines(lines, header.commentToken)
    logTestTabWarning(lines, runnableSourceLines, header.commentToken, target)
    const testContext = await loadTestContext(document, executionContext)

    const runner = getVscodeTmgrammarTestRuntime()
    const registry = getOrCreateRegistry(testContext.grammars, executionContext)

    if (target.kind === 'file') {
      syncFileItemChildren(controller, testItem, document, runnableSourceLines)
      const parsedTestCase = parseGrammarTestCaseWithCompat(
        text,
        runner.parseGrammarTestCase,
        runner.parseScopeAssertion
      )
      const runStopwatch = startStopwatch()
      const failures = await runner.runGrammarTestCase(registry, parsedTestCase)
      logInfo(`Assertion test execution completed in ${formatDuration(runStopwatch())}.`)
      const renderedFailures = failures.map((failure) => renderTestFailure(failure, parsedTestCase, runnableSourceLines, document))
      reportFileRunResult(run, testItem, renderedFailures, runnableSourceLines)
      appendTestRunOutput(run, testItem, label, renderedFailures)
    } else {
      const targetedTestCaseText = buildTargetedGrammarTestCaseText(
        lines,
        header.commentToken,
        target.lineNumber ?? -1
      )
      if (!targetedTestCaseText) {
        throw new Error(`Could not resolve a runnable test block for document line ${(target.lineNumber ?? 0) + 1}.`)
      }

      const parsedTestCase = parseGrammarTestCaseWithCompat(
        targetedTestCaseText.text,
        runner.parseGrammarTestCase,
        runner.parseScopeAssertion,
        targetedTestCaseText.lineNumberMap
      )
      const runStopwatch = startStopwatch()
      const failures = await runner.runGrammarTestCase(registry, parsedTestCase)
      logInfo(`Assertion test execution completed in ${formatDuration(runStopwatch())}.`)
      const renderedFailures = failures.map((failure) =>
        renderTestFailure(failure, parsedTestCase, runnableSourceLines, document)
      )
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
    logRunBoundary(label, 'end', true)
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

async function refreshAllTests(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>,
  globDiscoveredFileItemIds: Set<string>,
  token?: vscode.CancellationToken
): Promise<void> {
  await refreshWorkspaceDiscoveredFiles(controller, globDiscoveredFileItemIds, token)
  await Promise.all(
    vscode.workspace.textDocuments.map((document) =>
      refreshDocumentTests(controller, runnableLineCache, globDiscoveredFileItemIds, document)
    )
  )
}

async function resolveTestItem(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>,
  globDiscoveredFileItemIds: Set<string>,
  item: vscode.TestItem | undefined
): Promise<void> {
  if (!item) {
    await refreshAllTests(controller, runnableLineCache, globDiscoveredFileItemIds)
    return
  }

  if (item.parent || !item.uri || item.uri.scheme !== 'file') {
    return
  }

  const existingOpenDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === item.uri!.toString()
  )
  const document = existingOpenDocument ?? (await vscode.workspace.openTextDocument(item.uri))

  await refreshDocumentTests(controller, runnableLineCache, globDiscoveredFileItemIds, document)
}

async function refreshWorkspaceDiscoveredFiles(
  controller: vscode.TestController,
  globDiscoveredFileItemIds: Set<string>,
  token?: vscode.CancellationToken
): Promise<void> {
  const discoveredFiles = new Map<string, vscode.Uri>()

  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    const discoveryConfiguration = getWorkspaceTestDiscoveryConfiguration(workspaceFolder)
    if (discoveryConfiguration.include.length === 0) {
      continue
    }

    const excludePattern = buildWorkspaceDiscoveryExcludePattern(
      workspaceFolder,
      discoveryConfiguration.exclude
    )
    const matches = await Promise.all(
      discoveryConfiguration.include.map((pattern) =>
        vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, pattern), excludePattern, undefined, token)
      )
    )

    for (const uri of matches.flat()) {
      if (uri.scheme !== 'file') {
        continue
      }

      discoveredFiles.set(getFileTestItemId(uri), uri)
    }
  }

  for (const [fileItemId, uri] of discoveredFiles) {
    globDiscoveredFileItemIds.add(fileItemId)
    ensurePlaceholderFileItem(controller, uri)
  }

  for (const fileItemId of Array.from(globDiscoveredFileItemIds)) {
    if (discoveredFiles.has(fileItemId)) {
      continue
    }

    globDiscoveredFileItemIds.delete(fileItemId)
    const fileItem = controller.items.get(fileItemId)
    if (!fileItem) {
      continue
    }

    const isOpen = vscode.workspace.textDocuments.some((document) => getFileTestItemId(document.uri) === fileItemId)
    if (isOpen) {
      continue
    }

    controller.items.delete(fileItemId)
  }
}

function scheduleRefresh(
  controller: vscode.TestController,
  pendingRefreshes: Map<string, NodeJS.Timeout>,
  runnableLineCache: Map<string, readonly number[]>,
  globDiscoveredFileItemIds: Set<string>,
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
      void refreshDocumentTests(controller, runnableLineCache, globDiscoveredFileItemIds, document)
    }, REFRESH_DEBOUNCE_MS)
  )
}

async function refreshDocumentTests(
  controller: vscode.TestController,
  runnableLineCache: Map<string, readonly number[]>,
  globDiscoveredFileItemIds: Set<string>,
  document: vscode.TextDocument
): Promise<void> {
  if (!isSupportedTestDocument(document)) {
    return
  }

  const documentKey = document.uri.toString()
  const fileItemId = getFileTestItemId(document.uri)
  const keepPlaceholderFileItem = globDiscoveredFileItemIds.has(fileItemId)
  const existingFileItem = controller.items.get(fileItemId)

  if (document.lineCount === 0) {
    runnableLineCache.delete(documentKey)
    handleUnavailableResolvedFileItem(controller, existingFileItem, keepPlaceholderFileItem)
    return
  }

  let header
  try {
    header = parseHeaderLine(document.lineAt(0).text)
  } catch {
    runnableLineCache.delete(documentKey)
    if (keepPlaceholderFileItem) {
      const fileItem = existingFileItem ?? ensurePlaceholderFileItem(controller, document.uri)
      resetPlaceholderFileItem(controller, fileItem)
      fileItem.error = 'No valid SYNTAX TEST header found.'
      fileItem.canResolveChildren = true
    } else {
      handleUnavailableResolvedFileItem(controller, existingFileItem, false)
    }
    return
  }

  const lines = splitIntoLines(document.getText())
  const runnableSourceLines = collectRunnableSourceLinesFromLines(lines, header.commentToken)
  if (runnableSourceLines.length === 0) {
    runnableLineCache.delete(documentKey)
    handleUnavailableResolvedFileItem(controller, existingFileItem, keepPlaceholderFileItem)
    return
  }

  let fileItem = existingFileItem
  if (!fileItem) {
    fileItem = ensurePlaceholderFileItem(controller, document.uri)
  }

  runnableLineCache.set(documentKey, runnableSourceLines.map((line) => line.documentLine))
  fileItem.busy = false
  fileItem.canResolveChildren = false
  fileItem.error = undefined
  fileItem.range = new vscode.Range(document.lineAt(0).range.start, document.lineAt(0).range.end)
  syncFileItemChildren(controller, fileItem, document, runnableSourceLines)
}

function createTestRunExecutionContext(): TestRunExecutionContext {
  return {
    localGrammarLoads: new Map(),
    providerGrammarLoads: new Map(),
    registries: new Map()
  }
}

function getOrCreateRegistry(
  grammars: readonly { injectTo?: string[]; language?: string; path: string; scopeName: string }[],
  executionContext: TestRunExecutionContext
): unknown {
  const cacheKey = JSON.stringify(
    grammars.map((grammar) => ({
      injectTo: grammar.injectTo ?? [],
      language: grammar.language ?? '',
      path: grammar.path,
      scopeName: grammar.scopeName
    }))
  )
  const cachedRegistry = executionContext.registries.get(cacheKey)
  if (cachedRegistry) {
    return cachedRegistry
  }

  const registryStopwatch = startStopwatch()
  const registry = getVscodeTmgrammarTestRuntime().createRegistry(grammars)
  executionContext.registries.set(cacheKey, registry)
  logInfo(`Testing registry created in ${formatDuration(registryStopwatch())}.`)
  return registry
}

async function loadTestContext(
  document: vscode.TextDocument,
  executionContext: TestRunExecutionContext
): Promise<{ grammars: Array<{ injectTo?: string[]; language?: string; path: string; scopeName: string }> }> {
  const stopwatch = startStopwatch()
  const configuration = getEffectiveTmGrammarConfiguration(document)
  const autoLoadInstalledGrammars = configuration.get<boolean>('autoLoadInstalledGrammars') ?? true
  const logGrammarDetails = configuration.get<boolean>('logGrammarDetails') ?? false
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  if (!workspaceFolder && !configuration.usesWorkspaceScopedSettings && vscode.workspace.workspaceFolders?.length) {
    logInfo('The active test file is outside the current workspace; using only global/default tmGrammarTestTools settings.')
  }

  const localConfigStopwatch = startStopwatch()
  const localGrammars = await loadOptionalLocalGrammarContributions(document, executionContext)
  if (localGrammars.length > 0) {
    logInfo(`Testing loaded local grammar config in ${formatDuration(localConfigStopwatch())}.`)
  }

  const header = parseHeaderLine(document.lineAt(0).text)
  const providerGrammars = await loadProviderGrammarContributions(
    document,
    header.scopeName,
    executionContext.providerGrammarLoads
  )
  const installedGrammarStopwatch = startStopwatch()
  const installedGrammars = autoLoadInstalledGrammars
    ? (executionContext.installedGrammars ??= loadInstalledGrammarContributions())
    : []
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

async function loadOptionalLocalGrammarContributions(
  document: vscode.TextDocument,
  executionContext: TestRunExecutionContext
) {
  const configPath = await tryResolveConfigPath(document)
  if (!configPath) {
    logInfo('No local package.json grammar config found for the test target document.')
    return []
  }

  logInfo(`Using local grammar config for testing: ${configPath}`)

  const cachedLoad =
    executionContext.localGrammarLoads.get(configPath) ?? loadGrammarContributions(configPath)
  executionContext.localGrammarLoads.set(configPath, cachedLoad)
  return cachedLoad
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
  // vscode.TestRun.appendOutput requires CRLF.
  const normalizedLines = lines.map((line) => line.replace(/\r?\n/g, '\r\n'))
  return `${normalizedLines.join('\r\n')}\r\n`
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

function getTestRunLabelPath(uri: vscode.Uri): string {
  if (uri.scheme !== 'file') {
    return path.basename(uri.path || uri.toString())
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
  if (!workspaceFolder) {
    return path.basename(uri.fsPath)
  }

  const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
  const normalizedRelativePath = relativePath.replace(/\\/g, '/')
  if (normalizedRelativePath.length === 0) {
    return path.basename(uri.fsPath)
  }

  if ((vscode.workspace.workspaceFolders?.length ?? 0) > 1) {
    return `${workspaceFolder.name}/${normalizedRelativePath}`
  }

  return normalizedRelativePath
}

function getAbsoluteLogTargetPath(uri: vscode.Uri): string {
  return uri.scheme === 'file' ? uri.fsPath : uri.toString()
}

function ensurePlaceholderFileItem(controller: vscode.TestController, uri: vscode.Uri): vscode.TestItem {
  const fileItemId = getFileTestItemId(uri)
  const existingFileItem = controller.items.get(fileItemId)
  if (existingFileItem) {
    return existingFileItem
  }

  const fileItem = controller.createTestItem(fileItemId, path.basename(uri.fsPath || uri.path), uri)
  fileItem.canResolveChildren = true
  controller.items.add(fileItem)
  return fileItem
}

function syncFileItemChildren(
  controller: vscode.TestController,
  fileItem: vscode.TestItem,
  document: vscode.TextDocument,
  runnableSourceLines: readonly RunnableSourceLine[]
): void {
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

function handleUnavailableResolvedFileItem(
  controller: vscode.TestController,
  fileItem: vscode.TestItem | undefined,
  keepPlaceholderFileItem: boolean
): void {
  if (!fileItem) {
    return
  }

  if (keepPlaceholderFileItem) {
    resetPlaceholderFileItem(controller, fileItem)
    return
  }

  resetTestResults(controller, [fileItem, ...Array.from(fileItem.children).map(([, item]) => item)])
  controller.invalidateTestResults(fileItem)
  controller.items.delete(fileItem.id)
}

function resetPlaceholderFileItem(controller: vscode.TestController, fileItem: vscode.TestItem): void {
  const childItems = Array.from(fileItem.children).map(([, item]) => item)
  if (childItems.length > 0) {
    resetTestResults(controller, [fileItem, ...childItems])
    controller.invalidateTestResults(fileItem)
  }

  fileItem.busy = false
  fileItem.canResolveChildren = true
  fileItem.error = undefined
  fileItem.range = undefined
  fileItem.children.replace([])
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
