import * as vscode from 'vscode'
import { loadGrammarContributions, resolveConfigPath } from './grammarConfig'
import { loadInstalledGrammarContributions } from './installedGrammars'
import { renderAssertionBlock } from './render'
import { collectSourceLines, findAssertionBlock, findTargetSourceLine, parseHeaderLine } from './syntaxTest'
import { tokenizeSourceLine } from './textmate'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('tmGrammarTestTools.insertCaretAssertions', async (editor) => {
      try {
        await insertCaretAssertions(editor)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        void vscode.window.showErrorMessage(message)
      }
    })
  )
}

export function deactivate(): void {}

async function insertCaretAssertions(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document

  if (document.lineCount === 0) {
    throw new Error('Expected a syntax test file with a header line.')
  }

  const header = parseHeaderLine(document.lineAt(0).text)
  const sourceLines = collectSourceLines(document, header.commentToken)

  if (sourceLines.length === 0) {
    throw new Error('No source lines were found under the syntax test header.')
  }

  const targetSourceLine = findTargetSourceLine(sourceLines, editor.selection.active.line)

  if (!targetSourceLine) {
    throw new Error('Place the cursor on a source line or on its existing assertion block.')
  }

  const configPath = await resolveConfigPath(document)
  const localGrammars = await loadGrammarContributions(configPath)
  const grammars = [...loadInstalledGrammarContributions(), ...localGrammars]
  const targetSourceIndex = sourceLines.findIndex((line) => line.documentLine === targetSourceLine.documentLine)
  const tokens = await tokenizeSourceLine(grammars, header.scopeName, sourceLines, targetSourceIndex)
  const assertionLines = renderAssertionBlock(header.commentToken, targetSourceLine.text, tokens)
  const assertionBlock = findAssertionBlock(document, targetSourceLine.documentLine, header.commentToken)
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine

  if (assertionLines.length === 0 && !hasExistingBlock) {
    void vscode.window.showInformationMessage('No assertions were generated for the active source line.')
    return
  }

  const editApplied = await editor.edit((editBuilder) => {
    applyAssertionEdit(document, editBuilder, targetSourceLine.documentLine, assertionBlock, assertionLines)
  })

  if (!editApplied) {
    throw new Error('The editor rejected the assertion update.')
  }

  const action = hasExistingBlock ? (assertionLines.length === 0 ? 'Removed' : 'Replaced') : 'Inserted'
  vscode.window.setStatusBarMessage(`${action} caret assertions for line ${targetSourceLine.documentLine + 1}.`, 3000)
}

function applyAssertionEdit(
  document: vscode.TextDocument,
  editBuilder: vscode.TextEditorEdit,
  sourceLine: number,
  assertionBlock: { startLine: number; endLineExclusive: number },
  assertionLines: readonly string[]
): void {
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
  const renderedBlock = assertionLines.join(eol)

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
