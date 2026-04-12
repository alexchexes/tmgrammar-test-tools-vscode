import * as vscode from 'vscode'
import { beginLoadingCodeLens } from './codeLensController'

export interface DelayedInsertFeedbackOptions {
  codeLensDocumentUri?: vscode.Uri
  codeLensSourceDocumentLine?: number
}

export interface DelayedInsertFeedback {
  dispose(): Promise<void>
  report(message: string): void
}

export function createDelayedInsertFeedback(options: DelayedInsertFeedbackOptions): DelayedInsertFeedback {
  let latestMessage = 'Preparing assertions…'
  let progress: vscode.Progress<{ increment?: number; message?: string }> | undefined
  let progressPromise: Thenable<void> | undefined
  let stopLoadingCodeLens: (() => void) | undefined
  let finish: (() => void) | undefined
  let disposed = false

  const completionPromise = new Promise<void>((resolve) => {
    finish = resolve
  })

  progressPromise = vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'TM Grammar Test Tools'
    },
    async (reportedProgress) => {
      progress = reportedProgress
      reportedProgress.report({ message: latestMessage })
      await completionPromise
    }
  )

  if (options.codeLensDocumentUri && typeof options.codeLensSourceDocumentLine === 'number') {
    stopLoadingCodeLens = beginLoadingCodeLens(options.codeLensDocumentUri, options.codeLensSourceDocumentLine)
  }

  return {
    async dispose() {
      if (disposed) {
        return
      }

      disposed = true
      stopLoadingCodeLens?.()
      stopLoadingCodeLens = undefined
      finish?.()
      await progressPromise
    },

    report(message: string) {
      latestMessage = message
      progress?.report({ message })
    }
  }
}
