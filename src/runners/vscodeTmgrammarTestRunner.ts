import { parseGrammarTestCaseWithCompat } from '../tmgrammarTestCompat'
import { GrammarTestRunner } from './types'
import { VscodeTmgrammarTestRuntime } from './vscodeTmgrammarTestRuntime'

export function createVscodeTmgrammarTestRunner(
  getRuntime: () => VscodeTmgrammarTestRuntime
): GrammarTestRunner {
  return {
    createRegistry(grammars) {
      return getRuntime().createRegistry(grammars)
    },

    parseTestCase(text, lineNumberMap) {
      const runtime = getRuntime()
      return parseGrammarTestCaseWithCompat(
        text,
        runtime.parseGrammarTestCase,
        runtime.parseScopeAssertion,
        lineNumberMap
      )
    },

    runTestCase(registry, testCase) {
      return getRuntime().runGrammarTestCase(registry, testCase)
    }
  }
}
