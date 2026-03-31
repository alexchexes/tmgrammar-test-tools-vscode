const POSITIVE_ASSERTION_LINE = /^(\s*)(\^+|<~?-+)\s+(.+)$/

interface ParsedAssertionLine {
  hasNegativeScopes: boolean
  kind: 'caret' | 'left'
  marker: string
  positiveScopes: readonly string[]
  startOffset: number
  width: number
}

export interface AssertionInsertion {
  assertionLines: readonly string[]
  beforeExistingIndex: number
}

export function isSafeToRefreshAssertionLine(line: string, commentToken: string): boolean {
  const parsedAssertionLine = parseAssertionLine(line, commentToken)
  return (
    parsedAssertionLine !== undefined &&
    parsedAssertionLine.positiveScopes.length > 0 &&
    !parsedAssertionLine.hasNegativeScopes
  )
}

export function mergeSafeRefreshAssertionLines(
  commentToken: string,
  existingAssertionLines: readonly string[],
  generatedAssertionLines: readonly string[]
): readonly string[] {
  const preservedAssertionLines = existingAssertionLines.filter(
    (line) => !isSafeToRefreshAssertionLine(line, commentToken)
  )
  if (preservedAssertionLines.length === 0) {
    return generatedAssertionLines
  }

  const preservedSignatures = new Set(
    preservedAssertionLines
      .map((line) => parseAssertionLine(line, commentToken))
      .filter(
        (parsedAssertionLine): parsedAssertionLine is ParsedAssertionLine =>
          parsedAssertionLine !== undefined &&
          parsedAssertionLine.hasNegativeScopes &&
          parsedAssertionLine.positiveScopes.length > 0
      )
      .map(toAssertionSignature)
  )
  const mergedAssertionLines = generatedAssertionLines.filter((generatedLine) => {
    const parsedGeneratedLine = parseAssertionLine(generatedLine, commentToken)
    return !(parsedGeneratedLine && preservedSignatures.has(toAssertionSignature(parsedGeneratedLine)))
  })

  const preservedLeftAssertionLines: string[] = []
  const preservedCaretAssertionLines: string[] = []
  const preservedOtherAssertionLines: string[] = []

  for (const preservedLine of preservedAssertionLines) {
    const parsedAssertionLine = parseAssertionLine(preservedLine, commentToken)
    if (!parsedAssertionLine) {
      preservedOtherAssertionLines.push(preservedLine)
      continue
    }

    if (parsedAssertionLine.kind === 'left') {
      preservedLeftAssertionLines.push(preservedLine)
      continue
    }

    preservedCaretAssertionLines.push(preservedLine)
  }

  for (const preservedLine of preservedLeftAssertionLines) {
    const preservedParsed = parseAssertionLine(preservedLine, commentToken)
    if (!preservedParsed) {
      mergedAssertionLines.push(preservedLine)
      continue
    }

    const insertionSlot = findLeftInsertionSlot(mergedAssertionLines, preservedParsed, commentToken)
    mergedAssertionLines.splice(insertionSlot, 0, preservedLine)
  }

  for (const preservedLine of preservedCaretAssertionLines) {
    const preservedParsed = parseAssertionLine(preservedLine, commentToken)
    if (!preservedParsed) {
      mergedAssertionLines.push(preservedLine)
      continue
    }

    const insertionSlot = findCaretInsertionSlot(mergedAssertionLines, preservedParsed, commentToken)
    mergedAssertionLines.splice(insertionSlot, 0, preservedLine)
  }

  return [...mergedAssertionLines, ...preservedOtherAssertionLines]
}

export function mergeAppendAssertionLines(
  commentToken: string,
  existingAssertionLines: readonly string[],
  generatedAssertionLines: readonly string[]
): readonly string[] {
  if (generatedAssertionLines.length === 0) {
    return existingAssertionLines
  }

  const mergedAssertionLines = [...existingAssertionLines]

  for (const generatedLine of generatedAssertionLines) {
    if (isRedundantGeneratedAssertionLine(generatedLine, existingAssertionLines, commentToken)) {
      continue
    }

    const insertionSlot = findAssertionInsertionSlot(mergedAssertionLines, generatedLine, commentToken)
    mergedAssertionLines.splice(insertionSlot, 0, generatedLine)
  }

  return mergedAssertionLines
}

export function planAppendAssertionInsertions(
  commentToken: string,
  existingAssertionLines: readonly string[],
  generatedAssertionLines: readonly string[]
): readonly AssertionInsertion[] {
  const mergedAssertionLines = mergeAppendAssertionLines(commentToken, existingAssertionLines, generatedAssertionLines)
  return deriveAppendInsertions(existingAssertionLines, mergedAssertionLines)
}

function parseAssertionLine(line: string, commentToken: string): ParsedAssertionLine | undefined {
  if (!line.startsWith(commentToken)) {
    return undefined
  }

  const body = line.slice(commentToken.length)
  const match = body.match(POSITIVE_ASSERTION_LINE)
  if (!match) {
    return undefined
  }

  const scopeTokens = match[3].trim().split(/\s+/)
  const firstNegativeIndex = scopeTokens.indexOf('-')
  const markerBody = match[2]

  return {
    hasNegativeScopes: firstNegativeIndex !== -1,
    kind: markerBody.startsWith('^') ? 'caret' : 'left',
    marker: `${match[1]}${match[2]}`,
    positiveScopes: firstNegativeIndex === -1 ? scopeTokens : scopeTokens.slice(0, firstNegativeIndex),
    startOffset: markerBody.startsWith('^') ? match[1].length : countLeadingTildes(markerBody),
    width: markerBody.startsWith('^') ? markerBody.length : countTrailingHyphens(markerBody)
  }
}

function toAssertionSignature(parsedAssertionLine: ParsedAssertionLine): string {
  return `${parsedAssertionLine.marker}\u0000${parsedAssertionLine.positiveScopes.join(' ')}`
}

function findAssertionInsertionSlot(lines: readonly string[], insertedLine: string, commentToken: string): number {
  const insertedParsed = parseAssertionLine(insertedLine, commentToken)
  if (!insertedParsed) {
    return lines.length
  }

  if (insertedParsed.kind === 'left') {
    return findLeftInsertionSlot(lines, insertedParsed, commentToken)
  }

  return findCaretInsertionSlot(lines, insertedParsed, commentToken)
}

function findCaretInsertionSlot(
  lines: readonly string[],
  insertedParsed: ParsedAssertionLine,
  commentToken: string
): number {
  let insertionSlot = lines.length

  for (let index = 0; index < lines.length; index++) {
    const parsedLine = parseAssertionLine(lines[index], commentToken)
    if (!parsedLine) {
      continue
    }

    if (parsedLine.kind === 'left') {
      continue
    }

    if (compareAssertionMarkers(insertedParsed, parsedLine) < 0) {
      insertionSlot = index
      break
    }
  }

  return insertionSlot
}

function findLeftInsertionSlot(
  lines: readonly string[],
  insertedParsed: ParsedAssertionLine,
  commentToken: string
): number {
  let insertionSlot = 0

  for (let index = 0; index < lines.length; index++) {
    const parsedLine = parseAssertionLine(lines[index], commentToken)
    if (!parsedLine) {
      continue
    }

    if (parsedLine.kind !== 'left') {
      insertionSlot = index
      break
    }

    insertionSlot = index + 1
    if (compareAssertionMarkers(insertedParsed, parsedLine) < 0) {
      insertionSlot = index
      break
    }
  }

  return insertionSlot
}

function compareAssertionMarkers(left: ParsedAssertionLine, right: ParsedAssertionLine): number {
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset
  }

  if (left.width !== right.width) {
    return right.width - left.width
  }

  return 0
}

function isRedundantGeneratedAssertionLine(
  generatedLine: string,
  existingAssertionLines: readonly string[],
  commentToken: string
): boolean {
  if (existingAssertionLines.includes(generatedLine)) {
    return true
  }

  const generatedParsed = parseAssertionLine(generatedLine, commentToken)
  if (!generatedParsed || generatedParsed.positiveScopes.length === 0) {
    return false
  }

  return existingAssertionLines.some((existingLine) => {
    const existingParsed = parseAssertionLine(existingLine, commentToken)
    if (!existingParsed) {
      return false
    }

    if (
      existingParsed.kind !== generatedParsed.kind ||
      existingParsed.startOffset !== generatedParsed.startOffset ||
      existingParsed.width !== generatedParsed.width
    ) {
      return false
    }

    if (existingParsed.hasNegativeScopes) {
      return toAssertionSignature(existingParsed) === toAssertionSignature(generatedParsed)
    }

    return isOrderedSubsequence(generatedParsed.positiveScopes, existingParsed.positiveScopes)
  })
}

function isOrderedSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let haystackIndex = 0

  for (const token of needle) {
    while (haystackIndex < haystack.length && haystack[haystackIndex] !== token) {
      haystackIndex++
    }

    if (haystackIndex >= haystack.length) {
      return false
    }

    haystackIndex++
  }

  return true
}

function deriveAppendInsertions(
  existingAssertionLines: readonly string[],
  mergedAssertionLines: readonly string[]
): readonly AssertionInsertion[] {
  const insertions: AssertionInsertion[] = []
  let existingIndex = 0
  let currentInsertionStart = -1
  let currentInsertionLines: string[] = []

  for (const mergedLine of mergedAssertionLines) {
    if (existingIndex < existingAssertionLines.length && mergedLine === existingAssertionLines[existingIndex]) {
      if (currentInsertionLines.length > 0) {
        insertions.push({
          assertionLines: currentInsertionLines,
          beforeExistingIndex: currentInsertionStart
        })
        currentInsertionLines = []
        currentInsertionStart = -1
      }

      existingIndex++
      continue
    }

    if (currentInsertionStart === -1) {
      currentInsertionStart = existingIndex
    }

    currentInsertionLines.push(mergedLine)
  }

  if (currentInsertionLines.length > 0) {
    insertions.push({
      assertionLines: currentInsertionLines,
      beforeExistingIndex: currentInsertionStart
    })
  }

  if (existingIndex !== existingAssertionLines.length) {
    throw new Error('Append merge would need to rewrite existing assertion lines, which is not supported.')
  }

  return insertions
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
