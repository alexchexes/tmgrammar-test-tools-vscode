import * as vscode from 'vscode'

const codeLensRefreshEmitter = new vscode.EventEmitter<void>()
const loadingCodeLensCounts = new Map<string, number>()

export const onDidChangeCodeLenses: vscode.Event<void> = codeLensRefreshEmitter.event

export function refreshCodeLenses(): void {
  codeLensRefreshEmitter.fire()
}

export function beginLoadingCodeLens(documentUri: vscode.Uri, sourceDocumentLine: number): () => void {
  const key = getLoadingCodeLensKey(documentUri, sourceDocumentLine)
  loadingCodeLensCounts.set(key, (loadingCodeLensCounts.get(key) ?? 0) + 1)
  refreshCodeLenses()

  let ended = false
  return () => {
    if (ended) {
      return
    }

    ended = true
    const nextCount = (loadingCodeLensCounts.get(key) ?? 0) - 1
    if (nextCount > 0) {
      loadingCodeLensCounts.set(key, nextCount)
    } else {
      loadingCodeLensCounts.delete(key)
    }

    refreshCodeLenses()
  }
}

export function isCodeLensLoading(documentUri: vscode.Uri, sourceDocumentLine: number): boolean {
  return (loadingCodeLensCounts.get(getLoadingCodeLensKey(documentUri, sourceDocumentLine)) ?? 0) > 0
}

export const codeLensControllerDisposable: vscode.Disposable = codeLensRefreshEmitter

function getLoadingCodeLensKey(documentUri: vscode.Uri, sourceDocumentLine: number): string {
  return `${documentUri.toString()}::${sourceDocumentLine}`
}
