import * as vscode from 'vscode'
import { logInfo, logWarn } from './log'
import { migrateLegacyGrammarSettingsToGrammarSources } from './settingsMigrationCore'

const LEGACY_SETTING_KEYS = [
  'configPath',
  'grammarProvider.command',
  'grammarProvider.cwd',
  'grammarProvider.scopes',
  'grammarProvider.timeoutMs'
] as const

interface SettingsMigrationScopeTarget {
  configurationScope?: vscode.ConfigurationScope
  label: string
  target: vscode.ConfigurationTarget
}

interface InspectLike<T> {
  globalLanguageValue?: T
  globalValue?: T
  workspaceFolderLanguageValue?: T
  workspaceFolderValue?: T
  workspaceLanguageValue?: T
  workspaceValue?: T
}

export async function runSettingsMigrations(): Promise<void> {
  const migratedScopes: string[] = []

  for (const target of getSettingsMigrationTargets()) {
    const languageIds = collectLegacyLanguageIds(target.configurationScope)
    const baseScopeResult = await migrateLegacyGrammarSettingsForScope(target)
    if (baseScopeResult) {
      migratedScopes.push(baseScopeResult)
    }

    for (const languageId of languageIds) {
      const languageScopeResult = await migrateLegacyGrammarSettingsForScope(target, languageId)
      if (languageScopeResult) {
        migratedScopes.push(languageScopeResult)
      }
    }
  }

  if (migratedScopes.length === 0) {
    return
  }

  migratedScopes.forEach((scopeLabel) =>
    logInfo(`Migrated legacy tmGrammarTestTools grammar settings to grammarSources for ${scopeLabel}.`)
  )
  void vscode.window.showInformationMessage(
    `TM Grammar Test Tools migrated legacy grammar settings to tmGrammarTestTools.grammarSources for ${migratedScopes.length} scope(s).`
  )
}

async function migrateLegacyGrammarSettingsForScope(
  target: SettingsMigrationScopeTarget,
  languageId?: string
): Promise<string | undefined> {
  const configurationScope = withOptionalLanguageId(target.configurationScope, languageId)
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', configurationScope)
  const existingGrammarSources = getConfiguredValueForTarget(configuration.inspect<unknown>('grammarSources'), target.target, languageId)
  const legacySettings = {
    configPath: getConfiguredValueForTarget(configuration.inspect<string>('configPath'), target.target, languageId),
    provider: {
      command: getConfiguredValueForTarget(configuration.inspect<string>('grammarProvider.command'), target.target, languageId),
      cwd: getConfiguredValueForTarget(configuration.inspect<string>('grammarProvider.cwd'), target.target, languageId),
      scopes: getConfiguredValueForTarget(configuration.inspect<string[]>('grammarProvider.scopes'), target.target, languageId),
      timeoutMs: getConfiguredValueForTarget(
        configuration.inspect<number>('grammarProvider.timeoutMs'),
        target.target,
        languageId
      )
    }
  }
  const migratedGrammarSources = migrateLegacyGrammarSettingsToGrammarSources(legacySettings)

  if (migratedGrammarSources.length === 0) {
    return undefined
  }

  const scopeLabel = formatScopeLabel(target.label, languageId)
  if (existingGrammarSources !== undefined) {
    logWarn(`Skipping legacy grammar settings migration for ${scopeLabel} because grammarSources is already configured there.`)
    return undefined
  }

  await configuration.update('grammarSources', migratedGrammarSources, target.target, languageId !== undefined)

  for (const legacyKey of LEGACY_SETTING_KEYS) {
    await configuration.update(legacyKey, undefined, target.target, languageId !== undefined)
  }

  return scopeLabel
}

function getSettingsMigrationTargets(): readonly SettingsMigrationScopeTarget[] {
  const targets: SettingsMigrationScopeTarget[] = [
    {
      label: 'global settings',
      target: vscode.ConfigurationTarget.Global
    }
  ]

  if (vscode.workspace.workspaceFile || (vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
    targets.push({
      label: 'workspace settings',
      target: vscode.ConfigurationTarget.Workspace
    })
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    targets.push({
      configurationScope: workspaceFolder,
      label: `workspace folder "${workspaceFolder.name}"`,
      target: vscode.ConfigurationTarget.WorkspaceFolder
    })
  }

  return targets
}

function collectLegacyLanguageIds(configurationScope?: vscode.ConfigurationScope): readonly string[] {
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', configurationScope)
  const languageIds = new Set<string>()

  for (const legacyKey of LEGACY_SETTING_KEYS) {
    configuration.inspect(legacyKey)?.languageIds?.forEach((languageId) => languageIds.add(languageId))
  }

  return Array.from(languageIds).sort()
}

function withOptionalLanguageId(
  configurationScope: vscode.ConfigurationScope | undefined,
  languageId?: string
): vscode.ConfigurationScope | undefined {
  if (!languageId) {
    return configurationScope
  }

  if (!configurationScope || configurationScope instanceof vscode.Uri) {
    return {
      languageId,
      uri: configurationScope
    }
  }

  if ('uri' in configurationScope) {
    return {
      languageId,
      uri: configurationScope.uri
    }
  }

  return {
    languageId
  }
}

function getConfiguredValueForTarget<T>(
  inspected: InspectLike<T> | undefined,
  target: vscode.ConfigurationTarget,
  languageId?: string
): T | undefined {
  if (!inspected) {
    return undefined
  }

  if (target === vscode.ConfigurationTarget.Global) {
    return languageId ? inspected.globalLanguageValue : inspected.globalValue
  }

  if (target === vscode.ConfigurationTarget.Workspace) {
    return languageId ? inspected.workspaceLanguageValue : inspected.workspaceValue
  }

  return languageId ? inspected.workspaceFolderLanguageValue : inspected.workspaceFolderValue
}

function formatScopeLabel(baseLabel: string, languageId?: string): string {
  return languageId ? `${baseLabel} [${languageId}]` : baseLabel
}
