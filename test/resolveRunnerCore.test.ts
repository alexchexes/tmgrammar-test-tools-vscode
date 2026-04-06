import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLocalRunnerTrustDecision } from '../src/runners/resolveRunnerCore'

test('resolveLocalRunnerTrustDecision allows local runner resolution in trusted workspaces', () => {
  assert.deepEqual(resolveLocalRunnerTrustDecision(true), {
    allowLocalResolution: true
  })
})

test('resolveLocalRunnerTrustDecision disables local runner resolution in untrusted workspaces', () => {
  assert.deepEqual(resolveLocalRunnerTrustDecision(false), {
    allowLocalResolution: false,
    resolutionWarning:
      'Workspace is not trusted; skipping local vscode-tmgrammar-test resolution and using the bundled runner.'
  })
})
