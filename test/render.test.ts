import * as assert from 'node:assert/strict'
import * as path from 'node:path'
import { test } from 'node:test'
import type { IToken } from 'vscode-textmate'
import { renderAssertionBlock } from '../src/render'
import { clipTokensToRanges } from '../src/selectionTargets'
import { tokenizeSourceLine } from '../src/textmate'

const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as {
  createRegistry: (grammars: Array<{ path: string; scopeName: string }>) => unknown
}
const { parseScopeAssertion } = require('vscode-tmgrammar-test/dist/unit/parsing') as {
  parseScopeAssertion: (testCaseLineNumber: number, commentLength: number, assertionLine: string) => Array<{
    from: number
    to: number
    scopes: string[]
    exclude: string[]
  }>
}
const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as {
  parseGrammarTestCase: (value: string) => unknown
  runGrammarTestCase: (registry: unknown, testCase: unknown) => Promise<unknown[]>
}

function token(startIndex: number, endIndex: number, ...scopes: string[]): IToken {
  return {
    startIndex,
    endIndex,
    scopes
  }
}

test('full mode compacts disjoint caret ranges and stays compatible with vscode-tmgrammar-test parsing', () => {
  const assertionLines = renderAssertionBlock('#', '0123456789', [token(2, 4, 'scope.a'), token(5, 7, 'scope.a')], {
    compactRanges: true,
    scopeMode: 'full',
    headerScope: 'source.example'
  })

  assert.deepEqual(assertionLines, ['# ^^ ^^ scope.a'])

  const parsedAssertions = parseScopeAssertion(2, 1, assertionLines[0])
  assert.deepEqual(parsedAssertions, [
    {
      from: 2,
      to: 4,
      scopes: ['scope.a'],
      exclude: []
    },
    {
      from: 5,
      to: 7,
      scopes: ['scope.a'],
      exclude: []
    }
  ])
})

test('minimal mode emits shared parents once and narrower child scopes as deltas', () => {
  const assertionLines = renderAssertionBlock(
    '#',
    '/[ab]/',
    [
      token(0, 1, 'source.fake', 'regex'),
      token(1, 2, 'source.fake', 'regex', 'class', 'punctuation'),
      token(2, 4, 'source.fake', 'regex', 'class', 'set'),
      token(4, 5, 'source.fake', 'regex', 'class', 'punctuation'),
      token(5, 6, 'source.fake', 'regex')
    ],
    {
      compactRanges: true,
      scopeMode: 'minimal',
      headerScope: 'source.fake'
    }
  )

  assert.deepEqual(assertionLines, [
    '# <------ regex',
    '#^  ^ class punctuation',
    '# ^^ class set'
  ])
})

test('minimal mode keeps the header scope when that is the only information on the line', () => {
  const assertionLines = renderAssertionBlock('//', 'plain text', [token(0, 10, 'source.plain')], {
    compactRanges: true,
    scopeMode: 'minimal',
    headerScope: 'source.plain'
  })

  assert.deepEqual(assertionLines, ['// <---------- source.plain'])
})

test('generated fixture assertions round-trip through vscode-tmgrammar-test in both full and minimal modes', async () => {
  const fixtureGrammarPath = path.resolve(__dirname, '../../fixtures/simple-grammar/syntaxes/simple-poc.tmLanguage.json')
  const grammars = [{ path: fixtureGrammarPath, scopeName: 'source.simple-poc' }]
  const sourceLines = [
    { documentLine: 1, text: '' },
    { documentLine: 2, text: 'let value = 42' },
    { documentLine: 3, text: 'const answer = "ok"' }
  ]
  const registry = createRegistry(grammars)

  for (const scopeMode of ['full', 'minimal'] as const) {
    const tokens = await tokenizeSourceLine(grammars, 'source.simple-poc', sourceLines, 2)
    const assertionLines = renderAssertionBlock('//', 'const answer = "ok"', tokens, {
      compactRanges: true,
      scopeMode,
      headerScope: 'source.simple-poc'
    })

    assert.ok(assertionLines.length > 0)

    const testCase = [
      '// SYNTAX TEST "source.simple-poc" "generated in test"',
      '',
      'let value = 42',
      'const answer = "ok"',
      ...assertionLines
    ].join('\n')

    const parsedTestCase = parseGrammarTestCase(testCase)
    const failures = await runGrammarTestCase(registry, parsedTestCase)
    assert.deepEqual(failures, [], `Expected no vscode-tmgrammar-test failures for ${scopeMode} mode.`)
  }
})

test('partial-range fixture assertions round-trip through vscode-tmgrammar-test', async () => {
  const fixtureGrammarPath = path.resolve(__dirname, '../../fixtures/simple-grammar/syntaxes/simple-poc.tmLanguage.json')
  const grammars = [{ path: fixtureGrammarPath, scopeName: 'source.simple-poc' }]
  const sourceLines = [
    { documentLine: 1, text: '' },
    { documentLine: 2, text: 'let value = 42' },
    { documentLine: 3, text: 'const answer = "ok"' }
  ]
  const registry = createRegistry(grammars)
  const tokens = await tokenizeSourceLine(grammars, 'source.simple-poc', sourceLines, 2)
  const clippedTokens = clipTokensToRanges(tokens, [{ startIndex: 16, endIndex: 18 }])

  for (const scopeMode of ['full', 'minimal'] as const) {
    const assertionLines = renderAssertionBlock('//', 'const answer = "ok"', clippedTokens, {
      compactRanges: true,
      scopeMode,
      headerScope: 'source.simple-poc'
    })

    assert.ok(assertionLines.length > 0)

    const testCase = [
      '// SYNTAX TEST "source.simple-poc" "generated partial range in test"',
      '',
      'let value = 42',
      'const answer = "ok"',
      ...assertionLines
    ].join('\n')

    const parsedTestCase = parseGrammarTestCase(testCase)
    const failures = await runGrammarTestCase(registry, parsedTestCase)
    assert.deepEqual(failures, [], `Expected no vscode-tmgrammar-test failures for partial ${scopeMode} mode.`)
  }
})
