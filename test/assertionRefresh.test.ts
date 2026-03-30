import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSafeToRefreshAssertionLine, mergeSafeRefreshAssertionLines } from '../src/assertionRefresh'

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
    '// <--- source.js new.expr.js - scope1',
    '// <--- new.expr.js'
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
