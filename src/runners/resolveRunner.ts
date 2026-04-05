import * as vscode from 'vscode'
import { ResolvedGrammarTestRunner } from './types'
import { createVscodeTmgrammarTestRunner } from './vscodeTmgrammarTestRunner'
import { getBundledVscodeTmgrammarTestRuntime } from './vscodeTmgrammarTestRuntime'

const bundledVscodeTmgrammarTestRunner = createVscodeTmgrammarTestRunner(getBundledVscodeTmgrammarTestRuntime)

export function resolveGrammarTestRunner(_document: vscode.TextDocument): ResolvedGrammarTestRunner {
  return {
    family: 'vscode-tmgrammar-test',
    id: 'vscode-tmgrammar-test:bundled',
    runner: bundledVscodeTmgrammarTestRunner,
    source: 'bundled'
  }
}
