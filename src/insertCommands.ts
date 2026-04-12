import * as vscode from 'vscode'
import { generateLineAssertionBlock, generateRangeAssertionBlock } from './assertionGenerator'
import { applyAssertionEdit, AssertionUpdate, collectAssertionLines, LineRefreshMode } from './assertionEdits'
import { codeLensControllerDisposable, refreshCodeLenses } from './codeLensController'
import { buildRejectedAssertionUpdateMessage } from './insertCommandCore'
import { parseInsertCommandArgs } from './insertCommandArgs'
import { loadInsertContext, logTargetTabWarning } from './insertContext'
import { createDelayedInsertFeedback } from './insertProgress'
import { mergeSafeRefreshAssertionLines, planAppendAssertionInsertions } from './assertionRefresh'
import { formatDuration, logError, logInfo, logRunBoundary, startStopwatch } from './log'
import { ScopeMode } from './render'
import { InsertTargetMode, resolveInsertTargets, ResolvedInsertTargets } from './selectionIntent'
import { coversWholeLine, SelectionInput, SelectionRangeTarget } from './selectionTargets'
import { findAssertionBlock, SourceLine } from './syntaxTest'

export { codeLensControllerDisposable }

export function registerInsertCommand(
  commandId: string,
  targetMode: InsertTargetMode,
  scopeModeOverride?: ScopeMode,
  lineRefreshMode: LineRefreshMode = 'safe'
): vscode.Disposable {
  return vscode.commands.registerTextEditorCommand(commandId, async (editor, _edit, args) => {
    const commandArgs = parseInsertCommandArgs(args)
    const commandLabel = buildInsertCommandLabel(targetMode, scopeModeOverride, lineRefreshMode)

    await runInsertCommand(commandLabel, async () => {
      await insertAssertions(
        editor,
        targetMode,
        scopeModeOverride,
        lineRefreshMode,
        commandArgs.targetSourceDocumentLine,
        commandArgs.requestedFromCodeLens,
        commandArgs.minimalHeaderScopeFactoring,
        commandArgs.minimalTailScopeCount
      )
    })
  })
}

async function insertAssertions(
  editor: vscode.TextEditor,
  targetMode: InsertTargetMode,
  scopeModeOverride?: ScopeMode,
  lineRefreshMode: LineRefreshMode = 'safe',
  targetSourceDocumentLine?: number,
  requestedFromCodeLens = false,
  minimalHeaderScopeFactoringOverride?: string,
  minimalTailScopeCountOverride?: number
): Promise<void> {
  const feedback = createDelayedInsertFeedback({
    codeLensDocumentUri:
      requestedFromCodeLens && typeof targetSourceDocumentLine === 'number' ? editor.document.uri : undefined,
    codeLensSourceDocumentLine: requestedFromCodeLens ? targetSourceDocumentLine : undefined
  })

  try {
    const preparedDocumentVersion = editor.document.version
    feedback.report('Loading grammars…')
    const context = await loadInsertContext(
      editor,
      scopeModeOverride,
      targetMode,
      minimalHeaderScopeFactoringOverride,
      minimalTailScopeCountOverride
    )
    const resolvedTargets = resolveInsertTargets(
      context.sourceLines,
      editor.selections.map(toSelectionInput),
      targetMode,
      {
        targetSourceDocumentLine
      }
    )
    logResolvedTargets(resolvedTargets)

    if (resolvedTargets.lineTargets.length === 0 && resolvedTargets.rangeTargets.length === 0) {
      throw new Error(resolveNoTargetsMessage(targetMode))
    }

    logTargetTabWarning(
      context.document,
      collectTargetDocumentLines(resolvedTargets),
      context.assertionGenerationContext.commentToken,
      'targeted source/assertion'
    )

    const generationStopwatch = startStopwatch()
    feedback.report('Generating assertions…')
    const sourceLineIndexes = new Map(context.sourceLines.map((line, index) => [line.documentLine, index]))
    const lineUpdates = await prepareLineAssertionUpdates(
      context,
      sourceLineIndexes,
      resolvedTargets.lineTargets,
      lineRefreshMode
    )
    const rangeResult = await prepareRangeAssertionUpdates(context, sourceLineIndexes, resolvedTargets.rangeTargets)
    const updates = [...lineUpdates, ...rangeResult.updates].sort(
      (left, right) => left.targetSourceLine.documentLine - right.targetSourceLine.documentLine
    )

    if (updates.length === 0) {
      void vscode.window.showInformationMessage(buildNoAssertionsGeneratedMessage(resolvedTargets, rangeResult.skipReasons))
      return
    }

    logInfo(`Prepared ${updates.length} assertion update(s) in ${formatDuration(generationStopwatch())}.`)

    const editStopwatch = startStopwatch()
    if (editor.document.version !== preparedDocumentVersion) {
      throw new Error(buildRejectedAssertionUpdateMessage(preparedDocumentVersion, editor.document.version))
    }

    feedback.report('Applying assertion edit…')
    const editApplied = await editor.edit((editBuilder) => {
      for (const update of updates) {
        applyAssertionEdit(
          context.document,
          editBuilder,
          update.targetSourceLine.documentLine,
          update.assertionBlock,
          update.assertionLines,
          update.editMode,
          update.appendInsertions
        )
      }
    })

    if (!editApplied) {
      throw new Error(buildRejectedAssertionUpdateMessage(preparedDocumentVersion, editor.document.version))
    }

    logInfo(`Applied assertion edit in ${formatDuration(editStopwatch())}.`)
    refreshCodeLenses()
    vscode.window.setStatusBarMessage(buildSuccessMessage(resolvedTargets, updates.length), 3000)
  } finally {
    await feedback.dispose()
  }
}

async function prepareLineAssertionUpdates(
  context: Awaited<ReturnType<typeof loadInsertContext>>,
  sourceLineIndexes: ReadonlyMap<number, number>,
  targetSourceLines: readonly SourceLine[],
  lineRefreshMode: LineRefreshMode
): Promise<AssertionUpdate[]> {
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

  return updates
}

async function prepareRangeAssertionUpdates(
  context: Awaited<ReturnType<typeof loadInsertContext>>,
  sourceLineIndexes: ReadonlyMap<number, number>,
  selectionTargets: readonly SelectionRangeTarget[]
): Promise<{ skipReasons: string[]; updates: AssertionUpdate[] }> {
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
    const shouldMergeAppend = hasExistingBlock && !isWholeLineTarget
    const appendInsertions =
      shouldMergeAppend
        ? planAppendAssertionInsertions(
            context.assertionGenerationContext.commentToken,
            existingAssertionLines,
            generated.assertionLines
          )
        : []
    const assertionLines =
      shouldMergeAppend
        ? []
        : mergeSafeRefreshAssertionLines(
            context.assertionGenerationContext.commentToken,
            existingAssertionLines,
            generated.assertionLines
          )

    if (shouldMergeAppend && appendInsertions.length === 0) {
      skipReasons.push(`line ${selectionTarget.sourceLine.documentLine + 1}: generated assertions already exist in the block`)
      continue
    }

    if (assertionLines.length === 0 && !hasExistingBlock) {
      skipReasons.push(
        `line ${selectionTarget.sourceLine.documentLine + 1}: the selected range produced no assertion lines`
      )
      continue
    }

    updates.push({
      assertionBlock,
      editMode: shouldMergeAppend ? 'append' : 'replace',
      assertionLines,
      appendInsertions,
      targetSourceLine: selectionTarget.sourceLine
    })
  }

  return {
    skipReasons,
    updates
  }
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

function buildInsertCommandLabel(
  targetMode: InsertTargetMode,
  scopeModeOverride: ScopeMode | undefined,
  lineRefreshMode: LineRefreshMode
): string {
  const scopeModeLabel = scopeModeOverride ?? 'configured'

  switch (targetMode) {
    case 'range':
      return `range assertions (${scopeModeLabel})`
    case 'auto':
      return `insert assertions (${scopeModeLabel})`
    case 'line':
    default:
      return `${lineRefreshMode === 'replace' ? 'replace line' : 'line'} assertions (${scopeModeLabel})`
  }
}

function logResolvedTargets(resolvedTargets: ResolvedInsertTargets): void {
  logInfo(
    `Line target source lines: ${
      resolvedTargets.lineTargets.length > 0
        ? resolvedTargets.lineTargets.map((line) => line.documentLine + 1).join(', ')
        : '<none>'
    }`
  )
  logInfo(
    `Range target source lines: ${
      resolvedTargets.rangeTargets.length > 0
        ? resolvedTargets.rangeTargets.map((target) => target.sourceLine.documentLine + 1).join(', ')
        : '<none>'
    }`
  )
}

function collectTargetDocumentLines(resolvedTargets: ResolvedInsertTargets): number[] {
  return [...new Set([
    ...resolvedTargets.lineTargets.map((line) => line.documentLine),
    ...resolvedTargets.rangeTargets.map((target) => target.sourceLine.documentLine)
  ])].sort((left, right) => left - right)
}

function buildNoAssertionsGeneratedMessage(
  resolvedTargets: ResolvedInsertTargets,
  skipReasons: readonly string[]
): string {
  let message = 'No assertions were generated for the targeted source lines.'

  if (resolvedTargets.lineTargets.length === 0 && resolvedTargets.rangeTargets.length > 0) {
    message = 'No assertions were generated for the targeted selection ranges.'
  } else if (resolvedTargets.lineTargets.length > 0 && resolvedTargets.rangeTargets.length > 0) {
    message = 'No assertions were generated for the targeted source lines or selection ranges.'
  }

  if (skipReasons.length > 0) {
    return `${message} ${skipReasons.join('; ')}.`
  }

  return message
}

function buildSuccessMessage(resolvedTargets: ResolvedInsertTargets, updatedLineCount: number): string {
  if (resolvedTargets.lineTargets.length === 0 && resolvedTargets.rangeTargets.length > 0) {
    return `Updated assertions for ${updatedLineCount} source line${updatedLineCount === 1 ? '' : 's'} from the current range.`
  }

  return `Updated assertions for ${updatedLineCount} source line${updatedLineCount === 1 ? '' : 's'}.`
}

function resolveNoTargetsMessage(targetMode: InsertTargetMode): string {
  switch (targetMode) {
    case 'range':
      return 'Place the cursor on source text, or select source text to update.'
    case 'auto':
      return 'Place the cursor on a source line, or select source text to update.'
    case 'line':
    default:
      return 'Place the cursor on a source line or its assertion block, or select source lines to update.'
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

function describeEmptyRangeTarget(selectionTarget: SelectionRangeTarget): string {
  const lineNumber = selectionTarget.sourceLine.documentLine + 1

  if (selectionTarget.explicitRanges.length === 0 && selectionTarget.cursorPositions.length > 0) {
    return `line ${lineNumber}: no token was found at the cursor position`
  }

  return `line ${lineNumber}: the selected range resolved to no tokenized content`
}
