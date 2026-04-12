export type MinimalTailScopeCount = 1 | 2

export interface ResolvedMinimalTailScopeCount {
  value: MinimalTailScopeCount
  warning?: string
}

export function normalizeMinimalTailScopeCount(value: number | undefined): MinimalTailScopeCount {
  return resolveMinimalTailScopeCount(value).value
}

export function resolveMinimalTailScopeCount(value: number | undefined): ResolvedMinimalTailScopeCount {
  if (value === 1 || value === 2) {
    return { value }
  }

  if (value === undefined) {
    return { value: 1 }
  }

  const effectiveValue: MinimalTailScopeCount = Number.isFinite(value) && value >= 3 ? 2 : 1

  return {
    value: effectiveValue,
    warning: `Invalid tmGrammarTestTools.minimalTailScopeCount value: ${String(value)}. Expected 1 or 2. Using ${effectiveValue}.`
  }
}
