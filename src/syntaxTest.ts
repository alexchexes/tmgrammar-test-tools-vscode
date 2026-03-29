import * as vscode from 'vscode'
import { collectSourceLinesFromLines, isAssertionLine } from './syntaxTestCore'

export {
  findTargetSourceLine,
  findTargetSourceLinesForSelections,
  isAssertionLine,
  parseHeaderLine
} from './syntaxTestCore'
export type { SelectionLineTarget, SourceLine, TestHeader } from './syntaxTestCore'

export function collectSourceLines(document: vscode.TextDocument, commentToken: string) {
  const lines = Array.from({ length: document.lineCount }, (_, lineNumber) => document.lineAt(lineNumber).text)
  return collectSourceLinesFromLines(lines, commentToken)
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
