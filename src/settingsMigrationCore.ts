import { GrammarSourceRule } from './grammarSourceRulesCore'

export interface LegacyGrammarProviderSettings {
  command?: string
  cwd?: string
  scopes?: readonly string[]
  timeoutMs?: number
}

export interface LegacyGrammarSettingsSnapshot {
  configPath?: string
  provider?: LegacyGrammarProviderSettings
}

export function migrateLegacyGrammarSettingsToGrammarSources(
  settings: LegacyGrammarSettingsSnapshot
): readonly GrammarSourceRule[] {
  const rules: GrammarSourceRule[] = []
  const configPath = settings.configPath?.trim()
  const providerCommand = settings.provider?.command?.trim()
  const providerCwd = settings.provider?.cwd?.trim()
  const providerScopes = normalizeStringList(settings.provider?.scopes)

  if (configPath) {
    rules.push({
      configPath
    })
  }

  if (providerCommand) {
    rules.push({
      provider: {
        command: providerCommand,
        cwd: providerCwd && providerCwd.length > 0 ? providerCwd : undefined,
        timeoutMs:
          typeof settings.provider?.timeoutMs === 'number' && Number.isFinite(settings.provider.timeoutMs)
            ? settings.provider.timeoutMs
            : undefined
      },
      when:
        providerScopes.length > 0
          ? {
              scopes: providerScopes
            }
          : undefined
    })
  }

  return rules
}

function normalizeStringList(value: readonly string[] | undefined): string[] {
  return (value ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}
