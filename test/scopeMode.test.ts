import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeScopeMode, resolveScopeMode } from '../src/scopeMode'

test('normalizeScopeMode defaults unknown values to full', () => {
  assert.equal(normalizeScopeMode(undefined), 'full')
  assert.equal(normalizeScopeMode('anything-else'), 'full')
  assert.equal(normalizeScopeMode('minimal'), 'minimal')
})

test('resolveScopeMode prefers an explicit command override over the configured default', () => {
  assert.equal(resolveScopeMode('full', 'minimal'), 'minimal')
  assert.equal(resolveScopeMode('minimal', 'full'), 'full')
  assert.equal(resolveScopeMode('minimal', undefined), 'minimal')
})
