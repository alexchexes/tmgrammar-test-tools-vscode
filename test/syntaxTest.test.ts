import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { findTargetSourceLinesForSelections, SourceLine } from '../src/syntaxTest'

const sourceLines: SourceLine[] = [
  { documentLine: 1, text: 'alpha' },
  { documentLine: 3, text: 'beta' },
  { documentLine: 5, text: 'gamma' }
]

test('line targeting unions cursor positions and assertion-line ownership top-to-bottom', () => {
  const targets = findTargetSourceLinesForSelections(sourceLines, [
    {
      activeLine: 4,
      endCharacter: 0,
      endLine: 4,
      isEmpty: true,
      startLine: 4
    },
    {
      activeLine: 1,
      endCharacter: 0,
      endLine: 1,
      isEmpty: true,
      startLine: 1
    },
    {
      activeLine: 3,
      endCharacter: 0,
      endLine: 3,
      isEmpty: true,
      startLine: 3
    }
  ])

  assert.deepEqual(
    targets.map((target) => target.documentLine),
    [1, 3]
  )
})

test('line targeting excludes the final line when a non-empty selection ends at column zero', () => {
  const targets = findTargetSourceLinesForSelections(sourceLines, [
    {
      activeLine: 1,
      endCharacter: 0,
      endLine: 5,
      isEmpty: false,
      startLine: 1
    }
  ])

  assert.deepEqual(
    targets.map((target) => target.documentLine),
    [1, 3]
  )
})

test('line targeting includes the final line when a non-empty selection reaches into it', () => {
  const targets = findTargetSourceLinesForSelections(sourceLines, [
    {
      activeLine: 1,
      endCharacter: 2,
      endLine: 5,
      isEmpty: false,
      startLine: 0
    }
  ])

  assert.deepEqual(
    targets.map((target) => target.documentLine),
    [1, 3, 5]
  )
})
