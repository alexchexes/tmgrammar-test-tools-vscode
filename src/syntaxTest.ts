import * as vscode from 'vscode'

export interface TestHeader {
  commentToken: string
  scopeName: string
  description: string
}

export interface SourceLine {
  documentLine: number
  text: string
}

export interface SelectionLineTarget {
  activeLine: number
  endCharacter: number
  endLine: number
  isEmpty: boolean
  startLine: number
}

const HEADER_REGEX = /^([^\s]+)\s+SYNTAX\s+TEST\s+"([^"]+)"(?:\s+"([^"]+)")?\s*$/
const ASSERTION_REGEX = /^\s*(\^|<[~]*-)/

export function parseHeaderLine(line: string): TestHeader {
  const match = HEADER_REGEX.exec(line)
  if (!match) {
    throw new Error(
      'Expected the first line in the syntax test file to match: <comment token> SYNTAX TEST "<language scope>" "optional description"'
    )
  }

  const [, commentToken, scopeName, description = ''] = match
  return {
    commentToken,
    scopeName,
    description
  }
}

export function isAssertionLine(line: string, commentToken: string): boolean {
  return line.startsWith(commentToken) && ASSERTION_REGEX.test(line.slice(commentToken.length))
}

export function collectSourceLines(document: vscode.TextDocument, commentToken: string): SourceLine[] {
  const sourceLines: SourceLine[] = []

  for (let lineNumber = 1; lineNumber < document.lineCount; lineNumber++) {
    const text = document.lineAt(lineNumber).text
    if (!isAssertionLine(text, commentToken)) {
      sourceLines.push({
        documentLine: lineNumber,
        text
      })
    }
  }

  return sourceLines
}

export function findTargetSourceLine(sourceLines: readonly SourceLine[], anchorLine: number): SourceLine | undefined {
  let candidate: SourceLine | undefined

  for (const sourceLine of sourceLines) {
    if (sourceLine.documentLine > anchorLine) {
      break
    }

    candidate = sourceLine
  }

  return candidate
}

export function findTargetSourceLinesForSelections(
  sourceLines: readonly SourceLine[],
  selections: readonly SelectionLineTarget[]
): SourceLine[] {
  const targetSourceLines = new Map<number, SourceLine>()

  for (const selection of selections) {
    for (const lineNumber of getTouchedDocumentLines(selection)) {
      const sourceLine = findTargetSourceLine(sourceLines, lineNumber)
      if (sourceLine) {
        targetSourceLines.set(sourceLine.documentLine, sourceLine)
      }
    }
  }

  return [...targetSourceLines.values()].sort((left, right) => left.documentLine - right.documentLine)
}

function getTouchedDocumentLines(selection: SelectionLineTarget): number[] {
  if (selection.isEmpty) {
    return [selection.activeLine]
  }

  const endLineInclusive =
    selection.startLine === selection.endLine || selection.endCharacter > 0 ? selection.endLine : selection.endLine - 1

  if (endLineInclusive < selection.startLine) {
    return []
  }

  const lines: number[] = []
  for (let lineNumber = selection.startLine; lineNumber <= endLineInclusive; lineNumber++) {
    lines.push(lineNumber)
  }

  return lines
}

export function findAssertionBlock(
  document: vscode.TextDocument,
  sourceLine: number,
  commentToken: string
): { startLine: number; endLineExclusive: number } {
  const startLine = sourceLine + 1
  let endLineExclusive = startLine

  while (
    endLineExclusive < document.lineCount &&
    isAssertionLine(document.lineAt(endLineExclusive).text, commentToken)
  ) {
    endLineExclusive++
  }

  return {
    startLine,
    endLineExclusive
  }
}
