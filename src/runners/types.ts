import { GrammarContribution } from '../grammarTypes'
import { GrammarTestCase, GrammarTestFailure } from '../testingModel'

export type GrammarTestRegistry = unknown

export interface GrammarTestRunner {
  createRegistry(grammars: readonly GrammarContribution[]): GrammarTestRegistry
  parseTestCase(text: string, lineNumberMap?: readonly number[]): GrammarTestCase
  runTestCase(registry: GrammarTestRegistry, testCase: GrammarTestCase): Promise<GrammarTestFailure[]>
}
