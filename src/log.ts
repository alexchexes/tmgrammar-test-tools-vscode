import * as vscode from 'vscode'

let outputChannel: vscode.OutputChannel | undefined

export function registerLogger(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('TM Grammar Test Tools')
  context.subscriptions.push(outputChannel)
}

export function logInfo(message: string): void {
  outputChannel?.appendLine(`[info] ${message}`)
}

export function logError(message: string): void {
  outputChannel?.appendLine(`[error] ${message}`)
}

export function revealLogs(): void {
  outputChannel?.show(true)
}
