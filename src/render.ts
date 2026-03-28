import * as tm from 'vscode-textmate'

export interface RenderOptions {
  compactRanges: boolean
}

export function renderAssertionBlock(
  commentToken: string,
  sourceLine: string,
  tokens: readonly tm.IToken[],
  options: RenderOptions
): string[] {
  const renderableTokens = tokens.filter((token) => token.endIndex > token.startIndex && token.scopes.length > 0)

  if (!options.compactRanges) {
    return renderableTokens.map((token) => renderTokenAssertion(commentToken, sourceLine, token))
  }

  return compactAndRenderAssertions(commentToken, sourceLine, renderableTokens)
}

function renderTokenAssertion(commentToken: string, sourceLine: string, token: tm.IToken): string {
  const width = Math.max(token.endIndex - token.startIndex, 1)
  const scopes = token.scopes.join(' ')

  if (token.startIndex < commentToken.length) {
    return `${commentToken} <${'~'.repeat(token.startIndex)}${'-'.repeat(width)} ${scopes}`
  }

  const padding = sourceLine
    .slice(commentToken.length, token.startIndex)
    .replace(/[^\t]/g, ' ')

  return `${commentToken}${padding}${'^'.repeat(width)} ${scopes}`
}

function compactAndRenderAssertions(commentToken: string, sourceLine: string, tokens: readonly tm.IToken[]): string[] {
  const renderItems: Array<{ firstTokenIndex: number; line: string }> = []
  const caretGroups = new Map<string, CaretAssertionGroup>()

  tokens.forEach((token, index) => {
    if (token.startIndex < commentToken.length) {
      renderItems.push({
        firstTokenIndex: index,
        line: renderTokenAssertion(commentToken, sourceLine, token)
      })
      return
    }

    const key = token.scopes.join('\u0000')
    let group = caretGroups.get(key)
    if (!group) {
      group = {
        firstTokenIndex: index,
        scopes: [...token.scopes],
        ranges: []
      }
      caretGroups.set(key, group)
    }

    group.ranges.push({
      startIndex: token.startIndex,
      endIndex: token.endIndex
    })
  })

  for (const group of caretGroups.values()) {
    renderItems.push({
      firstTokenIndex: group.firstTokenIndex,
      line: renderCaretGroup(commentToken, sourceLine, group)
    })
  }

  return renderItems.sort((left, right) => left.firstTokenIndex - right.firstTokenIndex).map((item) => item.line)
}

function renderCaretGroup(commentToken: string, sourceLine: string, group: CaretAssertionGroup): string {
  const mergedRanges = mergeRanges(group.ranges)
  const maxEndIndex = Math.max(...mergedRanges.map((range) => range.endIndex))
  const markerChars: string[] = Array.from(sourceLine.slice(commentToken.length, maxEndIndex), (character) =>
    character === '\t' ? '\t' : ' '
  )

  for (const range of mergedRanges) {
    for (let index = range.startIndex; index < range.endIndex; index++) {
      markerChars[index - commentToken.length] = '^'
    }
  }

  return `${commentToken}${markerChars.join('')} ${group.scopes.join(' ')}`
}

function mergeRanges(ranges: readonly CaretRange[]): CaretRange[] {
  const sortedRanges = [...ranges].sort((left, right) => {
    if (left.startIndex !== right.startIndex) {
      return left.startIndex - right.startIndex
    }

    return left.endIndex - right.endIndex
  })

  const mergedRanges: CaretRange[] = []
  for (const range of sortedRanges) {
    const previousRange = mergedRanges.at(-1)
    if (!previousRange || range.startIndex > previousRange.endIndex) {
      mergedRanges.push({ ...range })
      continue
    }

    previousRange.endIndex = Math.max(previousRange.endIndex, range.endIndex)
  }

  return mergedRanges
}

interface CaretAssertionGroup {
  firstTokenIndex: number
  scopes: string[]
  ranges: CaretRange[]
}

interface CaretRange {
  startIndex: number
  endIndex: number
}
