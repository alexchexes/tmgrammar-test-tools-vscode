import { SelectionInput, SelectionRangeTarget, collectSelectionRangeTargets } from './selectionTargets'
import { findTargetSourceLinesForSelections, SourceLine } from './syntaxTestCore'

export type InsertTargetMode = 'auto' | 'line' | 'range'

export interface ResolvedInsertTargets {
  lineTargets: readonly SourceLine[]
  rangeTargets: readonly SelectionRangeTarget[]
}

export interface ResolveInsertTargetsOptions {
  targetSourceDocumentLine?: number
}

export function resolveInsertTargets(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[],
  targetMode: InsertTargetMode,
  options: ResolveInsertTargetsOptions = {}
): ResolvedInsertTargets {
  switch (targetMode) {
    case 'line':
      return {
        lineTargets: resolveLineTargets(sourceLines, selections, options.targetSourceDocumentLine),
        rangeTargets: []
      }
    case 'range':
      return {
        lineTargets: [],
        rangeTargets: resolveRangeTargets(sourceLines, selections, options.targetSourceDocumentLine)
      }
    case 'auto':
    default:
      return options.targetSourceDocumentLine === undefined
        ? resolveAutoInsertTargets(sourceLines, selections)
        : resolveAutoInsertTargetsForSourceLine(sourceLines, selections, options.targetSourceDocumentLine)
  }
}

function resolveLineTargets(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[],
  targetSourceDocumentLine?: number
): readonly SourceLine[] {
  if (targetSourceDocumentLine !== undefined) {
    return sourceLines.filter((line) => line.documentLine === targetSourceDocumentLine)
  }

  return findTargetSourceLinesForSelections(sourceLines, selections)
}

function resolveRangeTargets(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[],
  targetSourceDocumentLine?: number
): readonly SelectionRangeTarget[] {
  if (targetSourceDocumentLine === undefined) {
    return collectSelectionRangeTargets(sourceLines, selections)
  }

  const targetSourceLine = sourceLines.find((line) => line.documentLine === targetSourceDocumentLine)
  if (!targetSourceLine) {
    return []
  }

  return collectSelectionRangeTargets(
    sourceLines,
    restrictSelectionsToDocumentLine(selections, targetSourceLine.documentLine, targetSourceLine.text.length)
  )
}

function resolveAutoInsertTargets(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[]
): ResolvedInsertTargets {
  const candidateLineTargets = findTargetSourceLinesForSelections(sourceLines, selections)
  const candidateRangeTargets = collectSelectionRangeTargets(sourceLines, selections)
  const candidateSourceLines = new Map<number, SourceLine>()
  const rangeTargetsByDocumentLine = new Map<number, SelectionRangeTarget>()

  for (const lineTarget of candidateLineTargets) {
    candidateSourceLines.set(lineTarget.documentLine, lineTarget)
  }

  for (const rangeTarget of candidateRangeTargets) {
    candidateSourceLines.set(rangeTarget.sourceLine.documentLine, rangeTarget.sourceLine)
    rangeTargetsByDocumentLine.set(rangeTarget.sourceLine.documentLine, rangeTarget)
  }

  const lineTargets: SourceLine[] = []
  const rangeTargets: SelectionRangeTarget[] = []

  for (const sourceLine of [...candidateSourceLines.values()].sort((left, right) => left.documentLine - right.documentLine)) {
    const relevantSelections = restrictSelectionsToDocumentLine(
      selections,
      sourceLine.documentLine,
      sourceLine.text.length
    )
    if (shouldUseRangeIntent(relevantSelections, sourceLine.text.length)) {
      const rangeTarget = rangeTargetsByDocumentLine.get(sourceLine.documentLine)
      if (rangeTarget) {
        rangeTargets.push(rangeTarget)
        continue
      }
    }

    lineTargets.push(sourceLine)
  }

  return {
    lineTargets,
    rangeTargets
  }
}

function resolveAutoInsertTargetsForSourceLine(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[],
  targetSourceDocumentLine: number
): ResolvedInsertTargets {
  const targetSourceLine = sourceLines.find((line) => line.documentLine === targetSourceDocumentLine)
  if (!targetSourceLine) {
    return {
      lineTargets: [],
      rangeTargets: []
    }
  }

  const relevantSelections = restrictSelectionsToDocumentLine(
    selections,
    targetSourceLine.documentLine,
    targetSourceLine.text.length
  )
  if (!shouldUseRangeIntent(relevantSelections, targetSourceLine.text.length)) {
    return {
      lineTargets: [targetSourceLine],
      rangeTargets: []
    }
  }

  return {
    lineTargets: [],
    rangeTargets: collectSelectionRangeTargets(sourceLines, relevantSelections)
  }
}

function restrictSelectionsToDocumentLine(
  selections: readonly SelectionInput[],
  targetDocumentLine: number,
  lineLength: number
): SelectionInput[] {
  const relevantSelections: SelectionInput[] = []

  for (const selection of selections) {
    if (selection.isEmpty) {
      if (selection.activeLine !== targetDocumentLine) {
        continue
      }

      relevantSelections.push({
        activeCharacter: clampCharacter(selection.activeCharacter, lineLength),
        activeLine: targetDocumentLine,
        endCharacter: clampCharacter(selection.activeCharacter, lineLength),
        endLine: targetDocumentLine,
        isEmpty: true,
        startCharacter: clampCharacter(selection.activeCharacter, lineLength),
        startLine: targetDocumentLine
      })
      continue
    }

    const endLineInclusive =
      selection.startLine === selection.endLine || selection.endCharacter > 0 ? selection.endLine : selection.endLine - 1
    if (targetDocumentLine < selection.startLine || targetDocumentLine > endLineInclusive) {
      continue
    }

    const startCharacter = targetDocumentLine === selection.startLine ? selection.startCharacter : 0
    const endCharacter = targetDocumentLine === selection.endLine ? selection.endCharacter : lineLength
    const clampedStartCharacter = clampCharacter(startCharacter, lineLength)
    const clampedEndCharacter = clampCharacter(endCharacter, lineLength)
    if (clampedEndCharacter <= clampedStartCharacter) {
      continue
    }

    relevantSelections.push({
      activeCharacter: targetDocumentLine === selection.activeLine ? clampCharacter(selection.activeCharacter, lineLength) : clampedEndCharacter,
      activeLine: targetDocumentLine,
      endCharacter: clampedEndCharacter,
      endLine: targetDocumentLine,
      isEmpty: false,
      startCharacter: clampedStartCharacter,
      startLine: targetDocumentLine
    })
  }

  return relevantSelections
}

function shouldUseRangeIntent(selections: readonly SelectionInput[], lineLength: number): boolean {
  if (selections.length === 0) {
    return false
  }

  const cursorCount = selections.filter((selection) => selection.isEmpty).length
  const rangeSelections = selections.filter((selection) => !selection.isEmpty)

  if (rangeSelections.some((selection) => !coversWholeLineSelection(selection, lineLength))) {
    return true
  }

  if (cursorCount > 1 || rangeSelections.length > 1) {
    return true
  }

  return cursorCount > 0 && rangeSelections.length > 0
}

function coversWholeLineSelection(selection: SelectionInput, lineLength: number): boolean {
  return !selection.isEmpty && selection.startLine === selection.endLine && selection.startCharacter === 0 && selection.endCharacter >= lineLength
}

function clampCharacter(character: number, lineLength: number): number {
  return Math.max(0, Math.min(character, lineLength))
}
