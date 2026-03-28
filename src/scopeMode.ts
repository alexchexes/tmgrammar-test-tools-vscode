import { ScopeMode } from './render'

export function normalizeScopeMode(scopeMode: string | undefined): ScopeMode {
  return scopeMode === 'minimal' ? 'minimal' : 'full'
}

export function resolveScopeMode(configuredScopeMode: string | undefined, commandScopeMode?: ScopeMode): ScopeMode {
  return commandScopeMode ?? normalizeScopeMode(configuredScopeMode)
}
