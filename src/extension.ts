import * as vscode from 'vscode'
import {
  codeLensControllerDisposable,
  registerInsertCommand
} from './insertCommands'
import {
  registerCodeActionsProvider,
  registerCodeLensProvider,
  registerCopyTestFailureMessageCommand
} from './editorProviders'
import { registerLogger } from './log'
import { registerTestingController } from './testing'

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
