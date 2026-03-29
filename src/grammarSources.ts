import { GrammarContribution } from './grammarConfig'

export interface GrammarSourceSet {
  grammars: readonly GrammarContribution[]
  installedCount: number
  localCount: number
  providerCount: number
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
