import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectAssertionCodeActionSpecs } from '../src/codeActions'
import { SelectionInput } from '../src/selectionTargets'
import { SelectionLineTarget, SourceLine } from '../src/syntaxTestCore'

const sourceLines: SourceLine[] = [
  { documentLine: 1, text: 'alpha' },
  { documentLine: 3, text: 'beta' }
]

test('code actions on an assertion line offer line actions only', () => {
  const lineSelections: SelectionLineTarget[] = [
    {
      activeLine: 2,
      endCharacter: 0,
      endLine: 2,
      isEmpty: true,
      startLine: 2
    }
  ]
  const rangeSelections: SelectionInput[] = [
    {
      activeCharacter: 0,
      activeLine: 2,
      endCharacter: 0,
      endLine: 2,
      isEmpty: true,
      startCharacter: 0,
      startLine: 2
    }
  ]

  assert.deepEqual(collectAssertionCodeActionSpecs(sourceLines, lineSelections, rangeSelections), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      title: 'Insert Assertions (Full)'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      title: 'Insert Assertions (Minimal)'
    }
  ])
})

test('code actions on a source selection prefer the universal action and keep line as an explicit alternative', () => {
  const lineSelections: SelectionLineTarget[] = [
    {
      activeLine: 1,
      endCharacter: 3,
      endLine: 1,
      isEmpty: false,
      startLine: 1
    }
  ]
  const rangeSelections: SelectionInput[] = [
    {
      activeCharacter: 3,
      activeLine: 1,
      endCharacter: 3,
      endLine: 1,
      isEmpty: false,
      startCharacter: 1,
      startLine: 1
    }
  ]

  assert.deepEqual(collectAssertionCodeActionSpecs(sourceLines, lineSelections, rangeSelections), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      title: 'Insert Assertions (Full)'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      title: 'Insert Assertions (Minimal)'
    },
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsFull',
      title: 'Insert Line Assertions (Full)'
    },
    {
      commandId: 'tmGrammarTestTools.insertLineAssertionsMinimal',
      title: 'Insert Line Assertions (Minimal)'
    }
  ])
})

test('code actions on a source cursor prefer the universal action and keep range as an explicit alternative', () => {
  const lineSelections: SelectionLineTarget[] = [
    {
      activeLine: 1,
      endCharacter: 0,
      endLine: 1,
      isEmpty: true,
      startLine: 1
    }
  ]
  const rangeSelections: SelectionInput[] = [
    {
      activeCharacter: 0,
      activeLine: 1,
      endCharacter: 0,
      endLine: 1,
      isEmpty: true,
      startCharacter: 0,
      startLine: 1
    }
  ]

  assert.deepEqual(collectAssertionCodeActionSpecs(sourceLines, lineSelections, rangeSelections), [
    {
      commandId: 'tmGrammarTestTools.insertAssertionsFull',
      title: 'Insert Assertions (Full)'
    },
    {
      commandId: 'tmGrammarTestTools.insertAssertionsMinimal',
      title: 'Insert Assertions (Minimal)'
    },
    {
      commandId: 'tmGrammarTestTools.insertRangeAssertionsFull',
      title: 'Insert Range Assertions (Full)'
    },
    {
      commandId: 'tmGrammarTestTools.insertRangeAssertionsMinimal',
      title: 'Insert Range Assertions (Minimal)'
    }
  ])
})
