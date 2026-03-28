import * as tm from 'vscode-textmate'

export function renderAssertionBlock(
  commentToken: string,
  sourceLine: string,
  tokens: readonly tm.IToken[]
): string[] {
  return tokens
    .filter((token) => token.endIndex > token.startIndex && token.scopes.length > 0)
    .map((token) => renderTokenAssertion(commentToken, sourceLine, token))
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
