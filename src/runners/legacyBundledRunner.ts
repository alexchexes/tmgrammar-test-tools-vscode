import { GrammarContribution } from '../grammarTypes'
import { GrammarTestCase, GrammarTestFailure } from '../testingModel'
import { parseGrammarTestCaseWithCompat } from '../tmgrammarTestCompat'
import { GrammarTestRegistry, GrammarTestRunner } from './types'

type VscodeTmgrammarTestCommonApi = {
  createRegistry: (grammars: readonly GrammarContribution[]) => GrammarTestRegistry
}

type VscodeTmgrammarTestUnitApi = {
  parseGrammarTestCase: (value: string) => GrammarTestCase
  runGrammarTestCase: (registry: GrammarTestRegistry, testCase: GrammarTestCase) => Promise<GrammarTestFailure[]>
}

type VscodeTmgrammarTestParsingApi = {
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[]
}

type VscodeTmgrammarTestRuntime = VscodeTmgrammarTestCommonApi &
  VscodeTmgrammarTestUnitApi &
  VscodeTmgrammarTestParsingApi

let runtime: VscodeTmgrammarTestRuntime | undefined

function getRuntime(): VscodeTmgrammarTestRuntime {
  if (runtime) {
    return runtime
  }

  const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as VscodeTmgrammarTestCommonApi
  const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as VscodeTmgrammarTestUnitApi
  const { parseScopeAssertion } = require('vscode-tmgrammar-test/dist/unit/parsing') as VscodeTmgrammarTestParsingApi

  runtime = {
    createRegistry,
    parseGrammarTestCase,
    parseScopeAssertion,
    runGrammarTestCase
  }

  return runtime
}

const legacyBundledRunner: GrammarTestRunner = {
  createRegistry(grammars) {
    return getRuntime().createRegistry(grammars)
  },

  parseTestCase(text, lineNumberMap) {
    const currentRuntime = getRuntime()
    return parseGrammarTestCaseWithCompat(
      text,
      currentRuntime.parseGrammarTestCase,
      currentRuntime.parseScopeAssertion,
      lineNumberMap
    )
  },

  runTestCase(registry, testCase) {
    return getRuntime().runGrammarTestCase(registry, testCase)
  }
}

export function getLegacyBundledRunner(): GrammarTestRunner {
  return legacyBundledRunner
}
