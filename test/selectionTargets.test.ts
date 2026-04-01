import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import type { IToken } from 'vscode-textmate'
import {
  clipTokensToRanges,
  collectSelectionRangeTargets,
  coversWholeLine,
  resolveSelectionRanges
} from '../src/selectionTargets'
import type { SourceLine } from '../src/syntaxTest'

function token(startIndex: number, endIndex: number, ...scopes: string[]): IToken {
  return {
    endIndex,
    scopes,
    startIndex
  }
}

const sourceLines: SourceLine[] = [
  { documentLine: 1, text: 'bar();' },
  { documentLine: 2, text: '' },
  { documentLine: 3, text: 'foo = qux' }
]

const sourceLinesWithWhitespaceOnly: SourceLine[] = [
  { documentLine: 1, text: 'bar();' },
  { documentLine: 2, text: '    ' },
  { documentLine: 3, text: 'foo = qux' }
]

const sourceLinesWithOnlyWhitespaceSelection: SourceLine[] = [
  { documentLine: 1, text: 'bar();' },
  { documentLine: 2, text: '    ' },
  { documentLine: 3, text: '  ' },
  { documentLine: 4, text: 'foo = qux' }
]

test('range-derived targets skip blank source lines while keeping non-blank touched lines', () => {
  const targets = collectSelectionRangeTargets(sourceLines, [
    {
      activeCharacter: 1,
      activeLine: 1,
      endCharacter: 2,
      endLine: 3,
      isEmpty: false,
      startCharacter: 2,
      startLine: 1
    }
  ])

  assert.deepEqual(
    targets.map((target) => ({
      documentLine: target.sourceLine.documentLine,
      explicitRanges: target.explicitRanges
    })),
    [
      {
        documentLine: 1,
        explicitRanges: [{ endIndex: 6, startIndex: 2 }]
      },
      {
        documentLine: 3,
        explicitRanges: [{ endIndex: 2, startIndex: 0 }]
      }
    ]
  )
})

test('range-derived targets skip whitespace-only source lines when mixed with non-blank touched lines', () => {
  const targets = collectSelectionRangeTargets(sourceLinesWithWhitespaceOnly, [
    {
      activeCharacter: 1,
      activeLine: 1,
      endCharacter: 2,
      endLine: 3,
      isEmpty: false,
      startCharacter: 2,
      startLine: 1
    }
  ])

  assert.deepEqual(
    targets.map((target) => ({
      documentLine: target.sourceLine.documentLine,
      explicitRanges: target.explicitRanges
    })),
    [
      {
        documentLine: 1,
        explicitRanges: [{ endIndex: 6, startIndex: 2 }]
      },
      {
        documentLine: 3,
        explicitRanges: [{ endIndex: 2, startIndex: 0 }]
      }
    ]
  )
})

test('range-derived targets keep a non-empty selection made entirely of whitespace-only source lines', () => {
  const targets = collectSelectionRangeTargets(sourceLinesWithOnlyWhitespaceSelection, [
    {
      activeCharacter: 3,
      activeLine: 2,
      endCharacter: 2,
      endLine: 3,
      isEmpty: false,
      startCharacter: 1,
      startLine: 2
    }
  ])

  assert.deepEqual(
    targets.map((target) => ({
      documentLine: target.sourceLine.documentLine,
      explicitRanges: target.explicitRanges,
      sourceText: target.sourceLine.text
    })),
    [
      {
        documentLine: 2,
        explicitRanges: [{ endIndex: 4, startIndex: 1 }],
        sourceText: '    '
      },
      {
        documentLine: 3,
        explicitRanges: [{ endIndex: 2, startIndex: 0 }],
        sourceText: '  '
      }
    ]
  )
})

test('cursor- and range-derived targets on the same line are unioned after token resolution', () => {
  const targets = collectSelectionRangeTargets(sourceLines, [
    {
      activeCharacter: 1,
      activeLine: 1,
      endCharacter: 1,
      endLine: 1,
      isEmpty: true,
      startCharacter: 1,
      startLine: 1
    },
    {
      activeCharacter: 5,
      activeLine: 1,
      endCharacter: 6,
      endLine: 1,
      isEmpty: false,
      startCharacter: 2,
      startLine: 1
    }
  ])

  const ranges = resolveSelectionRanges(
    [token(0, 3, 'identifier'), token(3, 6, 'punctuation')],
    'bar();',
    targets[0]
  )

  assert.deepEqual(ranges, [{ endIndex: 6, startIndex: 0 }])
})

test('empty selection at end of line prefers the token to the left', () => {
  const targets = collectSelectionRangeTargets(sourceLines, [
    {
      activeCharacter: 9,
      activeLine: 3,
      endCharacter: 9,
      endLine: 3,
      isEmpty: true,
      startCharacter: 9,
      startLine: 3
    }
  ])

  const ranges = resolveSelectionRanges(
    [token(0, 3, 'identifier'), token(3, 6, 'operator'), token(6, 9, 'identifier')],
    'foo = qux',
    targets[0]
  )

  assert.deepEqual(ranges, [{ endIndex: 9, startIndex: 6 }])
})

test('clipTokensToRanges keeps only the selected token fragments', () => {
  const clippedTokens = clipTokensToRanges([token(0, 5, 'scope.a'), token(5, 8, 'scope.b')], [
    { endIndex: 4, startIndex: 2 },
    { endIndex: 7, startIndex: 6 }
  ])

  assert.deepEqual(clippedTokens, [
    token(2, 4, 'scope.a'),
    token(6, 7, 'scope.b')
  ])
})

test('coversWholeLine reflects the merged normalized ranges', () => {
  assert.equal(
    coversWholeLine(
      [
        { endIndex: 3, startIndex: 0 },
        { endIndex: 9, startIndex: 3 }
      ],
      9
    ),
    true
  )
  assert.equal(coversWholeLine([{ endIndex: 8, startIndex: 6 }], 9), false)
})
