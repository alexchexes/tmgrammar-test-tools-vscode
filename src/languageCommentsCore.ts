export interface CommentSyntax {
  blockComment?: readonly [start: string, end: string]
  lineComments: readonly string[]
}

export interface CommentLineState {
  inBlockComment: boolean
}

export function mergeCommentSyntax(
  syntax: CommentSyntax | undefined,
  fallbackLineComment: string | undefined
): CommentSyntax | undefined {
  const lineComments = new Set<string>()

  for (const token of syntax?.lineComments ?? []) {
    if (token.trim().length > 0) {
      lineComments.add(token)
    }
  }

  if (fallbackLineComment && fallbackLineComment.trim().length > 0) {
    lineComments.add(fallbackLineComment)
  }

  const mergedLineComments = [...lineComments].sort((left, right) => right.length - left.length)
  const blockComment = normalizeBlockCommentPair(syntax?.blockComment)

  if (mergedLineComments.length === 0 && !blockComment) {
    return undefined
  }

  return {
    blockComment,
    lineComments: mergedLineComments
  }
}

export function parseCommentSyntaxFromLanguageConfigurationText(text: string): CommentSyntax | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(text))
  } catch {
    return undefined
  }

  if (!parsed || typeof parsed !== 'object') {
    return undefined
  }

  const comments = (parsed as { comments?: unknown }).comments
  if (!comments || typeof comments !== 'object') {
    return undefined
  }

  const lineComment =
    typeof (comments as { lineComment?: unknown }).lineComment === 'string'
      ? (comments as { lineComment?: string }).lineComment
      : undefined

  const blockCommentValue = (comments as { blockComment?: unknown }).blockComment
  const blockComment =
    Array.isArray(blockCommentValue) &&
    blockCommentValue.length === 2 &&
    typeof blockCommentValue[0] === 'string' &&
    typeof blockCommentValue[1] === 'string'
      ? ([blockCommentValue[0], blockCommentValue[1]] as const)
      : undefined

  return mergeCommentSyntax(
    {
      blockComment,
      lineComments: lineComment ? [lineComment] : []
    },
    undefined
  )
}

export function isCommentOnlyLine(
  text: string,
  syntax: CommentSyntax | undefined,
  state: CommentLineState = { inBlockComment: false }
): { isCommentOnly: boolean; state: CommentLineState } {
  const normalizedSyntax = mergeCommentSyntax(syntax, undefined)
  if (!normalizedSyntax) {
    return {
      isCommentOnly: false,
      state
    }
  }

  const blockComment = normalizedSyntax.blockComment
  const lineComments = normalizedSyntax.lineComments

  let hasCodeOutsideComments = false
  let inBlockComment = state.inBlockComment
  let index = 0

  while (index < text.length) {
    if (inBlockComment) {
      const blockEnd = blockComment?.[1]
      if (!blockEnd) {
        index = text.length
        break
      }

      const blockEndIndex = text.indexOf(blockEnd, index)
      if (blockEndIndex === -1) {
        index = text.length
        break
      }

      index = blockEndIndex + blockEnd.length
      inBlockComment = false
      continue
    }

    const character = text[index]
    if (isWhitespace(character)) {
      index++
      continue
    }

    const matchingLineComment = findMatchingPrefix(text, index, lineComments)
    if (matchingLineComment) {
      index = text.length
      break
    }

    if (blockComment) {
      const [blockStart] = blockComment
      if (text.startsWith(blockStart, index)) {
        inBlockComment = true
        index += blockStart.length
        continue
      }
    }

    hasCodeOutsideComments = true
    index++
  }

  return {
    isCommentOnly: !hasCodeOutsideComments,
    state: { inBlockComment }
  }
}

function normalizeBlockCommentPair(
  value: CommentSyntax['blockComment']
): readonly [start: string, end: string] | undefined {
  if (!value || value[0].trim().length === 0 || value[1].trim().length === 0) {
    return undefined
  }

  return [value[0], value[1]]
}

function findMatchingPrefix(text: string, index: number, prefixes: readonly string[]): string | undefined {
  for (const prefix of prefixes) {
    if (text.startsWith(prefix, index)) {
      return prefix
    }
  }

  return undefined
}

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n'
}

function stripJsonCommentsAndTrailingCommas(text: string): string {
  return removeTrailingCommas(removeJsonComments(text))
}

function removeJsonComments(text: string): string {
  let output = ''
  let inString = false
  let escaping = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (inLineComment) {
      if (character === '\r' || character === '\n') {
        inLineComment = false
        output += character
      }
      continue
    }

    if (inBlockComment) {
      if (character === '*' && nextCharacter === '/') {
        inBlockComment = false
        index++
      } else if (character === '\r' || character === '\n') {
        output += character
      }
      continue
    }

    if (inString) {
      output += character

      if (escaping) {
        escaping = false
      } else if (character === '\\') {
        escaping = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      output += character
      continue
    }

    if (character === '/' && nextCharacter === '/') {
      inLineComment = true
      index++
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      inBlockComment = true
      index++
      continue
    }

    output += character
  }

  return output
}

function removeTrailingCommas(text: string): string {
  let output = ''
  let inString = false
  let escaping = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]

    if (inString) {
      output += character

      if (escaping) {
        escaping = false
      } else if (character === '\\') {
        escaping = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      output += character
      continue
    }

    if (character === ',') {
      const nextNonWhitespaceIndex = findNextNonWhitespaceIndex(text, index + 1)
      const nextNonWhitespaceCharacter =
        nextNonWhitespaceIndex === -1 ? undefined : text[nextNonWhitespaceIndex]

      if (nextNonWhitespaceCharacter === '}' || nextNonWhitespaceCharacter === ']') {
        continue
      }
    }

    output += character
  }

  return output
}

function findNextNonWhitespaceIndex(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index++) {
    if (!isWhitespace(text[index])) {
      return index
    }
  }

  return -1
}
