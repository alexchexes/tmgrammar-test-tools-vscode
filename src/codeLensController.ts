import * as vscode from 'vscode'

const codeLensRefreshEmitter = new vscode.EventEmitter<void>()

export const onDidChangeCodeLenses: vscode.Event<void> = codeLensRefreshEmitter.event

export function refreshCodeLenses(): void {
  codeLensRefreshEmitter.fire()
}

export const codeLensControllerDisposable: vscode.Disposable = codeLensRefreshEmitter
