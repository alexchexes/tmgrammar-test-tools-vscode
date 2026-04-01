import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectLineCodeLensSpecs } from '../src/codeLens'
import { SourceLine } from '../src/syntaxTestCore'

test('code lens anchors above a non-empty source line', () => {
  const sourceLines: SourceLine[] = [{ documentLine: 3, text: 'alpha' }]

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines), [
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
      sourceDocumentLine: 3,
      title: 'Line Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
      sourceDocumentLine: 3,
      title: 'Minimal'
    }
  ])
})

test('code lens skips blank source lines', () => {
  const sourceLines: SourceLine[] = [
    { documentLine: 3, text: '   ' },
    { documentLine: 5, text: 'omega' }
  ]

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines), [
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
      sourceDocumentLine: 5,
      title: 'Line Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
      sourceDocumentLine: 5,
      title: 'Minimal'
    }
  ])
})
