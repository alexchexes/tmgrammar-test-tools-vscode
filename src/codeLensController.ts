import * as vscode from 'vscode'

const changeEmitter = new vscode.EventEmitter<void>()
const suspendedSourceLines = new Set<number>()

export const onDidChangeCodeLenses = changeEmitter.event

export function isCodeLensSuspendedForSourceLine(sourceDocumentLine: number): boolean {
  return suspendedSourceLines.has(sourceDocumentLine)
}

export function suspendCodeLensForSourceLine(sourceDocumentLine: number): void {
  if (suspendedSourceLines.has(sourceDocumentLine)) {
    return
  }

  suspendedSourceLines.add(sourceDocumentLine)
  changeEmitter.fire()
}

export function resumeCodeLensForSourceLine(sourceDocumentLine: number): void {
  if (!suspendedSourceLines.delete(sourceDocumentLine)) {
    return
  }

  changeEmitter.fire()
}
