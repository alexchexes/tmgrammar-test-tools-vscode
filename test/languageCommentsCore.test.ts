import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isCommentOnlyLine,
  mergeCommentSyntax,
  parseCommentSyntaxFromLanguageConfigurationText
} from '../src/languageCommentsCore'

test('parses comment syntax from jsonc language configuration text', () => {
  const parsed = parseCommentSyntaxFromLanguageConfigurationText(`{
    // language config can contain comments
    "comments": {
      "lineComment": "//",
      "blockComment": [
        "/*",
        "*/",
      ],
    },
  }`)

  assert.deepEqual(parsed, {
    blockComment: ['/*', '*/'],
    lineComments: ['//']
  })
})

test('merges fallback syntax test comment token into language comment syntax', () => {
  const merged = mergeCommentSyntax(
    {
      blockComment: ['/*', '*/'],
      lineComments: ['//']
    },
    '#'
  )

  assert.deepEqual(merged, {
    blockComment: ['/*', '*/'],
    lineComments: ['//', '#']
  })
})

test('treats code with trailing line comments as code, not comment-only', () => {
  const result = isCommentOnlyLine(
    'foo(); // trailing',
    {
      lineComments: ['//']
    }
  )

  assert.equal(result.isCommentOnly, false)
  assert.deepEqual(result.state, { inBlockComment: false })
})

test('tracks block comment state across lines', () => {
  const openingLine = isCommentOnlyLine(
    '/* comment starts',
    {
      blockComment: ['/*', '*/'],
      lineComments: []
    }
  )

  assert.equal(openingLine.isCommentOnly, true)
  assert.deepEqual(openingLine.state, { inBlockComment: true })

  const middleLine = isCommentOnlyLine(
    'still comment',
    {
      blockComment: ['/*', '*/'],
      lineComments: []
    },
    openingLine.state
  )

  assert.equal(middleLine.isCommentOnly, true)
  assert.deepEqual(middleLine.state, { inBlockComment: true })

  const closingLine = isCommentOnlyLine(
    '*/ foo();',
    {
      blockComment: ['/*', '*/'],
      lineComments: []
    },
    middleLine.state
  )

  assert.equal(closingLine.isCommentOnly, false)
  assert.deepEqual(closingLine.state, { inBlockComment: false })
})
