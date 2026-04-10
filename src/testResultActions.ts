import * as vscode from 'vscode'
import { getTestMessageText } from './testMessageActionsCore'

interface StoredResultFailure {
  detailText: string
  outputSummary: string
}

const storedResultFailuresByTestItemId = new Map<string, readonly StoredResultFailure[]>()

export function rememberTestResultFailures(
  testItem: vscode.TestItem,
  renderedFailures: readonly {
    message: vscode.TestMessage
    outputSummary: string
  }[]
): void {
  if (renderedFailures.length === 0) {
    storedResultFailuresByTestItemId.delete(testItem.id)
    return
  }

  storedResultFailuresByTestItemId.set(
    testItem.id,
    renderedFailures.map((failure) => ({
      detailText: getTestMessageText(failure.message) ?? failure.outputSummary,
      outputSummary: failure.outputSummary
    }))
  )
}

export function rememberTestResultError(
  testItem: vscode.TestItem,
  message: string
): void {
  if (message.length === 0) {
    storedResultFailuresByTestItemId.delete(testItem.id)
    return
  }

  storedResultFailuresByTestItemId.set(testItem.id, [
    {
      detailText: message,
      outputSummary: message.split(/\r?\n/, 1)[0] ?? message
    }
  ])
}

export function forgetTestResultFailures(items: readonly vscode.TestItem[]): void {
  for (const item of items) {
    storedResultFailuresByTestItemId.delete(item.id)
  }
}

export function registerTestResultCommands(
  controller: vscode.TestController
): vscode.Disposable {
  return vscode.commands.registerCommand('tmGrammarTestTools.copyTestResultErrors', async (testItem) => {
    const sections = collectResultCopySections(controller, testItem)
    if (sections.length === 0) {
      return
    }

    await vscode.env.clipboard.writeText(sections.join(`\n${'='.repeat(50)}\n\n`))
  })
}

function collectResultCopySections(
  controller: vscode.TestController,
  testItem: unknown
): string[] {
  if (isTestItem(testItem)) {
    return collectResultCopySectionsForItem(testItem)
  }

  const sections: string[] = []
  for (const [, item] of controller.items) {
    sections.push(...collectResultCopySectionsForItem(item))
  }
  return sections
}

function collectResultCopySectionsForItem(item: vscode.TestItem): string[] {
  const storedFailures = storedResultFailuresByTestItemId.get(item.id)
  if (storedFailures && storedFailures.length > 0) {
    return [formatResultCopySection(item, storedFailures)]
  }

  const sections: string[] = []
  for (const [, childItem] of item.children) {
    sections.push(...collectResultCopySectionsForItem(childItem))
  }
  return sections
}

function formatResultCopySection(
  item: vscode.TestItem,
  storedFailures: readonly StoredResultFailure[]
): string {
  const parts: string[] = [`Test: ${item.label}`]

  if (item.uri) {
    parts.push(`File: ${item.uri.scheme === 'file' ? item.uri.fsPath : item.uri.toString()}`)
  }

  if (item.range && item.range.start.line === item.range.end.line) {
    parts.push(`Line: ${item.range.start.line + 1}`)
  }

  parts.push('', '')
  parts.push(
    storedFailures
      .map((failure) => formatStoredResultFailure(failure))
      .join(`\n${'='.repeat(50)}\n\n`)
  )
  return parts.join('\n')
}

function formatStoredResultFailure(failure: StoredResultFailure): string {
  const detailLines = failure.detailText.split(/\r?\n/)
  if (detailLines.length === 0) {
    return failure.outputSummary
  }

  if (failure.outputSummary.endsWith(detailLines[0])) {
    return [failure.outputSummary, ...detailLines.slice(1)].join('\n')
  }

  return [failure.outputSummary, ...detailLines].join('\n')
}

function isTestItem(value: unknown): value is vscode.TestItem {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'children' in value
  )
}
