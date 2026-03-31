import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isSafeToRefreshAssertionLine,
  mergeAppendAssertionLines,
  mergeSafeRefreshAssertionLines,
  planAppendAssertionInsertions
} from '../src/assertionRefresh'

test('safe refresh accepts simple positive assertions including <- and <~- forms', () => {
  assert.equal(isSafeToRefreshAssertionLine('// ^^^ source.js string.regexp.js', '//'), true)
  assert.equal(isSafeToRefreshAssertionLine('// <--- meta.class.instance.constructor.js', '//'), true)
  assert.equal(isSafeToRefreshAssertionLine('//   <~-- keyword.operator.comparison.scala', '//'), true)
})

test('safe refresh preserves negative and mixed assertion lines', () => {
  assert.equal(isSafeToRefreshAssertionLine('// ^ - comment.line.double-slash.js', '//'), false)
  assert.equal(isSafeToRefreshAssertionLine('// ^ source.js - comment.line.double-slash.js', '//'), false)
  assert.equal(isSafeToRefreshAssertionLine('// not an assertion line', '//'), false)
})

test('safe refresh merges regenerated lines with preserved manual assertion lines', () => {
  const existingAssertionLines = [
    '// ^^^ old.safe.scope',
    '// <~-- old.safe.offset.scope',
    '// ^ source.js - comment.line.double-slash.js',
    '// ^ - invalid.illegal.example'
  ]

  assert.deepEqual(
    mergeSafeRefreshAssertionLines('//', existingAssertionLines, ['// ^^^ new.safe.scope']),
    ['// ^^^ new.safe.scope', '// ^ source.js - comment.line.double-slash.js', '// ^ - invalid.illegal.example']
  )
})

test('safe refresh keeps preserved mixed lines adjacent to regenerated lines with the same marker', () => {
  const existingAssertionLines = [
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js - scope1',
    '//        ^               ^ meta.brace.round.js'
  ]

  const generatedAssertionLines = [
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js',
    '//        ^               ^ meta.brace.round.js'
  ]

  assert.deepEqual(mergeSafeRefreshAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js - scope1',
    '//        ^               ^ meta.brace.round.js'
  ])
})

test('safe refresh does not drop generated positive lines when preserved mixed lines do not exactly subsume them', () => {
  const existingAssertionLines = ['// <--- source.js new.expr.js - scope1']
  const generatedAssertionLines = ['// <--- new.expr.js']

  assert.deepEqual(mergeSafeRefreshAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <--- new.expr.js',
    '// <--- source.js new.expr.js - scope1'
  ])
})

test('safe refresh keeps preserved left-arrow assertions at the top of the block', () => {
  const existingAssertionLines = ['// <--------------------------- new.expr.js - scope1']
  const generatedAssertionLines = [
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js'
  ]

  assert.deepEqual(mergeSafeRefreshAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <--------------------------- new.expr.js - scope1',
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js'
  ])
})

test('safe refresh inserts preserved left-arrow assertions among generated left-arrow assertions by marker order', () => {
  const existingAssertionLines = ['// <~-- keyword.control.anchor.regexp.js - bar']
  const generatedAssertionLines = [
    '// <- string.regexp.js punctuation.definition.string.begin.js',
    '// <~----- string.regexp.js meta.embedded.js.regexp string.regexp.js',
    '// ^ keyword.operator.quantifier.regexp.js'
  ]

  assert.deepEqual(mergeSafeRefreshAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <- string.regexp.js punctuation.definition.string.begin.js',
    '// <~----- string.regexp.js meta.embedded.js.regexp string.regexp.js',
    '// <~-- keyword.control.anchor.regexp.js - bar',
    '// ^ keyword.operator.quantifier.regexp.js'
  ])
})

test('safe refresh inserts preserved caret assertions near generated caret assertions', () => {
  const existingAssertionLines = ['//  ^^^^^^ meta.function-call.js entity.name.function.js - scope1']
  const generatedAssertionLines = [
    '// <--- keyword.operator.new.js',
    '//        ^               ^ meta.brace.round.js'
  ]

  assert.deepEqual(mergeSafeRefreshAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <--- keyword.operator.new.js',
    '//  ^^^^^^ meta.function-call.js entity.name.function.js - scope1',
    '//        ^               ^ meta.brace.round.js'
  ])
})

test('append merge inserts new left-arrow assertions above existing caret assertions', () => {
  const existingAssertionLines = [
    '// ^^^^^ storage.type.js',
    '// ^ - meta.var.expr.js'
  ]

  assert.deepEqual(
    mergeAppendAssertionLines('//', existingAssertionLines, ['// <~- source.js meta.var.expr.js storage.type.js']),
    [
      '// <~- source.js meta.var.expr.js storage.type.js',
      '// ^^^^^ storage.type.js',
      '// ^ - meta.var.expr.js'
    ]
  )
})

test('append merge skips weaker positive assertions when a stronger positive assertion with the same marker already exists', () => {
  const existingAssertionLines = [
    '// ^^^^^ storage.type.js',
    '// ^ - meta.var.expr.js',
    '// <~- source.js meta.var.expr.js storage.type.js'
  ]

  assert.deepEqual(
    mergeAppendAssertionLines('//', existingAssertionLines, ['// <~- meta.var.expr.js storage.type.js']),
    existingAssertionLines
  )
})

test('append merge does not drop weaker generated assertions when only a mixed existing line shares the marker', () => {
  const existingAssertionLines = ['// <--- source.js new.expr.js - scope1']
  const generatedAssertionLines = ['// <--- new.expr.js']

  assert.deepEqual(mergeAppendAssertionLines('//', existingAssertionLines, generatedAssertionLines), [
    '// <--- source.js new.expr.js - scope1',
    '// <--- new.expr.js'
  ])
})

test('append insertion plan only inserts the new left-arrow assertion chunk before existing lines', () => {
  const existingAssertionLines = [
    '// ^^^^^ storage.type.js',
    '// ^ - meta.var.expr.js'
  ]

  assert.deepEqual(
    planAppendAssertionInsertions('//', existingAssertionLines, ['// <~- source.js meta.var.expr.js storage.type.js']),
    [
      {
        assertionLines: ['// <~- source.js meta.var.expr.js storage.type.js'],
        beforeExistingIndex: 0
      }
    ]
  )
})

test('append insertion plan omits weaker redundant assertions already covered by an existing positive line', () => {
  const existingAssertionLines = [
    '// ^^^^^ storage.type.js',
    '// ^ - meta.var.expr.js',
    '// <~- source.js meta.var.expr.js storage.type.js'
  ]

  assert.deepEqual(
    planAppendAssertionInsertions('//', existingAssertionLines, ['// <~- meta.var.expr.js storage.type.js']),
    []
  )
})

test('append insertion plan inserts new caret assertions without rewriting unrelated existing lines', () => {
  const existingAssertionLines = [
    '// <--- keyword.operator.new.js',
    '//        ^               ^ meta.brace.round.js'
  ]

  assert.deepEqual(
    planAppendAssertionInsertions('//', existingAssertionLines, ['//  ^^^^^^ meta.function-call.js entity.name.function.js']),
    [
      {
        assertionLines: ['//  ^^^^^^ meta.function-call.js entity.name.function.js'],
        beforeExistingIndex: 1
      }
    ]
  )
})
