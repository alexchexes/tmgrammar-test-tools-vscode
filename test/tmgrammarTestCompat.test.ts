import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeVscodeTmgrammarTestParseError,
  VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE
} from '../src/tmgrammarTestCompat'

test('normalizes known vscode-tmgrammar-test invalid assertion errors when the reported line is verified as 0-based', () => {
  const documentText = ['// SYNTAX TEST "source.js"', 'const x = 1', '// ^'].join('\n')
  const message = 'Invalid assertion at line 2:\n// ^\n Missing both required and prohibited scopes'

  assert.equal(
    normalizeVscodeTmgrammarTestParseError(message, documentText),
    'Invalid assertion at line 3:\n// ^\n Missing both required and prohibited scopes'
  )
})

test('leaves known invalid assertion errors unchanged when the reported line is already 1-based', () => {
  const documentText = ['// SYNTAX TEST "source.js"', 'const x = 1', '// ^'].join('\n')
  const message = 'Invalid assertion at line 3:\n// ^\n Missing both required and prohibited scopes'

  assert.equal(normalizeVscodeTmgrammarTestParseError(message, documentText), message)
})

test('appends a note for known invalid assertion errors that cannot be verified as 0-based or 1-based', () => {
  const documentText = ['// SYNTAX TEST "source.js"', 'const x = 1', '// ^'].join('\n')
  const message = 'Invalid assertion at line 2:\n// ^^'

  assert.equal(
    normalizeVscodeTmgrammarTestParseError(message, documentText),
    `${message}\n${VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE}`
  )
})

test('leaves unrelated runner errors untouched', () => {
  const message = 'Could not load scope source.js'

  assert.equal(normalizeVscodeTmgrammarTestParseError(message, 'anything'), message)
})
