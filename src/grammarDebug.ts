import { SourcedGrammarContribution } from './grammarSources'
import { resolveGrammarContributionScopes } from './textmate'

export async function resolveSourcedGrammarEntries(
  entries: readonly SourcedGrammarContribution[]
): Promise<readonly SourcedGrammarContribution[]> {
  if (!entries.some((entry) => entry.grammar.scopeName.length === 0)) {
    return entries
  }

  const resolvedGrammars = await resolveGrammarContributionScopes(entries.map((entry) => entry.grammar))
  return entries.map((entry, index) => ({
    ...entry,
    grammar: resolvedGrammars[index]
  }))
}

export function getEssentialGrammarSummaryLines(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  requestedScopeName: string,
  detailedTraceHint = 'Enable detailed grammar logging for the full trace.'
): readonly string[] {
  const lines: string[] = []
  const baseCandidates = collectScopeCandidates(sourcedGrammars, requestedScopeName)
  if (baseCandidates.length === 0) {
    lines.push(`Base grammar winner: ${requestedScopeName} -> <not found>`)
    return lines
  }

  const baseWinner = baseCandidates[baseCandidates.length - 1]
  lines.push(`Base grammar winner: ${requestedScopeName} -> ${formatSourcedGrammarEntry(baseWinner)}`)

  if (baseCandidates.length > 1) {
    lines.push(
      `Base grammar lower-priority candidates: ${baseCandidates
        .slice(0, -1)
        .map((entry) => formatSourcedGrammarEntry(entry))
        .join('; ')}`
    )
  }

  const { inheritedCount, specificInjections } = collectDirectInjectionWinners(sourcedGrammars, requestedScopeName)
  if (specificInjections.length > 0) {
    lines.push(
      `Direct injections for ${requestedScopeName}: ${specificInjections
        .map((entry) => `${entry.grammar.scopeName || '<no scope>'} -> ${formatSourcedGrammarEntry(entry)}`)
        .join('; ')}`
    )
  } else {
    lines.push(`Direct injections for ${requestedScopeName}: <none>`)
  }

  if (inheritedCount > 0) {
    lines.push(`Additional inherited injections via broader scopes: ${inheritedCount} winner(s). ${detailedTraceHint}`)
  }

  return lines
}

export function formatSourcedGrammarEntry(entry: SourcedGrammarContribution): string {
  const grammar = entry.grammar
  const language = grammar.language ? ` language=${grammar.language}` : ''
  const injectTo =
    grammar.injectTo && grammar.injectTo.length > 0 ? ` injectTo=${grammar.injectTo.join(',')}` : ''
  return `[${entry.source}] ${grammar.path}${language}${injectTo}`
}

function collectDirectInjectionWinners(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  requestedScopeName: string
): {
  inheritedCount: number
  specificInjections: readonly SourcedGrammarContribution[]
} {
  const scopeChain = getScopeChain(requestedScopeName)
  const broaderScopes = new Set(scopeChain.slice(0, -1))
  const specificWinners: SourcedGrammarContribution[] = []
  let inheritedCount = 0

  for (const [, candidates] of groupInjectionCandidatesByScope(sourcedGrammars, scopeChain)) {
    const winner = candidates[candidates.length - 1]
    const injectTo = winner.grammar.injectTo ?? []
    if (injectTo.includes(requestedScopeName)) {
      specificWinners.push(winner)
      continue
    }

    if (injectTo.some((scope) => broaderScopes.has(scope))) {
      inheritedCount++
    }
  }

  specificWinners.sort((left, right) => left.grammar.scopeName.localeCompare(right.grammar.scopeName))
  return {
    inheritedCount,
    specificInjections: specificWinners
  }
}

function collectScopeCandidates(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  scopeName: string
): readonly SourcedGrammarContribution[] {
  return sourcedGrammars.filter((entry) => entry.grammar.scopeName === scopeName)
}

function groupInjectionCandidatesByScope(
  sourcedGrammars: readonly SourcedGrammarContribution[],
  scopeChain: readonly string[]
): Map<string, SourcedGrammarContribution[]> {
  const groups = new Map<string, SourcedGrammarContribution[]>()
  for (const entry of sourcedGrammars) {
    const injectTo = entry.grammar.injectTo ?? []
    if (!injectTo.some((scope) => scopeChain.includes(scope))) {
      continue
    }

    const group = groups.get(entry.grammar.scopeName)
    if (group) {
      group.push(entry)
    } else {
      groups.set(entry.grammar.scopeName, [entry])
    }
  }

  return groups
}

function getScopeChain(scopeName: string): readonly string[] {
  const parts = scopeName.split('.')
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'))
}
