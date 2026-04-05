import { GrammarContribution } from '../grammarTypes'
import { GrammarTestCase, GrammarTestFailure } from '../testingModel'
import { GrammarTestRegistry } from './types'

export interface VscodeTmgrammarTestRuntime {
  createRegistry: (grammars: readonly GrammarContribution[]) => GrammarTestRegistry
  parseGrammarTestCase: (value: string) => GrammarTestCase
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[]
  runGrammarTestCase: (registry: GrammarTestRegistry, testCase: GrammarTestCase) => Promise<GrammarTestFailure[]>
}

let bundledRuntime: VscodeTmgrammarTestRuntime | undefined

export function getBundledVscodeTmgrammarTestRuntime(): VscodeTmgrammarTestRuntime {
  if (bundledRuntime) {
    return bundledRuntime
  }

  const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as Pick<
    VscodeTmgrammarTestRuntime,
    'createRegistry'
  >
  const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as Pick<
    VscodeTmgrammarTestRuntime,
    'parseGrammarTestCase' | 'runGrammarTestCase'
  >
  const { parseScopeAssertion } = require('vscode-tmgrammar-test/dist/unit/parsing') as Pick<
    VscodeTmgrammarTestRuntime,
    'parseScopeAssertion'
  >

  bundledRuntime = {
    createRegistry,
    parseGrammarTestCase,
    parseScopeAssertion,
    runGrammarTestCase
  }

  return bundledRuntime
}
