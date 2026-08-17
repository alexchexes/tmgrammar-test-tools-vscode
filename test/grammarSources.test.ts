import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDetailedGrammarSourceEntries, buildGrammarSourceSet, SourcedGrammarContribution } from '../src/grammarSources'
import type { GrammarContribution } from '../src/grammarConfig'

function grammar(scopeName: string, path: string): GrammarContribution {
  return {
    path,
    scopeName
  }
}

test('buildGrammarSourceSet keeps the provided source entry order and counts each source kind', () => {
  const result = buildGrammarSourceSet([
    { grammar: grammar('source.base', '/installed/base.tmLanguage.json'), source: 'installed' },
    { grammar: grammar('source.provider', '/provider/provider.tmLanguage.json'), source: 'provider' },
    { grammar: grammar('source.config', '/config/config.tmLanguage.json'), source: 'config' },
    { grammar: grammar('source.explicit', '/explicit/one.tmLanguage.json'), source: 'explicit' }
  ])

  assert.deepEqual(
    result.grammars.map((entry) => entry.path),
    [
      '/installed/base.tmLanguage.json',
      '/provider/provider.tmLanguage.json',
      '/config/config.tmLanguage.json',
      '/explicit/one.tmLanguage.json'
    ]
  )
  assert.equal(result.installedCount, 1)
  assert.equal(result.configCount, 1)
  assert.equal(result.explicitCount, 1)
  assert.equal(result.providerCount, 1)
})

test('buildDetailedGrammarSourceEntries still prepends installed grammars before configured sources', () => {
  const result = buildDetailedGrammarSourceEntries(
    [grammar('source.base', '/installed/base.tmLanguage.json')],
    [grammar('source.config', '/config/config.tmLanguage.json')],
    [grammar('source.explicit', '/explicit/one.tmLanguage.json')],
    [grammar('source.provider', '/provider/provider.tmLanguage.json')],
    true
  )

  assert.deepEqual(
    result.map((entry) => [entry.source, entry.grammar.path] satisfies [SourcedGrammarContribution['source'], string]),
    [
      ['installed', '/installed/base.tmLanguage.json'],
      ['config', '/config/config.tmLanguage.json'],
      ['explicit', '/explicit/one.tmLanguage.json'],
      ['provider', '/provider/provider.tmLanguage.json']
    ]
  )
})
