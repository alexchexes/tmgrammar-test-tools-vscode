import * as vscode from 'vscode'
import { resolveNonWorkspaceSettingValue, shouldUseWorkspaceScopedSettings } from './settingsCore'

export interface EffectiveTmGrammarConfiguration {
  get<T>(key: string): T | undefined
  usesWorkspaceScopedSettings: boolean
}

export function getEffectiveTmGrammarConfiguration(document: vscode.TextDocument): EffectiveTmGrammarConfiguration {
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  const usesWorkspaceScopedSettings = shouldUseWorkspaceScopedSettings(document.uri.scheme, workspaceFolder !== undefined)
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)

  return {
    get<T>(key: string): T | undefined {
      if (usesWorkspaceScopedSettings) {
        return configuration.get<T>(key)
      }

      return resolveNonWorkspaceSettingValue(configuration.inspect<T>(key))
    },
    usesWorkspaceScopedSettings
  }
}

export function getEffectiveWorkspaceFolder(document: vscode.TextDocument): vscode.WorkspaceFolder | undefined {
  const directWorkspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  if (directWorkspaceFolder) {
    return directWorkspaceFolder
  }

  if (document.uri.scheme === 'untitled' && vscode.workspace.workspaceFolders?.length === 1) {
    return vscode.workspace.workspaceFolders[0]
  }

  return undefined
}
