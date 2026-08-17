import * as assert from 'node:assert/strict'
import test from 'node:test'
import { matchesGrammarSourceRule, normalizeGrammarSourceRules } from '../src/grammarSourceRulesCore'

test('normalizeGrammarSourceRules accepts string or string[] shorthands', () => {
  const normalized = normalizeGrammarSourceRules([
    {
      grammars: 'syntaxes/one.tmLanguage.json',
      when: {
        files: '**/*.php',
        languageIds: 'php',
        scopes: ['source.php']
      }
    }
  ])

  assert.equal(normalized.warnings.length, 0)
  assert.deepEqual(normalized.rules, [
    {
      grammars: ['syntaxes/one.tmLanguage.json'],
      kind: 'grammars',
      when: {
        files: ['**/*.php'],
        languageIds: ['php'],
        scopes: ['source.php']
      }
    }
  ])
})

test('normalizeGrammarSourceRules ignores invalid rules and reports warnings', () => {
  const normalized = normalizeGrammarSourceRules([
    {
      configPath: 'package.json',
      grammars: ['syntaxes/one.tmLanguage.json']
    },
    'not-an-object'
  ])

  assert.equal(normalized.rules.length, 0)
  assert.equal(normalized.warnings.length, 2)
  assert.match(normalized.warnings[0] ?? '', /exactly one source mode/)
  assert.match(normalized.warnings[1] ?? '', /must be an object/)
})

test('matchesGrammarSourceRule uses file and language filters first and scope only when known', () => {
  const normalized = normalizeGrammarSourceRules([
    {
      provider: {
        command: 'node build.js'
      },
      when: {
        files: '**/*.php',
        languageIds: ['php'],
        scopes: ['source.php']
      }
    }
  ])

  const [rule] = normalized.rules
  assert.equal(
    matchesGrammarSourceRule(
      rule,
      {
        absoluteFilePath: 'D:/repos/language-php/spec/example.php',
        languageId: 'php',
        workspaceRelativeFilePath: 'spec/example.php'
      }
    ),
    true
  )
  assert.equal(
    matchesGrammarSourceRule(
      rule,
      {
        absoluteFilePath: 'D:/repos/language-php/spec/example.php',
        languageId: 'php',
        workspaceRelativeFilePath: 'spec/example.php'
      },
      'source.php'
    ),
    true
  )
  assert.equal(
    matchesGrammarSourceRule(
      rule,
      {
        absoluteFilePath: 'D:/repos/language-php/spec/example.php',
        languageId: 'php',
        workspaceRelativeFilePath: 'spec/example.php'
      },
      'source.js'
    ),
    false
  )
  assert.equal(
    matchesGrammarSourceRule(
      rule,
      {
        absoluteFilePath: 'D:/repos/language-php/spec/example.js',
        languageId: 'php',
        workspaceRelativeFilePath: 'spec/example.js'
      },
      'source.php'
    ),
    false
  )
})
