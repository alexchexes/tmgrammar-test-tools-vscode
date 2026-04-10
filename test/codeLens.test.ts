import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectLineCodeLensSpecs } from '../src/codeLens'
import { SourceLine } from '../src/syntaxTestCore'

test('code lens anchors above a non-empty source line', () => {
  const sourceLines: SourceLine[] = [{ documentLine: 3, text: 'alpha' }]

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 3,
      title: 'Insert Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      sourceDocumentLine: 3,
      title: 'Insert Assertions: Minimal'
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
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 5,
      title: 'Insert Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      sourceDocumentLine: 5,
      title: 'Insert Assertions: Minimal'
    }
  ])
})
