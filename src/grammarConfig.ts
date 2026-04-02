import * as path from 'path'
import * as vscode from 'vscode'
import { findGrammarConfigPathForFile, loadGrammarContributionsFromConfig } from './grammarPackage'
import { GrammarContribution } from './grammarTypes'
import { resolveProjectRootForFile } from './projectRoots'
import { getEffectiveTmGrammarConfiguration, getEffectiveWorkspaceFolder } from './settings'

export type { GrammarContribution } from './grammarTypes'

export async function resolveConfigPath(document: vscode.TextDocument): Promise<string> {
  const configPath = await tryResolveConfigPath(document)
  if (configPath) {
    return configPath
  }

  throw new Error(
    'Could not find a package.json with contributes.grammars above the active file. Set tmGrammarTestTools.configPath to point at the grammar package.json.'
  )
}

export async function tryResolveConfigPath(document: vscode.TextDocument): Promise<string | undefined> {
  const configuration = getEffectiveTmGrammarConfiguration(document)
  const configuredPath = configuration.get<string>('configPath')?.trim()
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  const relativeBase =
    workspaceFolder?.uri.fsPath ?? (document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : undefined)

  return findGrammarConfigPathForFile(document.uri.fsPath, {
    configuredPath,
    relativeBase,
    searchRoot: workspaceFolder?.uri.fsPath
  })
}

export async function loadGrammarContributions(configPath: string): Promise<GrammarContribution[]> {
  return loadGrammarContributionsFromConfig(configPath)
}

export async function resolveProjectRoot(document: vscode.TextDocument): Promise<string> {
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath
  }

  return resolveProjectRootForFile(document.uri.fsPath)
}
