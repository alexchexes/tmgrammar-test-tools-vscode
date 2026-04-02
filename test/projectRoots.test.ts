import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProjectRootForFile } from '../src/projectRoots'

test('resolveProjectRootForFile rejects unsaved or non-file paths', async () => {
  await assert.rejects(
    resolveProjectRootForFile(''),
    /Expected a saved file path or workspace folder to resolve the project root/
  )
})
