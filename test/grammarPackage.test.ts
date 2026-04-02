import test from 'node:test'
import assert from 'node:assert/strict'
import { findGrammarConfigPathForFile } from '../src/grammarPackage'

test('findGrammarConfigPathForFile returns undefined for unsaved or non-file paths when no config is set', async () => {
  await assert.doesNotReject(async () => {
    const configPath = await findGrammarConfigPathForFile('', {})
    assert.equal(configPath, undefined)
  })
})

test('findGrammarConfigPathForFile rejects relative configured paths without a resolution base', async () => {
  await assert.rejects(
    findGrammarConfigPathForFile('', {
      configuredPath: 'package.json'
    }),
    /Relative tmGrammarTestTools\.configPath requires a saved file or a workspace folder/
  )
})
