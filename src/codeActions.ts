import { SelectionInput, collectSelectionRangeTargets } from './selectionTargets'
import { ScopeMode } from './render'
import { findTargetSourceLinesForSelections, SelectionLineTarget, SourceLine } from './syntaxTestCore'

export interface AssertionCodeActionSpec {
  commandId: string
  title: string
}

export function collectAssertionCodeActionSpecs(
  sourceLines: readonly SourceLine[],
  lineSelections: readonly SelectionLineTarget[],
  rangeSelections: readonly SelectionInput[]
): AssertionCodeActionSpec[] {
  const specs: AssertionCodeActionSpec[] = []
  const hasLineTargets = findTargetSourceLinesForSelections(sourceLines, lineSelections).length > 0
  const hasRangeTargets = collectSelectionRangeTargets(sourceLines, rangeSelections).length > 0

  if (hasLineTargets) {
    specs.push(createActionSpec('line', 'full'))
    specs.push(createActionSpec('line', 'minimal'))
  }

  if (hasRangeTargets) {
    specs.push(createActionSpec('range', 'full'))
    specs.push(createActionSpec('range', 'minimal'))
  }

  return specs
}

function createActionSpec(targetMode: 'line' | 'range', scopeMode: ScopeMode): AssertionCodeActionSpec {
  const scopeLabel = scopeMode === 'full' ? 'Full' : 'Minimal'

  return {
    commandId: resolveCommandId(targetMode, scopeMode),
    title: `Insert ${targetMode === 'line' ? 'Line' : 'Range'} Assertions (${scopeLabel})`
  }
}

function resolveCommandId(targetMode: 'line' | 'range', scopeMode: ScopeMode): string {
  if (targetMode === 'line') {
    return scopeMode === 'full'
      ? 'tmGrammarTestTools.insertLineAssertionsFull'
      : 'tmGrammarTestTools.insertLineAssertionsMinimal'
  }

  return scopeMode === 'full'
    ? 'tmGrammarTestTools.insertRangeAssertionsFull'
    : 'tmGrammarTestTools.insertRangeAssertionsMinimal'
}
