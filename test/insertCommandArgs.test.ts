import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInsertCommandArgs } from '../src/insertCommandArgs'

test('parseInsertCommandArgs reads Minimal overrides from command args', () => {
  assert.deepEqual(
    parseInsertCommandArgs({
      minimalHeaderScopeFactoring: 'keepSharedHeader',
      minimalTailScopeCount: 2
    }),
    {
      minimalHeaderScopeFactoring: 'keepSharedHeader',
      minimalTailScopeCount: 2
    }
  )
})

test('parseInsertCommandArgs keeps string Minimal overrides even when they are invalid', () => {
  assert.deepEqual(parseInsertCommandArgs({ minimalHeaderScopeFactoring: 'bogus' }), {
    minimalHeaderScopeFactoring: 'bogus'
  })
})

test('parseInsertCommandArgs keeps existing CodeLens-related args', () => {
  assert.deepEqual(
    parseInsertCommandArgs({
      minimalHeaderScopeFactoring: 'omitSharedHeader',
      minimalTailScopeCount: 1,
      requestedFromCodeLens: true,
      targetSourceDocumentLine: 12
    }),
    {
      minimalHeaderScopeFactoring: 'omitSharedHeader',
      minimalTailScopeCount: 1,
      requestedFromCodeLens: true,
      targetSourceDocumentLine: 12
    }
  )
})
