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

  extensionRuntime = loadVscodeTmgrammarTestRuntime(
    (moduleId) => require(moduleId) as unknown,
    'Bundled vscode-tmgrammar-test',
    false
  )

  return extensionRuntime
}

export function getLocalVscodeTmgrammarTestRuntime(packageJsonPath: string): VscodeTmgrammarTestRuntime {
  const cachedRuntime = localRuntimeCache.get(packageJsonPath)
  if (cachedRuntime) {
    return cachedRuntime
  }

  const localRequire = createRequire(packageJsonPath)
  const runtime = loadVscodeTmgrammarTestRuntime(
    (moduleId) => localRequire(moduleId) as unknown,
    `Local vscode-tmgrammar-test resolved from ${packageJsonPath}`,
    true
  )
  localRuntimeCache.set(packageJsonPath, runtime)
  return runtime
}

function loadVscodeTmgrammarTestRuntime(
  loadModule: (moduleId: string) => unknown,
  sourceLabel: string,
  disallowBundledFallback: boolean
): VscodeTmgrammarTestRuntime {
  try {
    const commonIndex = loadModule('vscode-tmgrammar-test/dist/common/index') as Partial<
      Pick<VscodeTmgrammarTestRuntime, 'createRegistry'>
    >
    const unitIndex = loadModule('vscode-tmgrammar-test/dist/unit/index') as Partial<
      Pick<VscodeTmgrammarTestRuntime, 'parseGrammarTestCase' | 'runGrammarTestCase'>
    >
    const parsing = loadModule('vscode-tmgrammar-test/dist/unit/parsing') as Partial<
      Pick<VscodeTmgrammarTestRuntime, 'parseScopeAssertion'>
    >

    return {
      createRegistry: expectFunctionExport(commonIndex.createRegistry, 'createRegistry'),
      parseGrammarTestCase: expectFunctionExport(unitIndex.parseGrammarTestCase, 'parseGrammarTestCase'),
      parseScopeAssertion: expectFunctionExport(parsing.parseScopeAssertion, 'parseScopeAssertion'),
      runGrammarTestCase: expectFunctionExport(unitIndex.runGrammarTestCase, 'runGrammarTestCase')
    }
  } catch (error) {
    throw wrapRuntimeLoadError(sourceLabel, error, disallowBundledFallback)
  }
}

function expectFunctionExport<T extends (...args: never[]) => unknown>(value: unknown, exportName: string): T {
  if (typeof value !== 'function') {
    throw new Error(`Expected export "${exportName}" to be a function.`)
  }

  return value as T
}

function wrapRuntimeLoadError(
  sourceLabel: string,
  error: unknown,
  disallowBundledFallback: boolean
): Error {
  const detail = error instanceof Error ? error.message : String(error)
  const fallbackNote = disallowBundledFallback
    ? ' The extension will not fall back to the bundled runner because a local runner was resolved.'
    : ''
  return new Error(`${sourceLabel} is unusable or incompatible.${fallbackNote} ${detail}`)
}
