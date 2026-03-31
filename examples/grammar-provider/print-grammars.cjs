#!/usr/bin/env node

// Example grammar provider for TM Grammar Test Tools.
//
// Relative paths are resolved against tmGrammarTestTools.grammarProvider.cwd
// (or the provider's default cwd if that setting is omitted).

const grammars = [
  'syntaxes/source.base.tmLanguage.json',
  {
    path: 'syntaxes/source.injection.tmLanguage.json',
    scopeName: 'source.injection',
    injectTo: ['source.base']
  }
]

process.stdout.write(`${JSON.stringify(grammars, null, 2)}\n`)
