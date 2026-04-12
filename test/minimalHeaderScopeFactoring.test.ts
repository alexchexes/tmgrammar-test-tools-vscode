import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMinimalHeaderScopeFactoring } from '../src/minimalHeaderScopeFactoring'

test('minimal header scope factoring defaults to omitSharedHeader', () => {
  assert.deepEqual(resolveMinimalHeaderScopeFactoring(undefined), { value: 'omitSharedHeader' })
})

test('minimal header scope factoring accepts omitSharedHeader and keepSharedHeader without warnings', () => {
  assert.deepEqual(resolveMinimalHeaderScopeFactoring('omitSharedHeader'), { value: 'omitSharedHeader' })
  assert.deepEqual(resolveMinimalHeaderScopeFactoring('keepSharedHeader'), { value: 'keepSharedHeader' })
})

test('minimal header scope factoring falls back to omitSharedHeader with a warning for invalid values', () => {
  assert.deepEqual(resolveMinimalHeaderScopeFactoring('bogus'), {
    value: 'omitSharedHeader',
    warning:
      'Invalid tmGrammarTestTools.minimalHeaderScopeFactoring value: bogus. ' +
      'Expected "omitSharedHeader" or "keepSharedHeader". Using "omitSharedHeader".'
  })
})
