import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInsertCommandArgs } from '../src/insertCommandArgs'

test('parseInsertCommandArgs reads minimalTailScopeCount overrides from command args', () => {
  assert.deepEqual(parseInsertCommandArgs({ minimalTailScopeCount: 2 }), {
    minimalTailScopeCount: 2
  })
})

test('parseInsertCommandArgs keeps existing CodeLens-related args', () => {
  assert.deepEqual(
    parseInsertCommandArgs({
      minimalTailScopeCount: 1,
      requestedFromCodeLens: true,
      targetSourceDocumentLine: 12
    }),
    {
      minimalTailScopeCount: 1,
      requestedFromCodeLens: true,
      targetSourceDocumentLine: 12
    }
  )
})
