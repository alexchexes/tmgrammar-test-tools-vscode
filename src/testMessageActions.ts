import * as vscode from 'vscode'

interface SerializedLocation {
  end: { character: number; line: number }
  start: { character: number; line: number }
  uri: string
}

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
      const message = getTestMessage(value)
      if (!message) {
        return
      }

      const text = getTestMessageText(message)
      if (!text) {
        return
      }

      await vscode.env.clipboard.writeText(text)
    }),
    vscode.commands.registerCommand('tmGrammarTestTools.goToTestFailureSourceRange', async (value) => {
      const message = getTestMessage(value)
      if (!message) {
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
        return
      }

      const document = await vscode.workspace.openTextDocument(location.uri)
      const editor = await vscode.window.showTextDocument(document)
      editor.selection = new vscode.Selection(location.range.start, location.range.end)
      editor.revealRange(location.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    })
  )
}

function getTestMessage(value: unknown): TestMessageLike | undefined {
  if (isTestMessageLike(value)) {
    return value
  }

  if (typeof value === 'object' && value !== null && 'message' in value && isTestMessageLike(value.message)) {
    return value.message
  }

  return undefined
}

function getTestMessageText(message: TestMessageLike): string | undefined {
  const rawMessage = message.message
  if (typeof rawMessage === 'string') {
    return rawMessage
  }

  if (
    typeof rawMessage === 'object' &&
    rawMessage !== null &&
    'value' in rawMessage &&
    typeof rawMessage.value === 'string'
  ) {
    return rawMessage.value
  }

  return undefined
}

function getTestMessageLocation(message: TestMessageLike): SerializedLocation | undefined {
  if (!('location' in message)) {
    return undefined
  }

  return normalizeSerializedLocation(message.location)
}

function isTestMessageLike(value: unknown): value is TestMessageLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    (typeof value.message === 'string' ||
      (typeof value.message === 'object' && value.message !== null && 'value' in value.message))
  )
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

function normalizeSerializedLocation(value: unknown): SerializedLocation | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('uri' in value) ||
    typeof value.uri !== 'string' ||
    !('start' in value) ||
    !('end' in value) ||
    typeof value.start !== 'object' ||
    value.start === null ||
    typeof value.end !== 'object' ||
    value.end === null ||
    !('line' in value.start) ||
    typeof value.start.line !== 'number' ||
    !('character' in value.start) ||
    typeof value.start.character !== 'number' ||
    !('line' in value.end) ||
    typeof value.end.line !== 'number' ||
    !('character' in value.end) ||
    typeof value.end.character !== 'number'
  ) {
    return undefined
  }

  return {
    end: {
      character: value.end.character,
      line: value.end.line
    },
    start: {
      character: value.start.character,
      line: value.start.line
    },
    uri: value.uri
  }
}

function toMessageLookupKey(messageText: string | undefined, location: SerializedLocation | undefined): string | undefined {
  if (!messageText || !location) {
    return undefined
  }

  return `${location.uri}:${location.start.line}:${location.start.character}:${location.end.line}:${location.end.character}:${messageText}`
}

interface TestMessageLike {
  message: string | { value: string }
  location?: unknown
}
