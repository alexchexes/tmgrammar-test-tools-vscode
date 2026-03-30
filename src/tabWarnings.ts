import { isAssertionLine } from './syntaxTestCore'

export function collectTabbedTargetDocumentLines(
  lines: readonly string[],
  sourceDocumentLines: readonly number[],
  commentToken: string
): readonly number[] {
  const tabbedLines = new Set<number>()

  for (const sourceDocumentLine of sourceDocumentLines) {
    if (sourceDocumentLine < 0 || sourceDocumentLine >= lines.length) {
      continue
    }

    if (lines[sourceDocumentLine].includes('\t')) {
      tabbedLines.add(sourceDocumentLine)
    }

    for (
      let lineNumber = sourceDocumentLine + 1;
      lineNumber < lines.length && isAssertionLine(lines[lineNumber], commentToken);
      lineNumber++
    ) {
      if (lines[lineNumber].includes('\t')) {
        tabbedLines.add(lineNumber)
      }
    }
  }

  return [...tabbedLines].sort((left, right) => left - right)
}

export function formatTabOffsetWarning(
  documentLines: readonly number[],
  targetLabel: string
): string | undefined {
  if (documentLines.length === 0) {
    return undefined
  }

  return `Tabs detected on ${targetLabel} lines (${formatDocumentLineRanges(documentLines)}). Assertion positions use raw character offsets, so visual alignment may look misleading when tabs are present.`
}

function formatDocumentLineRanges(documentLines: readonly number[]): string {
  const humanLines = [...new Set(documentLines)].sort((left, right) => left - right).map((lineNumber) => lineNumber + 1)
  const ranges: string[] = []
  let rangeStart = humanLines[0]
  let previous = humanLines[0]

  for (let index = 1; index < humanLines.length; index++) {
    const current = humanLines[index]
    if (current === previous + 1) {
      previous = current
      continue
    }

    ranges.push(formatRange(rangeStart, previous))
    rangeStart = current
    previous = current
  }

  ranges.push(formatRange(rangeStart, previous))
  return ranges.join(', ')
}

function formatRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`
}
