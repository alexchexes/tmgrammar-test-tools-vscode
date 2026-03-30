import * as vscode from 'vscode'
import { SourceLine } from './syntaxTest'

export type LineRefreshMode = 'replace' | 'safe'

export interface AssertionUpdate {
  assertionBlock: { startLine: number; endLineExclusive: number }
  appendInsertions?: readonly { beforeExistingIndex: number; assertionLines: readonly string[] }[]
  editMode: 'append' | 'replace'
  assertionLines: readonly string[]
  targetSourceLine: SourceLine
}

export function applyAssertionEdit(
  document: vscode.TextDocument,
  editBuilder: vscode.TextEditorEdit,
  sourceLine: number,
  assertionBlock: { startLine: number; endLineExclusive: number },
  assertionLines: readonly string[],
  editMode: 'append' | 'replace' = 'replace',
  appendInsertions: readonly { beforeExistingIndex: number; assertionLines: readonly string[] }[] = []
): void {
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
  const renderedBlock = assertionLines.join(eol)

  if (editMode === 'append' && hasExistingBlock) {
    if (appendInsertions.length === 0) {
      return
    }

    const existingAssertionLineCount = assertionBlock.endLineExclusive - assertionBlock.startLine
    for (const insertion of appendInsertions) {
      const insertionLine = assertionBlock.startLine + insertion.beforeExistingIndex
      const insertionText = insertion.assertionLines.join(eol)
      if (insertionText.length === 0) {
        continue
      }

      if (insertion.beforeExistingIndex < existingAssertionLineCount && insertionLine < document.lineCount) {
        editBuilder.insert(new vscode.Position(insertionLine, 0), `${insertionText}${eol}`)
        continue
      }

      const insertionPosition =
        assertionBlock.endLineExclusive < document.lineCount
          ? new vscode.Position(assertionBlock.endLineExclusive, 0)
          : document.lineAt(document.lineCount - 1).range.end
      const textAtEnd =
        assertionBlock.endLineExclusive < document.lineCount ? `${insertionText}${eol}` : `${eol}${insertionText}`
      editBuilder.insert(insertionPosition, textAtEnd)
    }
    return
  }

  if (hasExistingBlock) {
    const replacement =
      renderedBlock.length === 0 ? '' : appendTrailingEol(renderedBlock, eol, assertionBlock.endLineExclusive, document)
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

export function collectAssertionLines(
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
