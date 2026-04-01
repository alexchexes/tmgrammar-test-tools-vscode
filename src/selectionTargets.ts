import type * as tm from 'vscode-textmate'
import { findTargetSourceLine, SourceLine } from './syntaxTestCore'

export interface CharacterRange {
  startIndex: number
  endIndex: number
}

export interface SelectionInput {
  activeCharacter: number
  activeLine: number
  endCharacter: number
  endLine: number
  isEmpty: boolean
  startCharacter: number
  startLine: number
}

export interface SelectionRangeTarget {
  cursorPositions: number[]
  explicitRanges: CharacterRange[]
  sourceLine: SourceLine
}

export function collectSelectionRangeTargets(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionInput[]
): SelectionRangeTarget[] {
  const targets = new Map<number, SelectionRangeTarget>()
  const sourceLinesByDocumentLine = new Map(sourceLines.map((sourceLine) => [sourceLine.documentLine, sourceLine]))

  for (const selection of selections) {
    if (selection.isEmpty) {
      const sourceLine = findTargetSourceLine(sourceLines, selection.activeLine)
      if (!sourceLine || sourceLine.documentLine !== selection.activeLine) {
        continue
      }

      getOrCreateSelectionRangeTarget(targets, sourceLine).cursorPositions.push(selection.activeCharacter)
      continue
    }

    const allowWhitespaceOnlySourceLines = isWhitespaceOnlySelection(selection, sourceLinesByDocumentLine)
    const endLineInclusive =
      selection.startLine === selection.endLine || selection.endCharacter > 0 ? selection.endLine : selection.endLine - 1

    for (let lineNumber = selection.startLine; lineNumber <= endLineInclusive; lineNumber++) {
      const sourceLine = findTargetSourceLine(sourceLines, lineNumber)
      if (
        !sourceLine ||
        sourceLine.documentLine !== lineNumber ||
        (sourceLine.text.trim().length === 0 && !allowWhitespaceOnlySourceLines)
      ) {
        continue
      }

      const rangeStart = lineNumber === selection.startLine ? selection.startCharacter : 0
      const rangeEnd =
        lineNumber === selection.endLine ? selection.endCharacter : sourceLine.text.length
      const clampedRange = clampRange(rangeStart, rangeEnd, sourceLine.text.length)

      if (!clampedRange || clampedRange.startIndex === clampedRange.endIndex) {
        continue
      }

      getOrCreateSelectionRangeTarget(targets, sourceLine).explicitRanges.push(clampedRange)
    }
  }

  return [...targets.values()]
    .map((target) => ({
      ...target,
      explicitRanges: mergeCharacterRanges(target.explicitRanges),
      cursorPositions: [...target.cursorPositions].sort((left, right) => left - right)
    }))
    .sort((left, right) => left.sourceLine.documentLine - right.sourceLine.documentLine)
}

function isWhitespaceOnlySelection(
  selection: SelectionInput,
  sourceLinesByDocumentLine: ReadonlyMap<number, SourceLine>
): boolean {
  if (selection.isEmpty) {
    return false
  }

  const endLineInclusive =
    selection.startLine === selection.endLine || selection.endCharacter > 0 ? selection.endLine : selection.endLine - 1

  if (endLineInclusive < selection.startLine) {
    return false
  }

  let foundWhitespaceOnlyLine = false

  for (let lineNumber = selection.startLine; lineNumber <= endLineInclusive; lineNumber++) {
    const sourceLine = sourceLinesByDocumentLine.get(lineNumber)
    if (!sourceLine || sourceLine.text.length === 0 || sourceLine.text.trim().length > 0) {
      return false
    }

    foundWhitespaceOnlyLine = true
  }

  return foundWhitespaceOnlyLine
}

export function resolveSelectionRanges(
  tokens: readonly tm.IToken[],
  lineText: string,
  target: SelectionRangeTarget
): CharacterRange[] {
  const tokenRanges = target.cursorPositions
    .map((cursorPosition) => resolveCursorRange(tokens, lineText, cursorPosition))
    .filter((range): range is CharacterRange => range !== undefined)

  return mergeCharacterRanges([...target.explicitRanges, ...tokenRanges])
}

export function clipTokensToRanges(tokens: readonly tm.IToken[], ranges: readonly CharacterRange[]): tm.IToken[] {
  const clippedTokens: tm.IToken[] = []
  const mergedRanges = mergeCharacterRanges(ranges)

  for (const token of tokens) {
    for (const range of mergedRanges) {
      const startIndex = Math.max(token.startIndex, range.startIndex)
      const endIndex = Math.min(token.endIndex, range.endIndex)

      if (endIndex > startIndex) {
        clippedTokens.push({
          endIndex,
          scopes: [...token.scopes],
          startIndex
        })
      }
    }
  }

  return clippedTokens
}

export function coversWholeLine(ranges: readonly CharacterRange[], lineLength: number): boolean {
  const mergedRanges = mergeCharacterRanges(ranges)
  return mergedRanges.length === 1 && mergedRanges[0].startIndex === 0 && mergedRanges[0].endIndex >= lineLength
}

export function mergeCharacterRanges(ranges: readonly CharacterRange[]): CharacterRange[] {
  const sortedRanges = [...ranges].sort((left, right) => {
    if (left.startIndex !== right.startIndex) {
      return left.startIndex - right.startIndex
    }

    return left.endIndex - right.endIndex
  })

  const mergedRanges: CharacterRange[] = []
  for (const range of sortedRanges) {
    const previousRange = mergedRanges.at(-1)
    if (!previousRange || range.startIndex > previousRange.endIndex) {
      mergedRanges.push({ ...range })
      continue
    }

    previousRange.endIndex = Math.max(previousRange.endIndex, range.endIndex)
  }

  return mergedRanges
}

function getOrCreateSelectionRangeTarget(
  targets: Map<number, SelectionRangeTarget>,
  sourceLine: SourceLine
): SelectionRangeTarget {
  let target = targets.get(sourceLine.documentLine)
  if (!target) {
    target = {
      cursorPositions: [],
      explicitRanges: [],
      sourceLine
    }
    targets.set(sourceLine.documentLine, target)
  }

  return target
}

function clampRange(startIndex: number, endIndex: number, lineLength: number): CharacterRange | undefined {
  const normalizedStartIndex = Math.max(0, Math.min(startIndex, lineLength))
  const normalizedEndIndex = Math.max(0, Math.min(endIndex, lineLength))

  if (normalizedEndIndex < normalizedStartIndex) {
    return undefined
  }

  return {
    endIndex: normalizedEndIndex,
    startIndex: normalizedStartIndex
  }
}

function resolveCursorRange(
  tokens: readonly tm.IToken[],
  lineText: string,
  cursorPosition: number
): CharacterRange | undefined {
  const normalizedCursorPosition = Math.max(0, Math.min(cursorPosition, lineText.length))
  const containingToken = tokens.find(
    (token) =>
      token.endIndex > token.startIndex &&
      normalizedCursorPosition >= token.startIndex &&
      normalizedCursorPosition < token.endIndex
  )

  if (containingToken) {
    return {
      endIndex: containingToken.endIndex,
      startIndex: containingToken.startIndex
    }
  }

  if (normalizedCursorPosition === lineText.length) {
    for (let index = tokens.length - 1; index >= 0; index--) {
      const token = tokens[index]
      if (token.endIndex > token.startIndex && token.endIndex === normalizedCursorPosition) {
        return {
          endIndex: token.endIndex,
          startIndex: token.startIndex
        }
      }
    }
  }

  return undefined
}
