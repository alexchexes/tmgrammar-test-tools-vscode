export function shouldRunProviderForScope(
  targetScopeName: string,
  configuredScopes: readonly string[] | undefined
): boolean {
  return !configuredScopes || configuredScopes.includes(targetScopeName)
}

export function normalizeConfiguredProviderScopes(
  configuredScopes: readonly string[] | undefined
): readonly string[] | undefined {
  if (!configuredScopes) {
    return undefined
  }

  const normalizedScopes = configuredScopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0)
  return normalizedScopes.length > 0 ? normalizedScopes : undefined
}
