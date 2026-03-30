const POSITIVE_ASSERTION_LINE = /^(\s*)(\^+|<~?-+)\s+(.+)$/

interface ParsedAssertionLine {
  hasNegativeScopes: boolean
  kind: 'caret' | 'left'
  marker: string
  positiveScopes: readonly string[]
  startOffset: number
  width: number
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

  for (const preservedLine of preservedCaretAssertionLines) {
    const insertionSlot = findCaretInsertionSlot(mergedAssertionLines, preservedLine, commentToken)
    mergedAssertionLines.splice(insertionSlot, 0, preservedLine)
  }

  return [...preservedLeftAssertionLines, ...mergedAssertionLines, ...preservedOtherAssertionLines]
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

function findCaretInsertionSlot(lines: readonly string[], preservedLine: string, commentToken: string): number {
  const preservedParsed = parseAssertionLine(preservedLine, commentToken)
  if (!preservedParsed || preservedParsed.kind !== 'caret') {
    return lines.length
  }

  let insertionSlot = lines.length

  for (let index = 0; index < lines.length; index++) {
    const parsedLine = parseAssertionLine(lines[index], commentToken)
    if (!parsedLine) {
      continue
    }

    if (parsedLine.kind === 'left') {
      continue
    }

    if (compareCaretMarkers(preservedParsed, parsedLine) < 0) {
      insertionSlot = index
      break
    }
  }

  return insertionSlot
}

function compareCaretMarkers(left: ParsedAssertionLine, right: ParsedAssertionLine): number {
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset
  }

  if (left.width !== right.width) {
    return right.width - left.width
  }

  return 0
}

function countLeadingTildes(markerBody: string): number {
  let count = 0
  for (const character of markerBody) {
    if (character === '~') {
      count++
      continue
    }

    break
  }

  return count
}

function countTrailingHyphens(markerBody: string): number {
  let count = 0
  for (const character of markerBody) {
    if (character === '-') {
      count++
    }
  }

  return count
}
