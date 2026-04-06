import * as path from 'node:path'
import * as vscode from 'vscode'
import { getEffectiveWorkspaceFolder } from '../settings'
import { resolveLocalRunnerTrustDecision } from './resolveRunnerCore'
import { ResolvedGrammarTestRunner } from './types'
import { createVscodeTmgrammarTestRunner } from './vscodeTmgrammarTestRunner'
import {
  getExtensionVscodeTmgrammarTestRuntime,
  getLocalVscodeTmgrammarTestRuntime
} from './vscodeTmgrammarTestRuntime'
import {
  findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath,
  resolveLocalVscodeTmgrammarTestPackageJsonPath
} from './vscodeTmgrammarTestResolution'

const extensionVscodeTmgrammarTestRunner = createVscodeTmgrammarTestRunner(getExtensionVscodeTmgrammarTestRuntime)
const localVscodeTmgrammarTestRunners = new Map<string, ReturnType<typeof createVscodeTmgrammarTestRunner>>()

export function resolveGrammarTestRunner(_document: vscode.TextDocument): ResolvedGrammarTestRunner {
  const trustDecision = resolveLocalRunnerTrustDecision(vscode.workspace.isTrusted)
  if (!trustDecision.allowLocalResolution) {
    return {
      family: 'vscode-tmgrammar-test',
      id: 'vscode-tmgrammar-test:bundled',
      runner: extensionVscodeTmgrammarTestRunner,
      resolutionWarning: trustDecision.resolutionWarning,
      source: 'bundled'
    }
  }

  const searchDirectory = getDocumentRunnerSearchDirectory(_document)
  if (!searchDirectory) {
    return {
      family: 'vscode-tmgrammar-test',
      id: 'vscode-tmgrammar-test:bundled',
      runner: extensionVscodeTmgrammarTestRunner,
      source: 'bundled'
    }
  }

  const localPackageJsonPath = resolveLocalVscodeTmgrammarTestPackageJsonPath(searchDirectory)
  if (localPackageJsonPath) {
    return {
      family: 'vscode-tmgrammar-test',
      id: `vscode-tmgrammar-test:localDependency:${localPackageJsonPath}`,
      runner: getLocalVscodeTmgrammarTestRunner(localPackageJsonPath),
      source: 'localDependency',
      sourcePath: localPackageJsonPath
    }
  }

  const declaredDependencyPackageJsonPath =
    findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath(searchDirectory)

  return {
    family: 'vscode-tmgrammar-test',
    id: 'vscode-tmgrammar-test:bundled',
    resolutionNotificationKey: declaredDependencyPackageJsonPath,
    runner: extensionVscodeTmgrammarTestRunner,
    resolutionWarning: declaredDependencyPackageJsonPath
      ? `Local vscode-tmgrammar-test is declared in ${declaredDependencyPackageJsonPath} but could not be resolved from ${searchDirectory}. Falling back to the bundled runner. Ensure dependencies are installed.`
      : undefined,
    source: 'bundled'
  }
}

function getLocalVscodeTmgrammarTestRunner(packageJsonPath: string) {
  const cachedRunner = localVscodeTmgrammarTestRunners.get(packageJsonPath)
  if (cachedRunner) {
    return cachedRunner
  }

  const runner = createVscodeTmgrammarTestRunner(() => getLocalVscodeTmgrammarTestRuntime(packageJsonPath))
  localVscodeTmgrammarTestRunners.set(packageJsonPath, runner)
  return runner
}

function getDocumentRunnerSearchDirectory(document: vscode.TextDocument): string | undefined {
  if (document.uri.scheme === 'file') {
    return path.dirname(document.uri.fsPath)
  }

  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  return workspaceFolder?.uri.fsPath
}
