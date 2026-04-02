import * as vscode from 'vscode'
import { collectAssertionCodeActionSpecs } from './codeActions'
import { collectLineCodeLensSpecs } from './codeLens'
import { onDidChangeCodeLenses } from './codeLensController'
import { SelectionInput } from './selectionTargets'
import { getEffectiveTmGrammarConfiguration } from './settings'
import { collectSourceLines, parseHeaderLine, SelectionLineTarget } from './syntaxTest'
import { registerTestMessageCommands } from './testMessageActions'

export function registerCodeActionsProvider(): vscode.Disposable {
  const providedCodeActionKinds = [vscode.CodeActionKind.QuickFix.append('tmGrammarTestTools')]

  return vscode.languages.registerCodeActionsProvider(
    [{ scheme: 'file' }, { scheme: 'untitled' }],
    {
      provideCodeActions(document, range) {
        const configuration = getEffectiveTmGrammarConfiguration(document)
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

export function registerCodeLensProvider(): vscode.Disposable {
  return vscode.languages.registerCodeLensProvider(
    [{ scheme: 'file' }, { scheme: 'untitled' }],
    {
      onDidChangeCodeLenses,
      provideCodeLenses(document) {
        const configuration = getEffectiveTmGrammarConfiguration(document)
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

export const registerTestFailureMessageCommands = registerTestMessageCommands

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
