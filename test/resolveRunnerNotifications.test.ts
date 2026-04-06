import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeRunScopedResolutionWarningNotification } from '../src/runners/resolveRunnerNotifications'

test('consumeRunScopedResolutionWarningNotification returns undefined without a notification key', () => {
  const shownNotificationKeys = new Set<string>()

  assert.equal(
    consumeRunScopedResolutionWarningNotification(shownNotificationKeys, {
      resolutionWarning: 'Output-only warning.'
    }),
    undefined
  )
  assert.deepEqual(Array.from(shownNotificationKeys), [])
})

test('consumeRunScopedResolutionWarningNotification returns the warning once per notification key', () => {
  const shownNotificationKeys = new Set<string>()
  const resolvedRunner = {
    resolutionNotificationKey: 'D:\\repos\\project\\package.json',
    resolutionWarning: 'Local vscode-tmgrammar-test is declared but missing.'
  }

  assert.equal(
    consumeRunScopedResolutionWarningNotification(shownNotificationKeys, resolvedRunner),
    'Local vscode-tmgrammar-test is declared but missing.'
  )
  assert.equal(
    consumeRunScopedResolutionWarningNotification(shownNotificationKeys, resolvedRunner),
    undefined
  )
  assert.deepEqual(Array.from(shownNotificationKeys), ['D:\\repos\\project\\package.json'])
})
