export interface SerializedLocation {
  end: { character: number; line: number }
  start: { character: number; line: number }
  uri: string
}

export interface TestMessageLike {
  message: string | { value: string }
  location?: unknown
}

export function getTestMessageFromCommandValue(value: unknown): TestMessageLike | undefined {
  if (isTestMessageLike(value)) {
    return value
  }

  if (typeof value === 'object' && value !== null && 'message' in value && isTestMessageLike(value.message)) {
    return value.message
  }

  return undefined
}

export function getTestMessageText(message: TestMessageLike): string | undefined {
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

export function normalizeSerializedLocation(value: unknown): SerializedLocation | undefined {
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

function isTestMessageLike(value: unknown): value is TestMessageLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    (typeof value.message === 'string' ||
      (typeof value.message === 'object' && value.message !== null && 'value' in value.message))
  )
}
