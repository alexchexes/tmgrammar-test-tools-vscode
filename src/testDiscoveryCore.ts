export function normalizeGlobList(value: readonly string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export function combineGlobPatterns(globs: readonly string[]): string | undefined {
  if (globs.length === 0) {
    return undefined
  }

  if (globs.length === 1) {
    return globs[0]
  }

  return `{${globs.join(',')}}`
}
