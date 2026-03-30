import * as assert from 'node:assert/strict'
import * as path from 'node:path'
import { test } from 'node:test'
import { SourcedGrammarContribution } from '../src/grammarSources'
import { tokenizeSourceLineWithTrace } from '../src/textmate'

test('tokenizeSourceLineWithTrace reports the winning scope contribution and overridden alternatives', async () => {
  const fixtureGrammarPath = path.resolve(__dirname, '../../fixtures/simple-grammar/syntaxes/simple-poc.tmLanguage.json')
  const sourcedGrammars: SourcedGrammarContribution[] = [
    {
      grammar: { path: fixtureGrammarPath, scopeName: 'source.simple-poc' },
      source: 'installed'
    },
    {
      grammar: { path: fixtureGrammarPath, scopeName: 'source.simple-poc' },
      source: 'provider'
    }
  ]

  const result = await tokenizeSourceLineWithTrace(
    sourcedGrammars.map((entry) => entry.grammar),
    'source.simple-poc',
    [
      { documentLine: 1, text: '' },
      { documentLine: 2, text: 'let value = 42' },
      { documentLine: 3, text: 'const answer = "ok"' }
    ],
    2,
    sourcedGrammars
  )

  assert.ok(result.tokens.length > 0)
  assert.deepEqual(result.trace.loadedScopes, [
    {
      scopeName: 'source.simple-poc',
      winner: {
        injectTo: undefined,
        language: undefined,
        path: fixtureGrammarPath,
        scopeName: 'source.simple-poc',
        source: 'provider'
      },
      overridden: [
        {
          injectTo: undefined,
          language: undefined,
          path: fixtureGrammarPath,
          scopeName: 'source.simple-poc',
          source: 'installed'
        }
      ]
    }
  ])
})
