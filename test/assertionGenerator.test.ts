import * as assert from 'node:assert/strict'
import * as path from 'node:path'
import { test } from 'node:test'
import {
  appendMissingAssertionLines,
  generateLineAssertionBlock,
  generateRangeAssertionBlock
} from '../src/assertionGenerator'

const fixtureGrammarPath = path.resolve(__dirname, '../../fixtures/simple-grammar/syntaxes/simple-poc.tmLanguage.json')
const generationContext = {
  commentToken: '//',
  grammars: [{ path: fixtureGrammarPath, scopeName: 'source.simple-poc' }],
  scopeName: 'source.simple-poc',
  sourceLines: [
    { documentLine: 1, text: '' },
    { documentLine: 2, text: 'let value = 42' },
    { documentLine: 3, text: 'const answer = "ok"' }
  ]
} as const

const generationOptions = {
  compactRanges: true,
  scopeMode: 'minimal'
} as const

test('generateLineAssertionBlock produces assertion lines from a pure generation context', async () => {
  const assertionLines = await generateLineAssertionBlock(generationContext, 2, generationOptions)

  assert.ok(assertionLines.length > 0)
  assert.deepEqual(assertionLines, [
    '// <----- keyword.control.simple-poc',
    '//             ^^^^ string.quoted.double.simple-poc',
    '//             ^ punctuation.definition.string.begin.simple-poc',
    '//                ^ punctuation.definition.string.end.simple-poc'
  ])
})

test('generateRangeAssertionBlock returns both rendered assertions and resolved ranges', async () => {
  const generated = await generateRangeAssertionBlock(
    generationContext,
    2,
    {
      cursorPositions: [],
      explicitRanges: [{ startIndex: 16, endIndex: 18 }],
      sourceLine: generationContext.sourceLines[2]
    },
    generationOptions
  )

  assert.deepEqual(generated.ranges, [{ startIndex: 16, endIndex: 18 }])
  assert.deepEqual(generated.assertionLines, ['//              ^^ string.quoted.double.simple-poc'])
})

test('appendMissingAssertionLines only keeps newly generated lines', () => {
  assert.deepEqual(
    appendMissingAssertionLines(
      ['// existing one', '// existing two'],
      ['// existing two', '// new three', '// new four']
    ),
    ['// new three', '// new four']
  )
})
