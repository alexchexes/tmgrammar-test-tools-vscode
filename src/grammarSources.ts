import { GrammarContribution } from './grammarTypes'

export interface GrammarSourceSet {
  grammars: readonly GrammarContribution[]
  configCount: number
  explicitCount: number
  installedCount: number
  providerCount: number
}

export interface SourcedGrammarContribution {
  grammar: GrammarContribution
  source: 'config' | 'explicit' | 'installed' | 'provider'
}

export function buildGrammarSourceSet(entries: readonly SourcedGrammarContribution[]): GrammarSourceSet {
  const installedCount = entries.filter((entry) => entry.source === 'installed').length
  const configCount = entries.filter((entry) => entry.source === 'config').length
  const explicitCount = entries.filter((entry) => entry.source === 'explicit').length
  const providerCount = entries.filter((entry) => entry.source === 'provider').length

  return {
    grammars: entries.map((entry) => entry.grammar),
    configCount,
    explicitCount,
    installedCount,
    providerCount
  }
}

export function buildDetailedGrammarSourceEntries(
  installedGrammars: readonly GrammarContribution[],
  configGrammars: readonly GrammarContribution[],
  explicitGrammars: readonly GrammarContribution[],
  providerGrammars: readonly GrammarContribution[],
  autoLoadInstalledGrammars: boolean
): readonly SourcedGrammarContribution[] {
  const effectiveInstalledGrammars = autoLoadInstalledGrammars ? installedGrammars : []

  return [
    ...effectiveInstalledGrammars.map((grammar) => ({ grammar, source: 'installed' as const })),
    ...configGrammars.map((grammar) => ({ grammar, source: 'config' as const })),
    ...explicitGrammars.map((grammar) => ({ grammar, source: 'explicit' as const })),
    ...providerGrammars.map((grammar) => ({ grammar, source: 'provider' as const }))
  ]
}
