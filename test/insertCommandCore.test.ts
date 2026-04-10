import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRejectedAssertionUpdateMessage } from '../src/insertCommandCore'

test('rejected assertion update message explains stale prepared document versions', () => {
  assert.equal(
    buildRejectedAssertionUpdateMessage(1, 2),
    'The editor rejected the assertion update because the document changed while assertions were being prepared (prepared against version 1, current version 2). Try the command again.'
  )
})

test('rejected assertion update message stays generic when the document version did not change', () => {
  assert.equal(
    buildRejectedAssertionUpdateMessage(3, 3),
    'The editor rejected the assertion update. VS Code did not provide any further reason.'
  )
})
