import { createRequire } from 'node:module'
import { GrammarContribution } from '../grammarTypes'
import { GrammarTestCase, GrammarTestFailure } from '../testingModel'
import { GrammarTestRegistry } from './types'

export interface VscodeTmgrammarTestRuntime {
  createRegistry: (grammars: readonly GrammarContribution[]) => GrammarTestRegistry
  parseGrammarTestCase: (value: string) => GrammarTestCase
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[]
  runGrammarTestCase: (registry: GrammarTestRegistry, testCase: GrammarTestCase) => Promise<GrammarTestFailure[]>
}

let extensionRuntime: VscodeTmgrammarTestRuntime | undefined
const localRuntimeCache = new Map<string, VscodeTmgrammarTestRuntime>()

export function getExtensionVscodeTmgrammarTestRuntime(): VscodeTmgrammarTestRuntime {
  if (extensionRuntime) {
    return extensionRuntime
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

  extensionRuntime = {
    createRegistry,
    parseGrammarTestCase,
    parseScopeAssertion,
    runGrammarTestCase
  }

  return extensionRuntime
}

export function getLocalVscodeTmgrammarTestRuntime(packageJsonPath: string): VscodeTmgrammarTestRuntime {
  const cachedRuntime = localRuntimeCache.get(packageJsonPath)
  if (cachedRuntime) {
    return cachedRuntime
  }

  const localRequire = createRequire(packageJsonPath)
  const { createRegistry } = localRequire('vscode-tmgrammar-test/dist/common/index') as Pick<
    VscodeTmgrammarTestRuntime,
    'createRegistry'
  >
  const { parseGrammarTestCase, runGrammarTestCase } = localRequire('vscode-tmgrammar-test/dist/unit/index') as Pick<
    VscodeTmgrammarTestRuntime,
    'parseGrammarTestCase' | 'runGrammarTestCase'
  >
  const { parseScopeAssertion } = localRequire('vscode-tmgrammar-test/dist/unit/parsing') as Pick<
    VscodeTmgrammarTestRuntime,
    'parseScopeAssertion'
  >

  const runtime = {
    createRegistry,
    parseGrammarTestCase,
    parseScopeAssertion,
    runGrammarTestCase
  }
  localRuntimeCache.set(packageJsonPath, runtime)
  return runtime
}
