import * as vscode from 'vscode'
import { logWarn } from './log'
import {
  getTestMessageFromCommandValue,
  getTestMessageText,
  normalizeSerializedLocation,
  SerializedLocation,
  TestMessageLike
} from './testMessageActionsCore'

const sourceLocationByMessageKey = new Map<string, SerializedLocation>()
const sourceLocationByMessageText = new Map<string, SerializedLocation>()

export function rememberTestFailureSourceLocation(
  message: vscode.TestMessage,
  assertionLocation: vscode.Location,
  sourceLocation: vscode.Location
): void {
  const key = toMessageLookupKey(getTestMessageText(message), serializeLocation(assertionLocation))
  if (!key) {
    const messageText = getTestMessageText(message)
    if (messageText) {
      sourceLocationByMessageText.set(messageText, serializeLocation(sourceLocation))
    }
    return
  }

  const serializedSourceLocation = serializeLocation(sourceLocation)
  sourceLocationByMessageKey.set(key, serializedSourceLocation)

  const messageText = getTestMessageText(message)
  if (messageText) {
    sourceLocationByMessageText.set(messageText, serializedSourceLocation)
  }
}

export function registerTestMessageCommands(): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand('tmGrammarTestTools.copyTestFailureMessage', async (value) => {
      const message = getTestMessageFromCommandValue(value)
      if (!message) {
        warnUnavailableMessageAction('copy the test failure message', value)
        return
      }

      const text = getTestMessageText(message)
      if (!text) {
        warnUnavailableMessageAction('copy the test failure message', value)
        return
      }

      await vscode.env.clipboard.writeText(text)
    }),
    vscode.commands.registerCommand('tmGrammarTestTools.goToTestFailureSourceRange', async (value) => {
      const message = getTestMessageFromCommandValue(value)
      if (!message) {
        warnUnavailableMessageAction('resolve the test failure source range', value)
        return
      }

      const messageText = getTestMessageText(message)
      const assertionLocation = getTestMessageLocation(message)
      const lookupKey = toMessageLookupKey(messageText, assertionLocation)
      const location = deserializeLocation(
        (lookupKey ? sourceLocationByMessageKey.get(lookupKey) : undefined) ??
          (messageText ? sourceLocationByMessageText.get(messageText) : undefined)
      )
      if (!location) {
        warnUnavailableMessageAction('resolve the test failure source range', value)
        return
      }

      const document = await vscode.workspace.openTextDocument(location.uri)
      const editor = await vscode.window.showTextDocument(document)
      editor.selection = new vscode.Selection(location.range.start, location.range.end)
      editor.revealRange(location.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    })
  )
}

function warnUnavailableMessageAction(action: string, value: unknown): void {
  const valueShape = describeCommandValueShape(value)
  const message = `Could not ${action}; VS Code did not provide a TM Grammar Test Tools failure message to the command.`
  logWarn(`${message} Command argument shape: ${valueShape}.`)
  void vscode.window.showWarningMessage(message)
}

function getTestMessageLocation(message: TestMessageLike): SerializedLocation | undefined {
  if (!('location' in message)) {
    return undefined
  }

  return normalizeSerializedLocation(message.location)
}

function serializeLocation(location: vscode.Location): SerializedLocation {
  return {
    end: {
      character: location.range.end.character,
      line: location.range.end.line
    },
    start: {
      character: location.range.start.character,
      line: location.range.start.line
    },
    uri: location.uri.toString()
  }
}

function deserializeLocation(value: unknown): vscode.Location | undefined {
  const normalized = normalizeSerializedLocation(value)
  if (!normalized) {
    return undefined
  }

  return new vscode.Location(
    vscode.Uri.parse(normalized.uri),
    new vscode.Range(
      normalized.start.line,
      normalized.start.character,
      normalized.end.line,
      normalized.end.character
    )
  )
}

function toMessageLookupKey(messageText: string | undefined, location: SerializedLocation | undefined): string | undefined {
  if (!messageText || !location) {
    return undefined
  }

  return `${location.uri}:${location.start.line}:${location.start.character}:${location.end.line}:${location.end.character}:${messageText}`
}

function describeCommandValueShape(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value !== 'object') {
    return typeof value
  }

  return `object keys=[${Object.keys(value).join(', ')}]`
}
