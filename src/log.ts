import * as vscode from 'vscode'
import { performance } from 'node:perf_hooks'

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

export function logRunBoundary(label: string, phase: 'start' | 'end'): void {
  const divider = phase === 'start' ? '=' : '-'
  outputChannel?.appendLine('')
  outputChannel?.appendLine(`[info] ${divider.repeat(12)} ${phase.toUpperCase()}: ${label} ${divider.repeat(12)}`)
}

export function startStopwatch(): () => number {
  const startedAt = performance.now()
  return () => performance.now() - startedAt
}

export function formatDuration(durationMs: number): string {
  return `${durationMs.toFixed(durationMs >= 100 ? 0 : durationMs >= 10 ? 1 : 2)} ms`
}
