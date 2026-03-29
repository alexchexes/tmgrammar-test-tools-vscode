import { ScopeMode } from './render'
import { SourceLine } from './syntaxTestCore'

export interface LineCodeLensSpec {
  anchorLine: number
  commandId: string
  sourceDocumentLine: number
  title: string
}

export interface AssertionBlockInfo {
  endLineExclusive: number
  sourceDocumentLine: number
  startLine: number
}

export function shouldSuspendLineCodeLensDuringEdit(
  lines: readonly string[],
  assertionBlock: Pick<AssertionBlockInfo, 'startLine' | 'endLineExclusive'>
): boolean {
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
  if (!hasExistingBlock) {
    return false
  }

  if (assertionBlock.endLineExclusive >= lines.length) {
    return true
  }

  return lines[assertionBlock.endLineExclusive].trim().length === 0
}

export function collectLineCodeLensSpecs(
  sourceLines: readonly SourceLine[],
  lineCount: number,
  assertionBlocks: readonly AssertionBlockInfo[]
): LineCodeLensSpec[] {
  const assertionBlockBySourceLine = new Map(assertionBlocks.map((block) => [block.sourceDocumentLine, block]))
  const specs: LineCodeLensSpec[] = []

  for (const sourceLine of sourceLines) {
    if (sourceLine.text.trim().length === 0) {
      continue
    }

    const assertionBlock = assertionBlockBySourceLine.get(sourceLine.documentLine) ?? {
      endLineExclusive: sourceLine.documentLine + 1,
      sourceDocumentLine: sourceLine.documentLine,
      startLine: sourceLine.documentLine + 1
    }
    const anchorLine = resolveCodeLensAnchorLine(sourceLine.documentLine, assertionBlock.endLineExclusive, lineCount)

    specs.push(createCodeLensSpec(anchorLine, sourceLine.documentLine, 'full'))
    specs.push(createCodeLensSpec(anchorLine, sourceLine.documentLine, 'minimal'))
  }

  return specs
}

function createCodeLensSpec(anchorLine: number, sourceDocumentLine: number, scopeMode: ScopeMode): LineCodeLensSpec {
  return {
    anchorLine,
    commandId:
      scopeMode === 'full'
        ? 'tmGrammarTestTools.insertLineAssertionsFull'
        : 'tmGrammarTestTools.insertLineAssertionsMinimal',
    sourceDocumentLine,
    title: `Line Assertions (${scopeMode === 'full' ? 'Full' : 'Minimal'})`
  }
}

function resolveCodeLensAnchorLine(
  sourceDocumentLine: number,
  assertionBlockEndLineExclusive: number,
  lineCount: number
): number {
  const preferredAnchorLine = assertionBlockEndLineExclusive

  if (preferredAnchorLine <= lineCount) {
    return preferredAnchorLine
  }

  return sourceDocumentLine
}
