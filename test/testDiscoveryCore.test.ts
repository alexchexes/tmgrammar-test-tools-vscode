import test from 'node:test'
import assert from 'node:assert/strict'
import { combineGlobPatterns, normalizeGlobList } from '../src/testDiscoveryCore'

test('normalizeGlobList trims entries and removes blanks', () => {
  assert.deepEqual(normalizeGlobList(['  **/*.tmgrammar-test  ', '', '   ', '**/*.syntax-test.*']), [
    '**/*.tmgrammar-test',
    '**/*.syntax-test.*'
  ])
})

test('normalizeGlobList returns an empty list for undefined', () => {
  assert.deepEqual(normalizeGlobList(undefined), [])
})

test('combineGlobPatterns returns undefined for an empty list', () => {
  assert.equal(combineGlobPatterns([]), undefined)
})

test('combineGlobPatterns returns the single pattern unchanged', () => {
  assert.equal(combineGlobPatterns(['**/*.syntax-test.*']), '**/*.syntax-test.*')
})

test('combineGlobPatterns joins multiple patterns with braces', () => {
  assert.equal(
    combineGlobPatterns(['**/*.syntax-test.*', '**/*.tmgrammar-test.*']),
    '{**/*.syntax-test.*,**/*.tmgrammar-test.*}'
  )
})
