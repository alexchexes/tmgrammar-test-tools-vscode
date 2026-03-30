import * as vscode from 'vscode'
import {
  AssertionGenerationContext,
  AssertionGenerationOptions,
  appendMissingAssertionLines,
  generateLineAssertionBlock,
  generateRangeAssertionBlock
} from './assertionGenerator'
import { mergeSafeRefreshAssertionLines } from './assertionRefresh'
import { collectAssertionCodeActionSpecs } from './codeActions'
import { collectLineCodeLensSpecs } from './codeLens'
import { codeLensControllerDisposable, onDidChangeCodeLenses, refreshCodeLenses } from './codeLensController'
import { loadGrammarContributions, tryResolveConfigPath } from './grammarConfig'
import {
  buildDetailedGrammarSourceEntries,
  buildGrammarSourceSet,
  SourcedGrammarContribution
} from './grammarSources'
import { loadProviderGrammarContributions } from './grammarProvider'
import { loadInstalledGrammarContributions } from './installedGrammars'
import { formatDuration, logError, logInfo, logRunBoundary, registerLogger, startStopwatch } from './log'
import { ScopeMode } from './render'
import { collectSelectionRangeTargets, coversWholeLine, SelectionInput } from './selectionTargets'
import { resolveScopeMode } from './scopeMode'
import {
  collectSourceLines,
  findAssertionBlock,
  findTargetSourceLinesForSelections,
  parseHeaderLine,
  SelectionLineTarget,
  SourceLine
} from './syntaxTest'
import { registerTestingController } from './testing'
import { resolveGrammarContributionScopes } from './textmate'

export function activate(context: vscode.ExtensionContext): void {
  registerLogger(context)
  context.subscriptions.push(codeLensControllerDisposable)
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertions', 'line'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertionsFull', 'line', 'full'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertionsMinimal', 'line', 'minimal'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.replaceLineAssertions', 'line', undefined, 'replace'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.replaceLineAssertionsFull', 'line', 'full', 'replace'))
  context.subscriptions.push(
    registerInsertCommand('tmGrammarTestTools.replaceLineAssertionsMinimal', 'line', 'minimal', 'replace')
  )
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertRangeAssertions', 'range'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertRangeAssertionsFull', 'range', 'full'))
  context.subscriptions.push(
    registerInsertCommand('tmGrammarTestTools.insertRangeAssertionsMinimal', 'range', 'minimal')
  )
  context.subscriptions.push(registerCodeActionsProvider())
  context.subscriptions.push(registerCodeLensProvider())
  context.subscriptions.push(registerCopyTestFailureMessageCommand())
  context.subscriptions.push(registerTestingController(context))
}

export function deactivate(): void {}

function registerInsertCommand(
  commandId: string,
  targetMode: 'line' | 'range',
  scopeModeOverride?: ScopeMode,
  lineRefreshMode: LineRefreshMode = 'safe'
): vscode.Disposable {
  return vscode.commands.registerTextEditorCommand(commandId, async (editor, _edit, args) => {
    const commandArgs = parseInsertCommandArgs(args)
    const commandLabel =
      targetMode === 'range'
        ? `range assertions (${scopeModeOverride ?? 'configured'})`
        : `${lineRefreshMode === 'replace' ? 'replace line' : 'line'} assertions (${scopeModeOverride ?? 'configured'})`

    if (targetMode === 'range') {
      await runInsertCommand(commandLabel, async () => {
        await insertRangeAssertions(editor, scopeModeOverride)
      })
      return
    }

    await runInsertCommand(commandLabel, async () => {
      await insertLineAssertions(editor, scopeModeOverride, lineRefreshMode, commandArgs.targetSourceDocumentLine)
    })
  })
}

function registerCodeActionsProvider(): vscode.Disposable {
  const providedCodeActionKinds = [vscode.CodeActionKind.QuickFix.append('tmGrammarTestTools')]

  return vscode.languages.registerCodeActionsProvider(
    [{ scheme: 'file' }, { scheme: 'untitled' }],
    {
      provideCodeActions(document, range) {
        const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
        if (!(configuration.get<boolean>('enableCodeActions') ?? true)) {
          return []
        }

        if (document.lineCount === 0) {
          return []
        }

        let header
        try {
          header = parseHeaderLine(document.lineAt(0).text)
        } catch {
          return []
        }

        const sourceLines = collectSourceLines(document, header.commentToken)
        if (sourceLines.length === 0) {
          return []
        }

        return collectAssertionCodeActionSpecs(
          sourceLines,
          [toSelectionLineTargetFromRange(range)],
          [toSelectionInputFromRange(range)]
        ).map((spec) => {
          const action = new vscode.CodeAction(spec.title, providedCodeActionKinds[0])
          action.command = {
            arguments: [],
            command: spec.commandId,
            title: spec.title
          }
          return action
        })
      }
    },
    {
      providedCodeActionKinds
    }
  )
}

function registerCodeLensProvider(): vscode.Disposable {
  return vscode.languages.registerCodeLensProvider(
    [{ scheme: 'file' }, { scheme: 'untitled' }],
    {
      onDidChangeCodeLenses,
      provideCodeLenses(document) {
        const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
        if (!(configuration.get<boolean>('enableCodeLens') ?? true)) {
          return []
        }

        if (document.lineCount === 0) {
          return []
        }

        let header
        try {
          header = parseHeaderLine(document.lineAt(0).text)
        } catch {
          return []
        }

        const sourceLines = collectSourceLines(document, header.commentToken)
        if (sourceLines.length === 0) {
          return []
        }

        return collectLineCodeLensSpecs(sourceLines).map((spec) => {
          // Anchor at the end of the line so inserts before the line do not temporarily remap
          // the lens to the insertion boundary while VS Code refreshes CodeLens positions.
          const position = document.lineAt(spec.sourceDocumentLine).range.end
          return new vscode.CodeLens(new vscode.Range(position, position), {
            arguments: [{ targetSourceDocumentLine: spec.sourceDocumentLine }],
            command: spec.commandId,
            title: spec.title
          })
        })
      }
    }
  )
}

function registerCopyTestFailureMessageCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('tmGrammarTestTools.copyTestFailureMessage', async (value) => {
    const message = getTestMessageText(value)
    if (!message) {
      return
    }

    await vscode.env.clipboard.writeText(message)
  })
}

async function insertLineAssertions(
  editor: vscode.TextEditor,
  scopeModeOverride?: ScopeMode,
  lineRefreshMode: LineRefreshMode = 'safe',
  targetSourceDocumentLine?: number
): Promise<void> {
  const context = await loadInsertContext(editor, scopeModeOverride, 'line')
  const targetSourceLines =
    targetSourceDocumentLine === undefined
      ? findTargetSourceLinesForSelections(context.sourceLines, editor.selections.map(toSelectionLineTarget))
      : context.sourceLines.filter((line) => line.documentLine === targetSourceDocumentLine)
  logInfo(
    `Target source lines: ${targetSourceLines.length > 0 ? targetSourceLines.map((line) => line.documentLine + 1).join(', ') : '<none>'}`
  )

  if (targetSourceLines.length === 0) {
    throw new Error('Place the cursor on a source line or its assertion block, or select source lines to update.')
  }

  const generationStopwatch = startStopwatch()
  const sourceLineIndexes = new Map(context.sourceLines.map((line, index) => [line.documentLine, index]))
  const updates: AssertionUpdate[] = []

  for (const targetSourceLine of targetSourceLines) {
    const targetSourceIndex = sourceLineIndexes.get(targetSourceLine.documentLine)
    if (targetSourceIndex === undefined) {
      continue
    }

    const assertionLines = await generateLineAssertionBlock(
      context.assertionGenerationContext,
      targetSourceIndex,
      context.assertionGenerationOptions
    )
    const assertionBlock = findAssertionBlock(
      context.document,
      targetSourceLine.documentLine,
      context.assertionGenerationContext.commentToken
    )
    const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
    const existingAssertionLines = hasExistingBlock
      ? collectAssertionLines(context.document, assertionBlock.startLine, assertionBlock.endLineExclusive)
      : []
    const refreshedAssertionLines =
      lineRefreshMode === 'safe'
        ? mergeSafeRefreshAssertionLines(
            context.assertionGenerationContext.commentToken,
            existingAssertionLines,
            assertionLines
          )
        : assertionLines

    if (refreshedAssertionLines.length === 0 && !hasExistingBlock) {
      continue
    }

    updates.push({
      assertionBlock,
      editMode: 'replace',
      assertionLines: refreshedAssertionLines,
      targetSourceLine
    })
  }

  if (updates.length === 0) {
    void vscode.window.showInformationMessage('No assertions were generated for the targeted source lines.')
    return
  }

  logInfo(`Prepared ${updates.length} line assertion update(s) in ${formatDuration(generationStopwatch())}.`)

  const editStopwatch = startStopwatch()
  let editApplied = false
  editApplied = await editor.edit((editBuilder) => {
    for (const update of updates) {
      applyAssertionEdit(
        context.document,
        editBuilder,
        update.targetSourceLine.documentLine,
        update.assertionBlock,
        update.assertionLines,
        update.editMode
      )
    }
  })

  if (!editApplied) {
    throw new Error('The editor rejected the assertion update.')
  }

  logInfo(`Applied line assertion edit in ${formatDuration(editStopwatch())}.`)
  refreshCodeLenses()
  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'}.`,
    3000
  )
}

async function runInsertCommand(commandLabel: string, operation: () => Promise<void>): Promise<void> {
  const stopwatch = startStopwatch()
  logRunBoundary(commandLabel, 'start')
  try {
    await operation()
    logInfo(`Command completed: ${commandLabel} in ${formatDuration(stopwatch())}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`${message}\nCommand failed after ${formatDuration(stopwatch())}: ${commandLabel}`)
    void vscode.window.showErrorMessage(message)
  } finally {
    logRunBoundary(commandLabel, 'end')
  }
}

async function insertRangeAssertions(editor: vscode.TextEditor, scopeModeOverride?: ScopeMode): Promise<void> {
  const context = await loadInsertContext(editor, scopeModeOverride, 'range')
  const selectionTargets = collectSelectionRangeTargets(context.sourceLines, editor.selections.map(toSelectionInput))
  logInfo(
    `Range target source lines: ${selectionTargets.length > 0 ? selectionTargets.map((target) => target.sourceLine.documentLine + 1).join(', ') : '<none>'}`
  )

  if (selectionTargets.length === 0) {
    throw new Error('Place the cursor on source text, or select source text to update.')
  }

  const generationStopwatch = startStopwatch()
  const sourceLineIndexes = new Map(context.sourceLines.map((line, index) => [line.documentLine, index]))
  const updates: AssertionUpdate[] = []
  const skipReasons: string[] = []

  for (const selectionTarget of selectionTargets) {
    const targetSourceIndex = sourceLineIndexes.get(selectionTarget.sourceLine.documentLine)
    if (targetSourceIndex === undefined) {
      continue
    }

    const generated = await generateRangeAssertionBlock(
      context.assertionGenerationContext,
      targetSourceIndex,
      selectionTarget,
      context.assertionGenerationOptions
    )
    const ranges = generated.ranges
    if (ranges.length === 0) {
      skipReasons.push(describeEmptyRangeTarget(selectionTarget))
      continue
    }

    const assertionBlock = findAssertionBlock(
      context.document,
      selectionTarget.sourceLine.documentLine,
      context.assertionGenerationContext.commentToken
    )
    const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
    const isWholeLineTarget = coversWholeLine(ranges, selectionTarget.sourceLine.text.length)
    const existingAssertionLines = hasExistingBlock
      ? collectAssertionLines(context.document, assertionBlock.startLine, assertionBlock.endLineExclusive)
      : []
    const editMode: AssertionUpdate['editMode'] = hasExistingBlock && !isWholeLineTarget ? 'append' : 'replace'
    const assertionLines =
      editMode === 'append'
        ? appendMissingAssertionLines(existingAssertionLines, generated.assertionLines)
        : mergeSafeRefreshAssertionLines(
            context.assertionGenerationContext.commentToken,
            existingAssertionLines,
            generated.assertionLines
          )

    if (assertionLines.length === 0 && (!hasExistingBlock || editMode === 'append')) {
      skipReasons.push(
        editMode === 'append'
          ? `line ${selectionTarget.sourceLine.documentLine + 1}: generated assertions already exist in the block`
          : `line ${selectionTarget.sourceLine.documentLine + 1}: the selected range produced no assertion lines`
      )
      continue
    }

    updates.push({
      assertionBlock,
      editMode,
      assertionLines,
      targetSourceLine: selectionTarget.sourceLine
    })
  }

  if (updates.length === 0) {
    const detail =
      skipReasons.length > 0 ? ` ${skipReasons.join('; ')}.` : ''
    void vscode.window.showInformationMessage(`No assertions were generated for the targeted selection ranges.${detail}`)
    return
  }

  logInfo(`Prepared ${updates.length} range assertion update(s) in ${formatDuration(generationStopwatch())}.`)

  const editStopwatch = startStopwatch()
  let editApplied = false
  editApplied = await editor.edit((editBuilder) => {
    for (const update of updates) {
      applyAssertionEdit(
        context.document,
        editBuilder,
        update.targetSourceLine.documentLine,
        update.assertionBlock,
        update.assertionLines,
        update.editMode
      )
    }
  })

  if (!editApplied) {
    throw new Error('The editor rejected the assertion update.')
  }

  logInfo(`Applied range assertion edit in ${formatDuration(editStopwatch())}.`)
  refreshCodeLenses()
  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'} from the current range.`,
    3000
  )
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

async function loadInsertContext(
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
  logEssentialGrammarSummary(sourcedGrammars, header.scopeName)
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

function logEssentialGrammarSummary(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  requestedScopeName: string
): void {
  const baseCandidates = collectScopeCandidates(sourcedGrammars, requestedScopeName)
  if (baseCandidates.length === 0) {
    logInfo(`Base grammar winner: ${requestedScopeName} -> <not found>`)
    return
  }

  const baseWinner = baseCandidates[baseCandidates.length - 1]
  logInfo(`Base grammar winner: ${requestedScopeName} -> ${formatSourcedGrammarEntry(baseWinner)}`)

  if (baseCandidates.length > 1) {
    logInfo(
      `Base grammar lower-priority candidates: ${baseCandidates
        .slice(0, -1)
        .map((entry) => formatSourcedGrammarEntry(entry))
        .join('; ')}`
    )
  }

  const { inheritedCount, specificInjections } = collectDirectInjectionWinners(sourcedGrammars, requestedScopeName)
  if (specificInjections.length > 0) {
    logInfo(
      `Direct injections for ${requestedScopeName}: ${specificInjections
        .map((entry) => `${entry.grammar.scopeName || '<no scope>'} -> ${formatSourcedGrammarEntry(entry)}`)
        .join('; ')}`
    )
  } else {
    logInfo(`Direct injections for ${requestedScopeName}: <none>`)
  }

  if (inheritedCount > 0) {
    logInfo(
      `Additional inherited injections via broader scopes: ${inheritedCount} winner(s). Enable tmGrammarTestTools.logGrammarDetails for the full trace.`
    )
  }
}

function collectDirectInjectionWinners(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  requestedScopeName: string
): {
  inheritedCount: number
  specificInjections: readonly SourcedGrammarContribution[]
} {
  const scopeChain = getScopeChain(requestedScopeName)
  const broaderScopes = new Set(scopeChain.slice(0, -1))
  const specificWinners: SourcedGrammarContribution[] = []
  let inheritedCount = 0

  for (const [, candidates] of groupInjectionCandidatesByScope(sourcedGrammars, scopeChain)) {
    const winner = candidates[candidates.length - 1]
    const injectTo = winner.grammar.injectTo ?? []
    if (injectTo.includes(requestedScopeName)) {
      specificWinners.push(winner)
      continue
    }

    if (injectTo.some((scope) => broaderScopes.has(scope))) {
      inheritedCount++
    }
  }

  specificWinners.sort((left, right) => left.grammar.scopeName.localeCompare(right.grammar.scopeName))
  return {
    inheritedCount,
    specificInjections: specificWinners
  }
}

function collectScopeCandidates(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  scopeName: string
): readonly SourcedGrammarContribution[] {
  return sourcedGrammars.filter((entry) => entry.grammar.scopeName === scopeName)
}

function groupInjectionCandidatesByScope(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  scopeChain: readonly string[]
): Map<string, SourcedGrammarContribution[]> {
  const groups = new Map<string, SourcedGrammarContribution[]>()
  for (const entry of sourcedGrammars) {
    const injectTo = entry.grammar.injectTo ?? []
    if (!injectTo.some((scope) => scopeChain.includes(scope))) {
      continue
    }

    const group = groups.get(entry.grammar.scopeName)
    if (group) {
      group.push(entry)
    } else {
      groups.set(entry.grammar.scopeName, [entry])
    }
  }

  return groups
}

function getScopeChain(scopeName: string): readonly string[] {
  const parts = scopeName.split('.')
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'))
}

function formatSourcedGrammarEntry(entry: SourcedGrammarContribution): string {
  const grammar = entry.grammar
  const language = grammar.language ? ` language=${grammar.language}` : ''
  const injectTo =
    grammar.injectTo && grammar.injectTo.length > 0 ? ` injectTo=${grammar.injectTo.join(',')}` : ''
  return `[${entry.source}] ${grammar.path}${language}${injectTo}`
}

async function resolveSourcedGrammarEntries(
  entries: readonly SourcedGrammarContribution[]
): Promise<readonly SourcedGrammarContribution[]> {
  if (!entries.some((entry) => entry.grammar.scopeName.length === 0)) {
    return entries
  }

  const resolvedGrammars = await resolveGrammarContributionScopes(entries.map((entry) => entry.grammar))
  return entries.map((entry, index) => ({
    ...entry,
    grammar: resolvedGrammars[index]
  }))
}

function toSelectionLineTarget(selection: vscode.Selection): SelectionLineTarget {
  return {
    activeLine: selection.active.line,
    endCharacter: selection.end.character,
    endLine: selection.end.line,
    isEmpty: selection.isEmpty,
    startLine: selection.start.line
  }
}

function toSelectionLineTargetFromRange(range: vscode.Range | vscode.Selection): SelectionLineTarget {
  const selection = range instanceof vscode.Selection ? range : undefined

  return {
    activeLine: selection?.active.line ?? range.end.line,
    endCharacter: range.end.character,
    endLine: range.end.line,
    isEmpty: range.isEmpty,
    startLine: range.start.line
  }
}

function toSelectionInput(selection: vscode.Selection): SelectionInput {
  return {
    activeCharacter: selection.active.character,
    activeLine: selection.active.line,
    endCharacter: selection.end.character,
    endLine: selection.end.line,
    isEmpty: selection.isEmpty,
    startCharacter: selection.start.character,
    startLine: selection.start.line
  }
}

function toSelectionInputFromRange(range: vscode.Range | vscode.Selection): SelectionInput {
  const selection = range instanceof vscode.Selection ? range : undefined

  return {
    activeCharacter: selection?.active.character ?? range.end.character,
    activeLine: selection?.active.line ?? range.end.line,
    endCharacter: range.end.character,
    endLine: range.end.line,
    isEmpty: range.isEmpty,
    startCharacter: range.start.character,
    startLine: range.start.line
  }
}

function parseInsertCommandArgs(value: unknown): { targetSourceDocumentLine?: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    'targetSourceDocumentLine' in value &&
    typeof value.targetSourceDocumentLine === 'number'
  ) {
    return {
      targetSourceDocumentLine: value.targetSourceDocumentLine
    }
  }

  return {}
}

function applyAssertionEdit(
  document: vscode.TextDocument,
  editBuilder: vscode.TextEditorEdit,
  sourceLine: number,
  assertionBlock: { startLine: number; endLineExclusive: number },
  assertionLines: readonly string[],
  editMode: 'append' | 'replace' = 'replace'
): void {
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
  const renderedBlock = assertionLines.join(eol)

  if (editMode === 'append' && hasExistingBlock) {
    if (renderedBlock.length === 0) {
      return
    }

    const insertionPosition =
      assertionBlock.endLineExclusive < document.lineCount
        ? new vscode.Position(assertionBlock.endLineExclusive, 0)
        : document.lineAt(document.lineCount - 1).range.end
    const insertionText =
      assertionBlock.endLineExclusive < document.lineCount ? renderedBlock + eol : eol + renderedBlock

    editBuilder.insert(insertionPosition, insertionText)
    return
  }

  if (hasExistingBlock) {
    const replacement = renderedBlock.length === 0 ? '' : appendTrailingEol(renderedBlock, eol, assertionBlock.endLineExclusive, document)
    editBuilder.replace(getLineBlockRange(document, assertionBlock.startLine, assertionBlock.endLineExclusive), replacement)
    return
  }

  if (renderedBlock.length === 0) {
    return
  }

  const insertionLine = sourceLine + 1
  if (insertionLine < document.lineCount) {
    editBuilder.insert(new vscode.Position(insertionLine, 0), renderedBlock + eol)
    return
  }

  editBuilder.insert(document.lineAt(sourceLine).range.end, eol + renderedBlock)
}

function appendTrailingEol(
  renderedBlock: string,
  eol: string,
  endLineExclusive: number,
  document: vscode.TextDocument
): string {
  return endLineExclusive < document.lineCount ? renderedBlock + eol : renderedBlock
}

function getLineBlockRange(document: vscode.TextDocument, startLine: number, endLineExclusive: number): vscode.Range {
  const start = new vscode.Position(startLine, 0)

  if (endLineExclusive < document.lineCount) {
    return new vscode.Range(start, new vscode.Position(endLineExclusive, 0))
  }

  return new vscode.Range(start, document.lineAt(document.lineCount - 1).range.end)
}

interface AssertionUpdate {
  assertionBlock: { startLine: number; endLineExclusive: number }
  editMode: 'append' | 'replace'
  assertionLines: readonly string[]
  targetSourceLine: SourceLine
}

interface InsertContext {
  assertionGenerationContext: AssertionGenerationContext
  assertionGenerationOptions: AssertionGenerationOptions
  document: vscode.TextDocument
  sourceLines: readonly SourceLine[]
}

function collectAssertionLines(
  document: vscode.TextDocument,
  startLine: number,
  endLineExclusive: number
): readonly string[] {
  const lines: string[] = []
  for (let lineNumber = startLine; lineNumber < endLineExclusive; lineNumber++) {
    lines.push(document.lineAt(lineNumber).text)
  }

  return lines
}

function describeEmptyRangeTarget(selectionTarget: ReturnType<typeof collectSelectionRangeTargets>[number]): string {
  const lineNumber = selectionTarget.sourceLine.documentLine + 1

  if (selectionTarget.explicitRanges.length === 0 && selectionTarget.cursorPositions.length > 0) {
    return `line ${lineNumber}: no token was found at the cursor position`
  }

  return `line ${lineNumber}: the selected range resolved to no tokenized content`
}

type LineRefreshMode = 'replace' | 'safe'

function getTestMessageText(value: unknown): string | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'object' &&
    value.message !== null &&
    'message' in value.message
  ) {
    const rawMessage = value.message.message
    if (typeof rawMessage === 'string') {
      return rawMessage
    }

    if (
      typeof rawMessage === 'object' &&
      rawMessage !== null &&
      'value' in rawMessage &&
      typeof rawMessage.value === 'string'
    ) {
      return rawMessage.value
    }
  }

  return undefined
}
