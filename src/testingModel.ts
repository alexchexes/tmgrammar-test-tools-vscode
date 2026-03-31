export interface RunnableSourceLine {
  documentLine: number
  sourceLineNumber: number
  text: string
}

export interface GrammarTestCaseMetadata {
  commentToken: string
  description: string
  scope: string
}

export interface GrammarTestScopeAssertion {
  exclude: string[]
  from: number
  scopes: string[]
  to: number
}

export interface GrammarTestLineAssertion {
  scopeAssertions: GrammarTestScopeAssertion[]
  sourceLineNumber: number
  testCaseLineNumber: number
}

export interface GrammarTestCase {
  assertions: GrammarTestLineAssertion[]
  metadata: GrammarTestCaseMetadata
  source: string[]
}

export interface GrammarTestFailure {
  actual: string[]
  end: number
  line: number
  missing: string[]
  srcLine: number
  start: number
  unexpected: string[]
}

const ASSERTION_REGEX = /^\s*(\^|<[~]*-)/
const ASSERTION_LINE_REGEX = /^(\s*)(\^+|<[~]*-+)\s+(.+)$/

export function collectRunnableSourceLinesFromLines(
  lines: readonly string[],
  commentToken: string
): RunnableSourceLine[] {
  const runnableSourceLines: RunnableSourceLine[] = []
  let sourceLineNumber = 0

  for (let lineNumber = 1; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber]
    if (isAssertionLine(line, commentToken)) {
      continue
    }

    if (lineNumber + 1 < lines.length && isAssertionLine(lines[lineNumber + 1], commentToken)) {
      runnableSourceLines.push({
        documentLine: lineNumber,
        sourceLineNumber,
        text: line
      })
    }

    sourceLineNumber++
  }

  return runnableSourceLines
}

export function buildLineOnlyGrammarTestCase(
  testCase: GrammarTestCase,
  sourceLineNumber: number
): GrammarTestCase {
  return {
    assertions: testCase.assertions.filter((assertion) => assertion.sourceLineNumber === sourceLineNumber),
    metadata: testCase.metadata,
    source: testCase.source.slice(0, sourceLineNumber + 1)
  }
}

export function resolveFailureAssertionRange(
  testCase: GrammarTestCase,
  failure: GrammarTestFailure
): { start: number; end: number } | undefined {
  const overlappingCandidates = testCase.assertions
    .filter(
      (assertion) =>
        assertion.sourceLineNumber === failure.srcLine && assertion.testCaseLineNumber === failure.line
    )
    .flatMap((assertion) => assertion.scopeAssertions)
    .filter((assertion) => rangesOverlap(assertion.from, assertion.to, failure.start, failure.end))

  if (overlappingCandidates.length === 0) {
    return undefined
  }

  const scopedCandidates = findBestScopeCandidates(overlappingCandidates, failure)
  const candidates = scopedCandidates.length > 0 ? scopedCandidates : overlappingCandidates

  const exactMatch = candidates.find(
    (assertion) => assertion.from === failure.start && assertion.to === failure.end
  )
  if (exactMatch) {
    return {
      start: exactMatch.from,
      end: exactMatch.to
    }
  }

  candidates.sort(compareAssertionRanges)

  return {
    start: candidates[0].from,
    end: candidates[0].to
  }
}

export function resolveFailureAssertionDocumentLine(
  lines: readonly string[],
  commentToken: string,
  sourceDocumentLine: number,
  failure: GrammarTestFailure
): number | undefined {
  const candidates: Array<{
    end: number
    exactRangeMatch: boolean
    line: number
    scopeScore: number
    start: number
    width: number
  }> = []

  for (let line = sourceDocumentLine + 1; line < lines.length; line++) {
    const parsedAssertion = parseAssertionLine(lines[line], commentToken)
    if (!parsedAssertion) {
      break
    }

    if (!rangesOverlap(parsedAssertion.start, parsedAssertion.end, failure.start, failure.end)) {
      continue
    }

    candidates.push({
      end: parsedAssertion.end,
      exactRangeMatch: parsedAssertion.start === failure.start && parsedAssertion.end === failure.end,
      line,
      scopeScore: scoreAssertionLineMatch(parsedAssertion, failure),
      start: parsedAssertion.start,
      width: parsedAssertion.end - parsedAssertion.start
    })
  }

  if (candidates.length === 0) {
    return undefined
  }

  candidates.sort((left, right) => {
    if (left.scopeScore !== right.scopeScore) {
      return right.scopeScore - left.scopeScore
    }

    if (left.exactRangeMatch !== right.exactRangeMatch) {
      return left.exactRangeMatch ? -1 : 1
    }

    if (left.width !== right.width) {
      return left.width - right.width
    }

    return left.start - right.start
  })

  return candidates[0].line
}

function findBestScopeCandidates(
  candidates: readonly GrammarTestScopeAssertion[],
  failure: GrammarTestFailure
): GrammarTestScopeAssertion[] {
  const scored = candidates
    .map((assertion) => ({
      assertion,
      score: scoreAssertionMatch(assertion, failure)
    }))
    .filter((entry) => entry.score > 0)

  if (scored.length === 0) {
    return []
  }

  const bestScore = Math.max(...scored.map((entry) => entry.score))
  return scored
    .filter((entry) => entry.score === bestScore)
    .map((entry) => entry.assertion)
}

function scoreAssertionMatch(assertion: GrammarTestScopeAssertion, failure: GrammarTestFailure): number {
  let score = 0

  if (failure.missing.length > 0) {
    score += countMatches(assertion.scopes, failure.missing) * 10
  }

  if (failure.unexpected.length > 0) {
    score += countMatches(assertion.exclude, failure.unexpected) * 10
  }

  return score
}

function countMatches(values: readonly string[], expected: readonly string[]): number {
  const valueSet = new Set(values)
  return expected.filter((value) => valueSet.has(value)).length
}

function compareAssertionRanges(left: GrammarTestScopeAssertion, right: GrammarTestScopeAssertion): number {
    const widthDelta = left.to - left.from - (right.to - right.from)
    if (widthDelta !== 0) {
      return widthDelta
    }

    return left.from - right.from
}

function isAssertionLine(line: string, commentToken: string): boolean {
  return line.startsWith(commentToken) && ASSERTION_REGEX.test(line.slice(commentToken.length))
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

function parseAssertionLine(
  line: string,
  commentToken: string
): { end: number; exclude: string[]; scopes: string[]; start: number } | undefined {
  if (!line.startsWith(commentToken)) {
    return undefined
  }

  const body = line.slice(commentToken.length)
  const match = body.match(ASSERTION_LINE_REGEX)
  if (!match) {
    return undefined
  }

  const scopeTokens = match[3].trim().split(/\s+/)
  const firstNegativeIndex = scopeTokens.indexOf('-')
  const markerBody = match[2]
  const start = markerBody.startsWith('^')
    ? commentToken.length + match[1].length
    : countLeadingTildes(markerBody)
  const width = markerBody.startsWith('^') ? markerBody.length : countTrailingHyphens(markerBody)

  return {
    end: start + width,
    exclude: firstNegativeIndex === -1 ? [] : scopeTokens.slice(firstNegativeIndex + 1),
    scopes: firstNegativeIndex === -1 ? scopeTokens : scopeTokens.slice(0, firstNegativeIndex),
    start
  }
}

function scoreAssertionLineMatch(
  assertion: { exclude: readonly string[]; scopes: readonly string[] },
  failure: GrammarTestFailure
): number {
  let score = 0

  if (failure.missing.length > 0) {
    score += countMatches(assertion.scopes, failure.missing) * 10
  }

  if (failure.unexpected.length > 0) {
    score += countMatches(assertion.exclude, failure.unexpected) * 10
  }

  return score
}

function countLeadingTildes(markerBody: string): number {
  const leftMarkerBody = markerBody.startsWith('<') ? markerBody.slice(1) : markerBody
  let count = 0

  for (const character of leftMarkerBody) {
    if (character === '~') {
      count++
      continue
    }

    break
  }

  return count
}

function countTrailingHyphens(markerBody: string): number {
  const leftMarkerBody = markerBody.startsWith('<') ? markerBody.slice(1) : markerBody
  let count = 0

  for (const character of leftMarkerBody) {
    if (character === '-') {
      count++
    }
  }

  return count
}
