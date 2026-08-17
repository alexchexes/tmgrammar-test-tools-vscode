import * as path from 'node:path'

export interface GrammarSourceRuleWhen {
  files?: readonly string[]
  languageIds?: readonly string[]
  scopes?: readonly string[]
}

export interface GrammarSourceConfigPathRule {
  configPath: string
  when?: GrammarSourceRuleWhen
}

export interface GrammarSourceProviderRule {
  provider: {
    command: string
    cwd?: string
    timeoutMs?: number
  }
  when?: GrammarSourceRuleWhen
}

export interface GrammarSourceExplicitGrammarsRule {
  grammars: readonly string[]
  when?: GrammarSourceRuleWhen
}

export type GrammarSourceRule =
  | GrammarSourceConfigPathRule
  | GrammarSourceProviderRule
  | GrammarSourceExplicitGrammarsRule

export interface NormalizedGrammarSourceRule {
  kind: 'configPath' | 'provider' | 'grammars'
  configPath?: string
  grammars?: readonly string[]
  provider?: {
    command: string
    cwd?: string
    timeoutMs: number
  }
  when: Required<GrammarSourceRuleWhen>
}

export interface GrammarSourceRuleMatchContext {
  absoluteFilePath?: string
  languageId?: string
  workspaceRelativeFilePath?: string
}

export interface NormalizedGrammarSourceRulesResult {
  rules: readonly NormalizedGrammarSourceRule[]
  warnings: readonly string[]
}

export function normalizeGrammarSourceRules(value: unknown): NormalizedGrammarSourceRulesResult {
  if (!Array.isArray(value)) {
    return {
      rules: [],
      warnings: value === undefined ? [] : ['Invalid tmGrammarTestTools.grammarSources value. Expected an array of rules.']
    }
  }

  const rules: NormalizedGrammarSourceRule[] = []
  const warnings: string[] = []

  for (const [index, ruleValue] of value.entries()) {
    const normalizedRule = normalizeGrammarSourceRule(ruleValue, index + 1)
    if (normalizedRule.warning) {
      warnings.push(normalizedRule.warning)
    }

    if (normalizedRule.rule) {
      rules.push(normalizedRule.rule)
    }
  }

  return {
    rules,
    warnings
  }
}

export function matchesGrammarSourceRule(
  rule: NormalizedGrammarSourceRule,
  context: GrammarSourceRuleMatchContext,
  targetScopeName?: string
): boolean {
  if (rule.when.files.length > 0) {
    const candidatePaths = [context.absoluteFilePath, context.workspaceRelativeFilePath].filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    )

    if (
      candidatePaths.length === 0 ||
      !rule.when.files.some((pattern) => candidatePaths.some((candidatePath) => path.matchesGlob(candidatePath, pattern)))
    ) {
      return false
    }
  }

  if (rule.when.languageIds.length > 0) {
    if (!context.languageId || !rule.when.languageIds.includes(context.languageId)) {
      return false
    }
  }

  if (targetScopeName && rule.when.scopes.length > 0 && !rule.when.scopes.includes(targetScopeName)) {
    return false
  }

  return true
}

function normalizeGrammarSourceRule(
  value: unknown,
  humanIndex: number
): { rule?: NormalizedGrammarSourceRule; warning?: string } {
  if (!isObject(value)) {
    return {
      warning: `Ignoring tmGrammarTestTools.grammarSources[${humanIndex - 1}] because each rule must be an object.`
    }
  }

  const when = normalizeRuleWhen(value.when)
  const normalizedConfigPath = typeof value.configPath === 'string' ? value.configPath.trim() : ''
  const hasConfigPath = normalizedConfigPath.length > 0
  const normalizedGrammars = normalizeStringListLike(value.grammars)
  const hasGrammars = normalizedGrammars.length > 0
  const normalizedProvider = normalizeProviderRule(value.provider)
  const hasProvider = normalizedProvider !== undefined
  const sourceModeCount = Number(hasConfigPath) + Number(hasGrammars) + Number(hasProvider)

  if (sourceModeCount !== 1) {
    return {
      warning:
        `Ignoring tmGrammarTestTools.grammarSources[${humanIndex - 1}] because each rule must define exactly one source ` +
        'mode: configPath, grammars, or provider.'
    }
  }

  if (hasConfigPath) {
    return {
      rule: {
        configPath: normalizedConfigPath,
        kind: 'configPath',
        when
      }
    }
  }

  if (hasGrammars) {
    return {
      rule: {
        grammars: normalizedGrammars,
        kind: 'grammars',
        when
      }
    }
  }

  if (hasProvider && normalizedProvider) {
    return {
      rule: {
        kind: 'provider',
        provider: normalizedProvider,
        when
      }
    }
  }

  return {
    warning: `Ignoring tmGrammarTestTools.grammarSources[${humanIndex - 1}] because it could not be normalized.`
  }
}

function normalizeRuleWhen(value: unknown): Required<GrammarSourceRuleWhen> {
  if (!isObject(value)) {
    return {
      files: [],
      languageIds: [],
      scopes: []
    }
  }

  return {
    files: normalizeStringListLike(value.files),
    languageIds: normalizeStringListLike(value.languageIds),
    scopes: normalizeStringListLike(value.scopes)
  }
}

function normalizeProviderRule(
  value: unknown
): { command: string; cwd?: string; timeoutMs: number } | undefined {
  if (!isObject(value) || typeof value.command !== 'string' || value.command.trim().length === 0) {
    return undefined
  }

  return {
    command: value.command.trim(),
    cwd: typeof value.cwd === 'string' && value.cwd.trim().length > 0 ? value.cwd.trim() : undefined,
    timeoutMs: normalizeProviderTimeout(value.timeoutMs)
  }
}

function normalizeProviderTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1000) {
    return 30000
  }

  return Math.trunc(value)
}

function normalizeStringListLike(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? [trimmedValue] : []
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
