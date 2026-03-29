import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGrammarSourceSet } from '../src/grammarSources'
import type { GrammarContribution } from '../src/grammarConfig'

function grammar(scopeName: string, path: string): GrammarContribution {
  return {
    path,
    scopeName
  }
}

test('buildGrammarSourceSet keeps installed grammars first when auto-loading is enabled', () => {
  const result = buildGrammarSourceSet(
    [grammar('source.base', '/installed/base.tmLanguage.json')],
    [grammar('source.local', '/local/local.tmLanguage.json')],
    [grammar('source.provider', '/provider/provider.tmLanguage.json')],
    true
  )

  assert.deepEqual(
    result.grammars.map((entry) => entry.path),
    ['/installed/base.tmLanguage.json', '/local/local.tmLanguage.json', '/provider/provider.tmLanguage.json']
  )
  assert.equal(result.installedCount, 1)
  assert.equal(result.localCount, 1)
  assert.equal(result.providerCount, 1)
})

test('buildGrammarSourceSet omits installed grammars when auto-loading is disabled', () => {
  const result = buildGrammarSourceSet(
    [grammar('source.base', '/installed/base.tmLanguage.json')],
    [grammar('source.local', '/local/local.tmLanguage.json')],
    [grammar('source.provider', '/provider/provider.tmLanguage.json')],
    false
  )

  assert.deepEqual(
    result.grammars.map((entry) => entry.path),
    ['/local/local.tmLanguage.json', '/provider/provider.tmLanguage.json']
  )
  assert.equal(result.installedCount, 0)
  assert.equal(result.localCount, 1)
  assert.equal(result.providerCount, 1)
})
