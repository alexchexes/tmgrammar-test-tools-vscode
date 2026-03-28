import * as path from 'path'
import * as vscode from 'vscode'
import { GrammarContribution } from './grammarConfig'

interface ExtensionPackageJsonShape {
  contributes?: {
    grammars?: Array<{
      path?: unknown
      scopeName?: unknown
      injectTo?: unknown
      language?: unknown
    }>
  }
}

export function loadInstalledGrammarContributions(): GrammarContribution[] {
  const grammars: GrammarContribution[] = []

  for (const extension of vscode.extensions.all) {
    const packageJson = extension.packageJSON as ExtensionPackageJsonShape
    const contributedGrammars = packageJson.contributes?.grammars ?? []

    for (const grammar of contributedGrammars) {
      if (typeof grammar.path !== 'string' || grammar.path.length === 0) {
        continue
      }

      grammars.push({
        path: path.resolve(extension.extensionPath, grammar.path),
        scopeName: typeof grammar.scopeName === 'string' ? grammar.scopeName : '',
        injectTo: Array.isArray(grammar.injectTo)
          ? grammar.injectTo.filter((value): value is string => typeof value === 'string')
          : undefined,
        language: typeof grammar.language === 'string' ? grammar.language : undefined
      })
    }
  }

  return grammars
}
