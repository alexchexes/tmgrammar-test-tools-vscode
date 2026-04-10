import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveInsertTargets } from '../src/selectionIntent'
import type { SelectionInput } from '../src/selectionTargets'
import type { SourceLine } from '../src/syntaxTestCore'

const sourceLines: SourceLine[] = [
  { documentLine: 1, text: 'alpha' },
  { documentLine: 3, text: 'beta gamma' },
  { documentLine: 5, text: 'delta' }
]

test('auto intent uses line mode for a single cursor on a source line', () => {
  const resolved = resolveInsertTargets(sourceLines, [cursorSelection(3, 2)], 'auto')

  assert.deepEqual(
    resolved.lineTargets.map((line) => line.documentLine),
    [3]
  )
  assert.equal(resolved.rangeTargets.length, 0)
})

test('auto intent uses line mode for a cursor on an assertion line owned by a source line', () => {
  const resolved = resolveInsertTargets(sourceLines, [cursorSelection(4, 0)], 'auto')

  assert.deepEqual(
    resolved.lineTargets.map((line) => line.documentLine),
    [3]
  )
  assert.equal(resolved.rangeTargets.length, 0)
})

test('auto intent uses range mode for a partial selection on a source line', () => {
  const resolved = resolveInsertTargets(sourceLines, [rangeSelection(3, 1, 3, 5)], 'auto')

  assert.equal(resolved.lineTargets.length, 0)
  assert.deepEqual(
    resolved.rangeTargets.map((target) => target.sourceLine.documentLine),
    [3]
  )
})

test('auto intent resolves each touched source line independently', () => {
  const resolved = resolveInsertTargets(
    sourceLines,
    [cursorSelection(1, 2), rangeSelection(3, 1, 3, 5), cursorSelection(5, 0)],
    'auto'
  )

  assert.deepEqual(
    resolved.lineTargets.map((line) => line.documentLine),
    [1, 5]
  )
  assert.deepEqual(
    resolved.rangeTargets.map((target) => target.sourceLine.documentLine),
    [3]
  )
})

test('auto intent treats multiple cursors on the same line as range intent', () => {
  const resolved = resolveInsertTargets(sourceLines, [cursorSelection(3, 1), cursorSelection(3, 6)], 'auto')

  assert.equal(resolved.lineTargets.length, 0)
  assert.deepEqual(
    resolved.rangeTargets.map((target) => ({
      cursorPositions: target.cursorPositions,
      documentLine: target.sourceLine.documentLine
    })),
    [
      {
        cursorPositions: [1, 6],
        documentLine: 3
      }
    ]
  )
})

test('auto intent keeps a whole-line selection in line mode', () => {
  const resolved = resolveInsertTargets(sourceLines, [rangeSelection(3, 0, 3, sourceLines[1].text.length)], 'auto')

  assert.deepEqual(
    resolved.lineTargets.map((line) => line.documentLine),
    [3]
  )
  assert.equal(resolved.rangeTargets.length, 0)
})

test('targeted auto intent ignores selections on other lines and defaults to the lens line', () => {
  const resolved = resolveInsertTargets(sourceLines, [rangeSelection(5, 1, 5, 3)], 'auto', {
    targetSourceDocumentLine: 3
  })

  assert.deepEqual(
    resolved.lineTargets.map((line) => line.documentLine),
    [3]
  )
  assert.equal(resolved.rangeTargets.length, 0)
})

test('targeted auto intent uses range mode only for a partial selection on the targeted line', () => {
  const resolved = resolveInsertTargets(
    sourceLines,
    [rangeSelection(3, 2, 3, 5), rangeSelection(5, 1, 5, 3)],
    'auto',
    {
      targetSourceDocumentLine: 3
    }
  )

  assert.equal(resolved.lineTargets.length, 0)
  assert.deepEqual(
    resolved.rangeTargets.map((target) => ({
      documentLine: target.sourceLine.documentLine,
      explicitRanges: target.explicitRanges
    })),
    [
      {
        documentLine: 3,
        explicitRanges: [{ endIndex: 5, startIndex: 2 }]
      }
    ]
  )
})

function cursorSelection(line: number, character: number): SelectionInput {
  return {
    activeCharacter: character,
    activeLine: line,
    endCharacter: character,
    endLine: line,
    isEmpty: true,
    startCharacter: character,
    startLine: line
  }
}

function rangeSelection(startLine: number, startCharacter: number, endLine: number, endCharacter: number): SelectionInput {
  return {
    activeCharacter: endCharacter,
    activeLine: endLine,
    endCharacter,
    endLine,
    isEmpty: false,
    startCharacter,
    startLine
  }
}
