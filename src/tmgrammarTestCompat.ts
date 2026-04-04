import { isAssertionLine, parseHeaderLine } from './syntaxTestCore'

export const VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE =
  'Note: this parse error comes from vscode-tmgrammar-test; some versions report line numbers as 0-based.'

const INVALID_ASSERTION_PREFIX_REGEX = /^Invalid assertion at line (\d+):/

export function parseGrammarTestCaseWithCompat<T>(
  text: string,
  parseGrammarTestCase: (value: string) => T,
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[],
  lineNumberMap?: readonly number[]
): T {
  try {
    throwOnMalformedAssertionCandidates(text, parseScopeAssertion, lineNumberMap)
    return parseGrammarTestCase(text)
  } catch (error) {
    if (error instanceof Error) {
      error.message = normalizeVscodeTmgrammarTestParseError(error.message, text, lineNumberMap)
    }

    throw error
  }
}

export function normalizeVscodeTmgrammarTestParseError(
  message: string,
  documentText: string,
  lineNumberMap?: readonly number[]
): string {
  const knownError = parseKnownInvalidAssertionError(message)
  if (!knownError) {
    return message
  }

  const documentLines = splitIntoLines(documentText)
  const alreadyMappedMatches =
    knownError.offendingLine !== undefined &&
    Array.isArray(lineNumberMap) &&
    lineNumberMap.some(
      (originalLineNumber, index) =>
        originalLineNumber === knownError.reportedLineNumber && documentLines[index] === knownError.offendingLine
    )
  if (alreadyMappedMatches) {
    return message
  }

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
    const correctedLineNumber = lineNumberMap?.[knownError.reportedLineNumber] ?? knownError.reportedLineNumber + 1
    return message.replace(
      INVALID_ASSERTION_PREFIX_REGEX,
      `Invalid assertion at line ${correctedLineNumber}:`
    )
  }

  if (oneBasedMatches && !zeroBasedMatches) {
    const correctedLineNumber =
      lineNumberMap?.[knownError.reportedLineNumber - 1] ?? knownError.reportedLineNumber
    return message.replace(INVALID_ASSERTION_PREFIX_REGEX, `Invalid assertion at line ${correctedLineNumber}:`)
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

function throwOnMalformedAssertionCandidates(
  documentText: string,
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[],
  lineNumberMap?: readonly number[]
): void {
  const documentLines = splitIntoLines(documentText)
  if (documentLines.length === 0) {
    return
  }

  let commentToken: string
  try {
    commentToken = parseHeaderLine(documentLines[0]).commentToken
  } catch {
    return
  }

  for (let index = 1; index < documentLines.length; index++) {
    const line = documentLines[index]
    if (!isAssertionLine(line, commentToken)) {
      continue
    }

    const parsedAssertions = parseScopeAssertion(index, commentToken.length, line)
    if (parsedAssertions.length > 0) {
      continue
    }

    // vscode-tmgrammar-test can silently return [] for some assertion lines it fails to parse.
    // At this point the line already matched our shared assertion-candidate detector,
    // so [] here means "silently ignored malformed assertion" (not "normal non-assertion line").
    const reportedLineNumber = lineNumberMap?.[index] ?? index + 1
    throw new Error(
      `Invalid assertion at line ${reportedLineNumber}:\n${line}\nMalformed assertion syntax. The line looks like an assertion, but the runner returned no parsed assertions.`
    )
  }
}

function splitIntoLines(value: string): string[] {
  return value.length === 0 ? [] : value.split(/\r?\n/)
}
