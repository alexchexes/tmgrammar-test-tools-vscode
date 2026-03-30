import { GrammarContribution } from './grammarTypes'

export interface GrammarSourceSet {
  grammars: readonly GrammarContribution[]
  installedCount: number
  localCount: number
  providerCount: number
}

export interface SourcedGrammarContribution {
  grammar: GrammarContribution
  source: 'installed' | 'local' | 'provider'
}

export function buildGrammarSourceSet(
  installedGrammars: readonly GrammarContribution[],
  localGrammars: readonly GrammarContribution[],
  providerGrammars: readonly GrammarContribution[],
  autoLoadInstalledGrammars: boolean
): GrammarSourceSet {
  const effectiveInstalledGrammars = autoLoadInstalledGrammars ? installedGrammars : []

  return {
    grammars: [...effectiveInstalledGrammars, ...localGrammars, ...providerGrammars],
    installedCount: effectiveInstalledGrammars.length,
    localCount: localGrammars.length,
    providerCount: providerGrammars.length
  }
}

export function buildDetailedGrammarSourceEntries(
  installedGrammars: readonly GrammarContribution[],
  localGrammars: readonly GrammarContribution[],
  providerGrammars: readonly GrammarContribution[],
  autoLoadInstalledGrammars: boolean
): readonly SourcedGrammarContribution[] {
  const effectiveInstalledGrammars = autoLoadInstalledGrammars ? installedGrammars : []

  return [
    ...effectiveInstalledGrammars.map((grammar) => ({ grammar, source: 'installed' as const })),
    ...localGrammars.map((grammar) => ({ grammar, source: 'local' as const })),
    ...providerGrammars.map((grammar) => ({ grammar, source: 'provider' as const }))
  ]
}
