import * as vscode from 'vscode'
import { combineGlobPatterns, normalizeGlobList } from './testDiscoveryCore'

export interface WorkspaceTestDiscoveryConfiguration {
  exclude: readonly string[]
  include: readonly string[]
}

export function getWorkspaceTestDiscoveryConfiguration(
  workspaceFolder: vscode.WorkspaceFolder
): WorkspaceTestDiscoveryConfiguration {
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', workspaceFolder.uri)

  return {
    exclude: normalizeGlobList(configuration.get<readonly string[]>('testDiscovery.exclude')),
    include: normalizeGlobList(configuration.get<readonly string[]>('testDiscovery.include'))
  }
}

export function buildWorkspaceDiscoveryExcludePattern(
  workspaceFolder: vscode.WorkspaceFolder,
  exclude: readonly string[]
): vscode.RelativePattern | undefined {
  const pattern = combineGlobPatterns(exclude)
  return pattern ? new vscode.RelativePattern(workspaceFolder, pattern) : undefined
}
