import { SelectionInput, collectSelectionRangeTargets } from './selectionTargets'
import { resolveInsertTargets } from './selectionIntent'
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
  const autoTargets = resolveInsertTargets(sourceLines, rangeSelections, 'auto')
  const hasLineTargets = findTargetSourceLinesForSelections(sourceLines, lineSelections).length > 0
  const hasRangeTargets = collectSelectionRangeTargets(sourceLines, rangeSelections).length > 0
  const hasAutoTargets = autoTargets.lineTargets.length > 0 || autoTargets.rangeTargets.length > 0

  if (hasAutoTargets) {
    specs.push(createActionSpec('auto', 'full'))
    specs.push(createActionSpec('auto', 'minimal'))
  }

  if (hasLineTargets && !(autoTargets.lineTargets.length > 0 && autoTargets.rangeTargets.length === 0)) {
    specs.push(createActionSpec('line', 'full'))
    specs.push(createActionSpec('line', 'minimal'))
  }

  if (hasRangeTargets && !(autoTargets.rangeTargets.length > 0 && autoTargets.lineTargets.length === 0)) {
    specs.push(createActionSpec('range', 'full'))
    specs.push(createActionSpec('range', 'minimal'))
  }

  return specs
}

function createActionSpec(targetMode: 'auto' | 'line' | 'range', scopeMode: ScopeMode): AssertionCodeActionSpec {
  const scopeLabel = scopeMode === 'full' ? 'Full' : 'Minimal'
  const commandLabel =
    targetMode === 'auto' ? 'Insert Assertions' : `Insert ${targetMode === 'line' ? 'Line' : 'Range'} Assertions`

  return {
    commandId: resolveCommandId(targetMode, scopeMode),
    title: `${commandLabel} (${scopeLabel})`
  }
}

function resolveCommandId(targetMode: 'auto' | 'line' | 'range', scopeMode: ScopeMode): string {
  if (targetMode === 'auto') {
    return scopeMode === 'full'
      ? 'tmGrammarTestTools.insertAssertionsFull'
      : 'tmGrammarTestTools.insertAssertionsMinimal'
  }

  if (targetMode === 'line') {
    return scopeMode === 'full'
      ? 'tmGrammarTestTools.insertLineAssertionsFull'
      : 'tmGrammarTestTools.insertLineAssertionsMinimal'
  }

  return scopeMode === 'full'
    ? 'tmGrammarTestTools.insertRangeAssertionsFull'
    : 'tmGrammarTestTools.insertRangeAssertionsMinimal'
}
