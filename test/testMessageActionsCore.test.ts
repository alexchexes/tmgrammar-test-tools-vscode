import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getTestMessageFromCommandValue,
  getTestMessageText,
  normalizeSerializedLocation
} from '../src/testMessageActionsCore'

test('getTestMessageFromCommandValue accepts a direct TestMessage-like value', () => {
  const message = getTestMessageFromCommandValue({
    message: 'Missing scopes: source.php'
  })

  assert.equal(message && getTestMessageText(message), 'Missing scopes: source.php')
})

test('getTestMessageFromCommandValue accepts the testing/message command payload shape', () => {
  const message = getTestMessageFromCommandValue({
    message: {
      location: {
        end: { character: 5, line: 3 },
        start: { character: 4, line: 3 },
        uri: 'file:///d:/repos/example.php'
      },
      message: {
        value: 'Missing scopes: source.php'
      }
    },
    test: {
      id: 'line:file:///d:/repos/example.php:3'
    }
  })

  assert.equal(message && getTestMessageText(message), 'Missing scopes: source.php')
  assert.deepEqual(message && normalizeSerializedLocation(message.location), {
    end: { character: 5, line: 3 },
    start: { character: 4, line: 3 },
    uri: 'file:///d:/repos/example.php'
  })
})

test('getTestMessageFromCommandValue rejects unrelated command payloads', () => {
  assert.equal(getTestMessageFromCommandValue({ id: 'not-a-test-message' }), undefined)
})
