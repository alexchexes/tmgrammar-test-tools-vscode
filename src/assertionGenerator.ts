import { GrammarContribution } from './grammarTypes'
import { RenderOptions, ScopeMode, renderAssertionBlock } from './render'
import { CharacterRange, SelectionRangeTarget, clipTokensToRanges, resolveSelectionRanges } from './selectionTargets'
import { SourceLine } from './syntaxTestCore'
import { tokenizeSourceLine } from './textmate'

export interface AssertionGenerationContext {
  commentToken: string
  grammars: readonly GrammarContribution[]
  scopeName: string
  sourceLines: readonly SourceLine[]
}

export interface AssertionGenerationOptions {
  compactRanges: boolean
  scopeMode: ScopeMode
}

export interface GeneratedRangeAssertionBlock {
  assertionLines: readonly string[]
  ranges: readonly CharacterRange[]
}

export async function generateLineAssertionBlock(
  context: AssertionGenerationContext,
  targetSourceIndex: number,
  options: AssertionGenerationOptions
): Promise<readonly string[]> {
  const sourceLine = context.sourceLines[targetSourceIndex]
  const tokens = await tokenizeSourceLine(context.grammars, context.scopeName, context.sourceLines, targetSourceIndex)

  return renderAssertionBlock(context.commentToken, sourceLine.text, tokens, toRenderOptions(context, options))
}

export async function generateRangeAssertionBlock(
  context: AssertionGenerationContext,
  targetSourceIndex: number,
  target: SelectionRangeTarget,
  options: AssertionGenerationOptions
): Promise<GeneratedRangeAssertionBlock> {
  const sourceLine = context.sourceLines[targetSourceIndex]
  const tokens = await tokenizeSourceLine(context.grammars, context.scopeName, context.sourceLines, targetSourceIndex)
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
