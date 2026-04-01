export const VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE =
  'Note: this parse error comes from vscode-tmgrammar-test; some versions report line numbers as 0-based.'

const INVALID_ASSERTION_PREFIX_REGEX = /^Invalid assertion at line (\d+):/

export function parseGrammarTestCaseWithCompat<T>(
  text: string,
  parseGrammarTestCase: (value: string) => T
): T {
  try {
    return parseGrammarTestCase(text)
  } catch (error) {
    if (error instanceof Error) {
      error.message = normalizeVscodeTmgrammarTestParseError(error.message, text)
    }

    throw error
  }
}

export function normalizeVscodeTmgrammarTestParseError(message: string, documentText: string): string {
  const knownError = parseKnownInvalidAssertionError(message)
  if (!knownError) {
    return message
  }

  const documentLines = splitIntoLines(documentText)
  const zeroBasedMatches =
    knownError.offendingLine !== undefined &&
    knownError.reportedLineNumber >= 0 &&
    knownError.reportedLineNumber < documentLines.length &&
    documentLines[knownError.reportedLineNumber] === knownError.offendingLine
  const oneBasedMatches =
    knownError.offendingLine !== undefined &&
    knownError.reportedLineNumber > 0 &&
    knownError.reportedLineNumber - 1 < documentLines.length &&
    documentLines[knownError.reportedLineNumber - 1] === knownError.offendingLine

  if (zeroBasedMatches && !oneBasedMatches) {
    return message.replace(
      INVALID_ASSERTION_PREFIX_REGEX,
      `Invalid assertion at line ${knownError.reportedLineNumber + 1}:`
    )
  }

  if (oneBasedMatches && !zeroBasedMatches) {
    return message
  }

  return appendZeroBasedNote(message)
}

function parseKnownInvalidAssertionError(
  message: string
): { offendingLine?: string; reportedLineNumber: number } | undefined {
  const match = INVALID_ASSERTION_PREFIX_REGEX.exec(message)
  if (!match) {
    return undefined
  }

  const reportedLineNumber = Number.parseInt(match[1], 10)
  const remainder = message.slice(match[0].length)
  const offendingLineMatch = /^\r?\n([^\r\n]*)/.exec(remainder)

  return {
    offendingLine: offendingLineMatch?.[1],
    reportedLineNumber
  }
}

function appendZeroBasedNote(message: string): string {
  if (message.includes(VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE)) {
    return message
  }

  return `${message}\n${VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE}`
}

function splitIntoLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/)
}
