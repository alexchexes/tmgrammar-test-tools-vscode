import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectLineCodeLensSpecs } from '../src/codeLens'
import { CommentSyntax } from '../src/languageCommentsCore'
import { SourceLine } from '../src/syntaxTestCore'

test('code lens anchors above a non-empty source line', () => {
  const sourceLines: SourceLine[] = [{ documentLine: 3, text: 'alpha' }]

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 3,
      title: 'Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
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
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 5,
      title: 'Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      sourceDocumentLine: 5,
      title: 'Minimal'
    }
  ])
})

test('code lens skips line comments when comment syntax is known', () => {
  const sourceLines: SourceLine[] = [
    { documentLine: 3, text: '  // comment only' },
    { documentLine: 5, text: 'omega' }
  ]

  const commentSyntax: CommentSyntax = {
    lineComments: ['//']
  }

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines, commentSyntax), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 5,
      title: 'Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      sourceDocumentLine: 5,
      title: 'Minimal'
    }
  ])
})

test('code lens skips lines inside block comments but keeps code with trailing comments', () => {
  const sourceLines: SourceLine[] = [
    { documentLine: 3, text: '/*' },
    { documentLine: 4, text: ' * comment body' },
    { documentLine: 5, text: ' */' },
    { documentLine: 7, text: 'omega /* trailing comment */' }
  ]

  const commentSyntax: CommentSyntax = {
    blockComment: ['/*', '*/'],
    lineComments: ['//']
  }

  assert.deepEqual(collectLineCodeLensSpecs(sourceLines, commentSyntax), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      sourceDocumentLine: 7,
      title: 'Assertions: Full'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      sourceDocumentLine: 7,
      title: 'Minimal'
    }
  ])
})
