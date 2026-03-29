import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectLineCodeLensSpecs, shouldSuspendLineCodeLensDuringEdit } from '../src/codeLens'
import { SourceLine } from '../src/syntaxTestCore'

test('code lens anchors below a non-empty source line when there is no assertion block', () => {
  const sourceLines: SourceLine[] = [{ documentLine: 3, text: 'alpha' }]

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines, 10, []), [
    {
      anchorLine: 4,
      commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
      sourceDocumentLine: 3,
      title: 'Line Assertions (Full)'
    },
    {
      anchorLine: 4,
      commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
      sourceDocumentLine: 3,
      title: 'Line Assertions (Minimal)'
    }
  ])
})

test('code lens anchors below an existing assertion block when one is present', () => {
  const sourceLines: SourceLine[] = [{ documentLine: 3, text: 'alpha' }]

  assert.deepEqual(
    collectLineCodeLensSpecs(sourceLines, 12, [
      {
        endLineExclusive: 7,
        sourceDocumentLine: 3,
        startLine: 4
      }
    ]),
    [
      {
        anchorLine: 7,
        commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
        sourceDocumentLine: 3,
        title: 'Line Assertions (Full)'
      },
      {
        anchorLine: 7,
        commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
        sourceDocumentLine: 3,
        title: 'Line Assertions (Minimal)'
      }
    ]
  )
})

test('code lens skips blank source lines and falls back to the source line at eof', () => {
  const sourceLines: SourceLine[] = [
    { documentLine: 3, text: '   ' },
    { documentLine: 5, text: 'omega' }
  ]

  assert.deepEqual(
    collectLineCodeLensSpecs(sourceLines, 6, [
      {
        endLineExclusive: 6,
        sourceDocumentLine: 5,
        startLine: 6
      }
    ]),
    [
      {
        anchorLine: 6,
        commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
        sourceDocumentLine: 5,
        title: 'Line Assertions (Full)'
      },
      {
        anchorLine: 6,
        commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
        sourceDocumentLine: 5,
        title: 'Line Assertions (Minimal)'
      }
    ]
  )
})

test('code lens is temporarily hidden while editing when the block is followed by a blank line', () => {
  const lines = ['source', '// assertion', '', 'next source']

  assert.equal(
    shouldSuspendLineCodeLensDuringEdit(lines, {
      endLineExclusive: 2,
      startLine: 1
    }),
    true
  )
})

test('code lens is temporarily hidden while editing when the block reaches eof', () => {
  const lines = ['source', '// assertion']

  assert.equal(
    shouldSuspendLineCodeLensDuringEdit(lines, {
      endLineExclusive: 2,
      startLine: 1
    }),
    true
  )
})

test('code lens stays visible while editing when the block is followed by a non-blank line', () => {
  const lines = ['source', '// assertion', 'next source']

  assert.equal(
    shouldSuspendLineCodeLensDuringEdit(lines, {
      endLineExclusive: 2,
      startLine: 1
    }),
    false
  )
})
