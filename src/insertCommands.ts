import * as vscode from 'vscode'
import { generateLineAssertionBlock, generateRangeAssertionBlock } from './assertionGenerator'
import { applyAssertionEdit, AssertionUpdate, collectAssertionLines, LineRefreshMode } from './assertionEdits'
import { codeLensControllerDisposable, refreshCodeLenses } from './codeLensController'
import { loadInsertContext, logTargetTabWarning } from './insertContext'
import { mergeSafeRefreshAssertionLines, planAppendAssertionInsertions } from './assertionRefresh'
import { formatDuration, logError, logInfo, logRunBoundary, startStopwatch } from './log'
import { ScopeMode } from './render'
import { collectSelectionRangeTargets, coversWholeLine, SelectionInput } from './selectionTargets'
import { findAssertionBlock, findTargetSourceLinesForSelections, SelectionLineTarget } from './syntaxTest'

export { codeLensControllerDisposable }

export function registerInsertCommand(
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

  logTargetTabWarning(
    context.document,
    targetSourceLines.map((line) => line.documentLine),
    context.assertionGenerationContext.commentToken,
    'targeted source/assertion'
  )

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
    throw new Error('The editor rejected the assertion update.')
  }

  logInfo(`Applied line assertion edit in ${formatDuration(editStopwatch())}.`)
  refreshCodeLenses()
  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'}.`,
    3000
  )
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

  logTargetTabWarning(
    context.document,
    selectionTargets.map((target) => target.sourceLine.documentLine),
    context.assertionGenerationContext.commentToken,
    'targeted source/assertion'
  )

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

  if (updates.length === 0) {
    const detail = skipReasons.length > 0 ? ` ${skipReasons.join('; ')}.` : ''
    void vscode.window.showInformationMessage(`No assertions were generated for the targeted selection ranges.${detail}`)
    return
  }

  logInfo(`Prepared ${updates.length} range assertion update(s) in ${formatDuration(generationStopwatch())}.`)

  const editStopwatch = startStopwatch()
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
    throw new Error('The editor rejected the assertion update.')
  }

  logInfo(`Applied range assertion edit in ${formatDuration(editStopwatch())}.`)
  refreshCodeLenses()
  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'} from the current range.`,
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

function toSelectionLineTarget(selection: vscode.Selection): SelectionLineTarget {
  return {
    activeLine: selection.active.line,
    endCharacter: selection.end.character,
    endLine: selection.end.line,
    isEmpty: selection.isEmpty,
    startLine: selection.start.line
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

function describeEmptyRangeTarget(selectionTarget: ReturnType<typeof collectSelectionRangeTargets>[number]): string {
  const lineNumber = selectionTarget.sourceLine.documentLine + 1

  if (selectionTarget.explicitRanges.length === 0 && selectionTarget.cursorPositions.length > 0) {
    return `line ${lineNumber}: no token was found at the cursor position`
  }

  return `line ${lineNumber}: the selected range resolved to no tokenized content`
}
