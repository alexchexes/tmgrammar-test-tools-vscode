import * as assert from 'node:assert/strict'
import test from 'node:test'
import { migrateLegacyGrammarSettingsToGrammarSources } from '../src/settingsMigrationCore'

test('migrateLegacyGrammarSettingsToGrammarSources converts configPath and provider settings into ordered grammarSources rules', () => {
  const rules = migrateLegacyGrammarSettingsToGrammarSources({
    configPath: ' .vscode/grammar-package.json ',
    provider: {
      command: ' node build-grammars.js ',
      cwd: ' ${workspaceFolder} ',
      scopes: ['source.php', ' source.js '],
      timeoutMs: 45000
    }
  })

  assert.deepEqual(rules, [
    {
      configPath: '.vscode/grammar-package.json'
    },
    {
      provider: {
        command: 'node build-grammars.js',
        cwd: '${workspaceFolder}',
        timeoutMs: 45000
      },
      when: {
        scopes: ['source.php', 'source.js']
      }
    }
  ])
})

test('migrateLegacyGrammarSettingsToGrammarSources skips empty legacy values', () => {
  const rules = migrateLegacyGrammarSettingsToGrammarSources({
    configPath: '   ',
    provider: {
      command: '   ',
      scopes: ['   ']
    }
  })

  assert.deepEqual(rules, [])
})
