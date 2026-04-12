export type MinimalHeaderScopeFactoring = 'omitSharedHeader' | 'keepSharedHeader'

export interface ResolvedMinimalHeaderScopeFactoring {
  value: MinimalHeaderScopeFactoring
  warning?: string
}

export function normalizeMinimalHeaderScopeFactoring(value: string | undefined): MinimalHeaderScopeFactoring {
  return resolveMinimalHeaderScopeFactoring(value).value
}

export function resolveMinimalHeaderScopeFactoring(value: string | undefined): ResolvedMinimalHeaderScopeFactoring {
  if (value === 'omitSharedHeader' || value === 'keepSharedHeader') {
    return { value }
  }

  if (value === undefined) {
    return { value: 'omitSharedHeader' }
  }

  return {
    value: 'omitSharedHeader',
    warning:
      `Invalid tmGrammarTestTools.minimalHeaderScopeFactoring value: ${String(value)}. ` +
      'Expected "omitSharedHeader" or "keepSharedHeader". Using "omitSharedHeader".'
  }
}
