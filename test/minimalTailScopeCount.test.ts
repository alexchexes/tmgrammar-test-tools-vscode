import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMinimalTailScopeCount } from '../src/minimalTailScopeCount'

test('minimal tail scope count defaults to 1', () => {
  assert.deepEqual(resolveMinimalTailScopeCount(undefined), { value: 1 })
})

test('minimal tail scope count accepts 1 and 2 without warnings', () => {
  assert.deepEqual(resolveMinimalTailScopeCount(1), { value: 1 })
  assert.deepEqual(resolveMinimalTailScopeCount(2), { value: 2 })
})

test('minimal tail scope count clamps values below 1 to 1 with a warning', () => {
  assert.deepEqual(resolveMinimalTailScopeCount(0), {
    value: 1,
    warning: 'Invalid tmGrammarTestTools.minimalTailScopeCount value 0. Expected 1 or 2. Using 1.'
  })
})

test('minimal tail scope count clamps values above 2 to 2 with a warning', () => {
  assert.deepEqual(resolveMinimalTailScopeCount(3), {
    value: 2,
    warning: 'Invalid tmGrammarTestTools.minimalTailScopeCount value 3. Expected 1 or 2. Using 2.'
  })
})
