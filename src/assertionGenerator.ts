import { SourcedGrammarContribution } from './grammarSources'
import { GrammarContribution } from './grammarTypes'
import { RenderOptions, ScopeMode, renderAssertionBlock } from './render'
import { CharacterRange, SelectionRangeTarget, clipTokensToRanges, resolveSelectionRanges } from './selectionTargets'
import { SourceLine } from './syntaxTestCore'
import { formatTokenizationTraceLines, tokenizeSourceLine, tokenizeSourceLineWithTrace } from './textmate'

export interface AssertionGenerationContext {
  commentToken: string
  grammars: readonly GrammarContribution[]
  logGrammarDetails?: boolean
  onGrammarTrace?: (lines: readonly string[]) => void
  scopeName: string
  sourceLines: readonly SourceLine[]
  sourcedGrammars?: readonly SourcedGrammarContribution[]
}

export interface AssertionGenerationOptions {
  compactRanges: boolean
  scopeMode: ScopeMode
}

export interface GeneratedRangeAssertionBlock {
  assertionLines: readonly string[]
  ranges: readonly CharacterRange[]
}

export function appendMissingAssertionLines(
  existingAssertionLines: readonly string[],
  generatedAssertionLines: readonly string[]
): readonly string[] {
  if (generatedAssertionLines.length === 0) {
    return []
  }

  const existingLineSet = new Set(existingAssertionLines)
  return generatedAssertionLines.filter((line) => !existingLineSet.has(line))
}

export async function generateLineAssertionBlock(
  context: AssertionGenerationContext,
  targetSourceIndex: number,
  options: AssertionGenerationOptions
): Promise<readonly string[]> {
  const sourceLine = context.sourceLines[targetSourceIndex]
  const tokens = await tokenizeSourceLineForGeneration(context, targetSourceIndex)

  return renderAssertionBlock(context.commentToken, sourceLine.text, tokens, toRenderOptions(context, options))
}

export async function generateRangeAssertionBlock(
  context: AssertionGenerationContext,
  targetSourceIndex: number,
  target: SelectionRangeTarget,
  options: AssertionGenerationOptions
): Promise<GeneratedRangeAssertionBlock> {
  const sourceLine = context.sourceLines[targetSourceIndex]
  const tokens = await tokenizeSourceLineForGeneration(context, targetSourceIndex)
  const ranges = resolveSelectionRanges(tokens, sourceLine.text, target)

  if (ranges.length === 0) {
    return {
      assertionLines: [],
      ranges
    }
  }

  return {
    assertionLines: renderAssertionBlock(
      context.commentToken,
      sourceLine.text,
      clipTokensToRanges(tokens, ranges),
      toRenderOptions(context, options)
    ),
    ranges
  }
}

function toRenderOptions(context: AssertionGenerationContext, options: AssertionGenerationOptions): RenderOptions {
  return {
    compactRanges: options.compactRanges,
    headerScope: context.scopeName,
    scopeMode: options.scopeMode
  }
}

async function tokenizeSourceLineForGeneration(
  context: AssertionGenerationContext,
  targetSourceIndex: number
): Promise<readonly import('vscode-textmate').IToken[]> {
  if (!context.logGrammarDetails) {
    return tokenizeSourceLine(context.grammars, context.scopeName, context.sourceLines, targetSourceIndex)
  }

  const sourceLine = context.sourceLines[targetSourceIndex]
  const result = await tokenizeSourceLineWithTrace(
    context.grammars,
    context.scopeName,
    context.sourceLines,
    targetSourceIndex,
    context.sourcedGrammars
  )

  context.onGrammarTrace?.(formatTokenizationTraceLines(result.trace, sourceLine.documentLine + 1))

  return result.tokens
}
