import * as vscode from 'vscode'

export interface TestHeader {
  commentToken: string
  scopeName: string
  description: string
}

export interface SourceLine {
  documentLine: number
  text: string
}

const HEADER_REGEX = /^([^\s]+)\s+SYNTAX\s+TEST\s+"([^"]+)"(?:\s+"([^"]+)")?\s*$/
const ASSERTION_REGEX = /^\s*(\^|<[~]*-)/

export function parseHeaderLine(line: string): TestHeader {
  const match = HEADER_REGEX.exec(line)
  if (!match) {
    throw new Error(
      'Expected the first line in the syntax test file to match: <comment token> SYNTAX TEST "<language scope>" "optional description"'
    )
  }

  const [, commentToken, scopeName, description = ''] = match
  return {
    commentToken,
    scopeName,
    description
  }
}

export function isAssertionLine(line: string, commentToken: string): boolean {
  return line.startsWith(commentToken) && ASSERTION_REGEX.test(line.slice(commentToken.length))
}

export function collectSourceLines(document: vscode.TextDocument, commentToken: string): SourceLine[] {
  const sourceLines: SourceLine[] = []

  for (let lineNumber = 1; lineNumber < document.lineCount; lineNumber++) {
    const text = document.lineAt(lineNumber).text
    if (!isAssertionLine(text, commentToken)) {
      sourceLines.push({
        documentLine: lineNumber,
        text
      })
    }
  }

  return sourceLines
}

export function findTargetSourceLine(sourceLines: readonly SourceLine[], anchorLine: number): SourceLine | undefined {
  let candidate: SourceLine | undefined

  for (const sourceLine of sourceLines) {
    if (sourceLine.documentLine > anchorLine) {
      break
    }

    candidate = sourceLine
  }

  return candidate
}

export function findAssertionBlock(
  document: vscode.TextDocument,
  sourceLine: number,
  commentToken: string
): { startLine: number; endLineExclusive: number } {
  const startLine = sourceLine + 1
  let endLineExclusive = startLine

  while (
    endLineExclusive < document.lineCount &&
    isAssertionLine(document.lineAt(endLineExclusive).text, commentToken)
  ) {
    endLineExclusive++
  }

  return {
    startLine,
    endLineExclusive
  }
}
