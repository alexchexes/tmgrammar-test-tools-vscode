import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveNonWorkspaceSettingValue, shouldUseWorkspaceScopedSettings } from '../src/settingsCore'

test('external file documents outside a workspace do not use workspace-scoped settings', () => {
  assert.equal(shouldUseWorkspaceScopedSettings('file', false), false)
})

test('untitled documents without an effective workspace folder do not use workspace-scoped settings', () => {
  assert.equal(shouldUseWorkspaceScopedSettings('untitled', false), false)
})

test('untitled documents with an effective workspace folder use workspace-scoped settings', () => {
  assert.equal(shouldUseWorkspaceScopedSettings('untitled', true), true)
})

test('files inside a workspace use workspace-scoped settings', () => {
  assert.equal(shouldUseWorkspaceScopedSettings('file', true), true)
})

test('resolveNonWorkspaceSettingValue ignores workspace values and prefers global values', () => {
  const value = resolveNonWorkspaceSettingValue({
    defaultValue: 'default',
    defaultLanguageValue: 'default-language',
    globalValue: 'global',
    globalLanguageValue: 'global-language'
  })

  assert.equal(value, 'global-language')
})

test('resolveNonWorkspaceSettingValue falls back to defaults when no global value exists', () => {
  const value = resolveNonWorkspaceSettingValue({
    defaultValue: 'default',
    defaultLanguageValue: 'default-language'
  })

  assert.equal(value, 'default-language')
})
