import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseGrammarTestCaseWithCompat,
  normalizeVscodeTmgrammarTestParseError,
  VSCODE_TMGRAMMAR_TEST_ZERO_BASED_NOTE
} from '../src/tmgrammarTestCompat'

const { parseScopeAssertion } = require('vscode-tmgrammar-test/dist/unit/parsing') as {
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => unknown[]
}
const { parseGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as {
  parseGrammarTestCase: (value: string) => unknown
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

test('rejects malformed assertion candidates that vscode-tmgrammar-test would otherwise silently ignore', () => {
  for (const assertionLine of ['// <--% source.js', '// <-- foo:bar', '// <-- source.js#tag']) {
    const documentText = ['// SYNTAX TEST "source.js"', '', 'var foo = "ok"', assertionLine].join('\n')
    const parsed = parseGrammarTestCase(documentText) as { assertions: unknown[] }

    assert.equal(parsed.assertions.length, 0, `Expected upstream parser to silently drop: ${assertionLine}`)

    assert.throws(
      () => parseGrammarTestCaseWithCompat(documentText, parseGrammarTestCase, parseScopeAssertion),
      new RegExp(`Invalid assertion at line 4:\\n${escapeRegExp(assertionLine)}\\nMalformed assertion syntax`),
      assertionLine
    )
  }
})

test('reports the earliest malformed assertion candidate before later malformed lines in the same block', () => {
  const documentText = [
    '// SYNTAX TEST "source.js"',
    '',
    'var foo = "ok"',
    '// <--% source.js',
    '// ^ %'
  ].join('\n')

  assert.throws(
    () => parseGrammarTestCaseWithCompat(documentText, parseGrammarTestCase, parseScopeAssertion),
    /Invalid assertion at line 4:\n\/\/ <--% source\.js\nMalformed assertion syntax/
  )
})

test('preserves original document line numbers when validating a targeted subset', () => {
  const subsetText = [
    '// SYNTAX TEST "source.js"',
    '',
    'var foo = "ok"',
    '// <--% source.js'
  ].join('\n')

  assert.throws(
    () =>
      parseGrammarTestCaseWithCompat(subsetText, parseGrammarTestCase, parseScopeAssertion, [1, 2, 13, 14]),
    /Invalid assertion at line 14:\n\/\/ <--% source\.js\nMalformed assertion syntax/
  )
})

test('allows ordinary comment lines that do not look like assertions', () => {
  const documentText = ['// SYNTAX TEST "source.js"', '', 'const x = 1', '// note about this test'].join('\n')
  const parsed = parseGrammarTestCase(documentText)

  assert.deepEqual(parseGrammarTestCaseWithCompat(documentText, parseGrammarTestCase, parseScopeAssertion), parsed)
})

test('allows valid assertion lines that the current runner parses successfully', () => {
  const documentText = ['// SYNTAX TEST "source.js"', '', 'const x = 1', '// ^ source.js'].join('\n')
  const parsed = parseGrammarTestCase(documentText)

  assert.deepEqual(parseGrammarTestCaseWithCompat(documentText, parseGrammarTestCase, parseScopeAssertion), parsed)
})
