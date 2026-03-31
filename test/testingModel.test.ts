import * as assert from 'node:assert/strict'
import * as path from 'node:path'
import { test } from 'node:test'
import {
  buildLineOnlyGrammarTestCase,
  collectRunnableSourceLinesFromLines,
  GrammarTestCase,
  resolveFailureAssertionDocumentLine,
  resolveFailureAssertionRange
} from '../src/testingModel'

const { createRegistry } = require('vscode-tmgrammar-test/dist/common/index') as {
  createRegistry: (grammars: Array<{ path: string; scopeName: string }>) => unknown
}
const { parseGrammarTestCase, runGrammarTestCase } = require('vscode-tmgrammar-test/dist/unit/index') as {
  parseGrammarTestCase: (value: string) => GrammarTestCase
  runGrammarTestCase: (registry: unknown, testCase: GrammarTestCase) => Promise<Array<{
    actual: string[]
    end: number
    line: number
    missing: string[]
    srcLine: number
    start: number
    unexpected: string[]
  }>>
}

test('collectRunnableSourceLinesFromLines returns source lines that already have assertion blocks', () => {
  const lines = [
    '// SYNTAX TEST "source.example"',
    '',
    'alpha()',
    '// ^^^^^ source.example alpha',
    'beta()',
    'gamma()',
    '// <---- source.example gamma'
  ]

  assert.deepEqual(collectRunnableSourceLinesFromLines(lines, '//'), [
    { documentLine: 2, sourceLineNumber: 1, text: 'alpha()' },
    { documentLine: 5, sourceLineNumber: 3, text: 'gamma()' }
  ])
})

test('buildLineOnlyGrammarTestCase keeps only the requested source line assertions and source prefix', () => {
  const testCase: GrammarTestCase = {
    assertions: [
      { scopeAssertions: [{ exclude: [], from: 0, scopes: ['scope.a'], to: 1 }], sourceLineNumber: 0, testCaseLineNumber: 2 },
      { scopeAssertions: [{ exclude: [], from: 0, scopes: ['scope.b'], to: 1 }], sourceLineNumber: 2, testCaseLineNumber: 6 }
    ],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['alpha()', 'beta()', 'gamma()']
  }

  assert.deepEqual(buildLineOnlyGrammarTestCase(testCase, 2), {
    assertions: [{ scopeAssertions: [{ exclude: [], from: 0, scopes: ['scope.b'], to: 1 }], sourceLineNumber: 2, testCaseLineNumber: 6 }],
    metadata: testCase.metadata,
    source: ['alpha()', 'beta()', 'gamma()']
  })
})

test('resolveFailureAssertionRange prefers the narrowest overlapping assertion range', () => {
  const testCase: GrammarTestCase = {
    assertions: [
      {
        scopeAssertions: [
          { exclude: [], from: 0, scopes: ['scope.a'], to: 1 },
          { exclude: ['scope.b'], from: 0, scopes: [], to: 1 }
        ],
        sourceLineNumber: 0,
        testCaseLineNumber: 2
      }
    ],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['alpha()']
  }

  assert.deepEqual(
    resolveFailureAssertionRange(testCase, {
      actual: ['scope.a', 'scope.b'],
      end: 5,
      line: 2,
      missing: [],
      srcLine: 0,
      start: 0,
      unexpected: ['scope.b']
    }),
    { end: 1, start: 0 }
  )
})

test('resolveFailureAssertionRange prefers an exact matching left-arrow range over another overlap', () => {
  const testCase: GrammarTestCase = {
    assertions: [
      {
        scopeAssertions: [
          { exclude: [], from: 0, scopes: ['scope.foo'], to: 2 },
          { exclude: [], from: 1, scopes: ['scope.bar'], to: 3 }
        ],
        sourceLineNumber: 0,
        testCaseLineNumber: 2
      }
    ],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['var TEST = "ok"']
  }

  assert.deepEqual(
    resolveFailureAssertionRange(testCase, {
      actual: [],
      end: 2,
      line: 2,
      missing: ['scope.foo'],
      srcLine: 0,
      start: 0,
      unexpected: []
    }),
    { end: 2, start: 0 }
  )
})

test('resolveFailureAssertionRange prefers matching required scopes when token-span overlap is broader than the assertion', () => {
  const testCase: GrammarTestCase = {
    assertions: [
      {
        scopeAssertions: [
          { exclude: [], from: 0, scopes: ['scope.foo'], to: 2 },
          { exclude: [], from: 1, scopes: ['scope.bar'], to: 3 }
        ],
        sourceLineNumber: 0,
        testCaseLineNumber: 2
      }
    ],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['var TEST = "ok"']
  }

  assert.deepEqual(
    resolveFailureAssertionRange(testCase, {
      actual: [],
      end: 3,
      line: 2,
      missing: ['scope.bar'],
      srcLine: 0,
      start: 0,
      unexpected: []
    }),
    { end: 3, start: 1 }
  )
})

test('resolveFailureAssertionRange maps adjacent left-arrow failures from the real runner to the intended assertion span', async () => {
  const fixtureGrammarPath = path.resolve(__dirname, '../../fixtures/simple-grammar/syntaxes/simple-poc.tmLanguage.json')
  const registry = createRegistry([{ path: fixtureGrammarPath, scopeName: 'source.simple-poc' }])
  const parsedTestCase = parseGrammarTestCase(
    [
      '// SYNTAX TEST "source.simple-poc" "adjacent left arrows"',
      '',
      'let value = 42',
      '// <-- foo',
      '// <~-- bar'
    ].join('\n')
  )
  const failures = await runGrammarTestCase(registry, parsedTestCase)

  assert.deepEqual(
    failures.map((failure) => ({
      missing: failure.missing,
      resolved: resolveFailureAssertionRange(parsedTestCase, failure)
    })),
    [
      {
        missing: ['foo'],
        resolved: { end: 2, start: 0 }
      },
      {
        missing: ['bar'],
        resolved: { end: 3, start: 1 }
      }
    ]
  )
})

test('resolveFailureAssertionRange prefers matching excluded scopes when token-span overlap is broader than the assertion', () => {
  const testCase: GrammarTestCase = {
    assertions: [
      {
        scopeAssertions: [
          { exclude: [], from: 0, scopes: ['scope.a'], to: 3 },
          { exclude: ['scope.b'], from: 0, scopes: [], to: 1 }
        ],
        sourceLineNumber: 0,
        testCaseLineNumber: 2
      }
    ],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['alpha()']
  }

  assert.deepEqual(
    resolveFailureAssertionRange(testCase, {
      actual: ['scope.a', 'scope.b'],
      end: 3,
      line: 2,
      missing: [],
      srcLine: 0,
      start: 0,
      unexpected: ['scope.b']
    }),
    { end: 1, start: 0 }
  )
})

test('resolveFailureAssertionRange returns undefined when no matching assertion line exists', () => {
  const testCase: GrammarTestCase = {
    assertions: [],
    metadata: {
      commentToken: '//',
      description: '',
      scope: 'source.example'
    },
    source: ['alpha()']
  }

  assert.equal(
    resolveFailureAssertionRange(testCase, {
      actual: [],
      end: 5,
      line: 2,
      missing: ['scope.a'],
      srcLine: 0,
      start: 0,
      unexpected: []
    }),
    undefined
  )
})

test('resolveFailureAssertionDocumentLine resolves the matching assertion line below the source line', () => {
  const lines = [
    '// SYNTAX TEST "source.example"',
    '',
    'var TEST = "ok"',
    '// <-- foo',
    '// <~-- bar'
  ]

  assert.equal(
    resolveFailureAssertionDocumentLine(lines, '//', 2, {
      actual: [],
      end: 3,
      line: 2,
      missing: ['bar'],
      srcLine: 1,
      start: 0,
      unexpected: []
    }),
    4
  )
})
