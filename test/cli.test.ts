import * as assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

test('CLI generates line assertions from a fixture grammar package', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, '--file', fixtureTestPath, '--config', fixtureConfigPath, '--line', '4', '--scope-mode', 'minimal'],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  const output = JSON.parse(stdout) as {
    targets: Array<{
      assertionLines: string[]
      documentLine: number
      kind: string
      sourceText: string
    }>
  }

  assert.deepEqual(output.targets, [
    {
      assertionLines: [
        '// <----- keyword.control.simple-poc',
        '//             ^^^^ string.quoted.double.simple-poc',
        '//             ^ punctuation.definition.string.begin.simple-poc',
        '//                ^ punctuation.definition.string.end.simple-poc'
      ],
      documentLine: 4,
      kind: 'line',
      sourceText: 'const answer = "ok"'
    }
  ])
})

test('CLI generates range assertions from explicit 1-based inclusive columns', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      cliPath,
      '--file',
      fixtureTestPath,
      '--config',
      fixtureConfigPath,
      '--range',
      '4:17-4:18',
      '--scope-mode',
      'minimal'
    ],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  const output = JSON.parse(stdout) as {
    targets: Array<{
      assertionLines: string[]
      documentLine: number
      kind: string
      ranges: Array<{ startIndex: number; endIndex: number }>
      sourceText: string
    }>
  }

  assert.deepEqual(output.targets, [
    {
      assertionLines: ['//              ^^ string.quoted.double.simple-poc'],
      documentLine: 4,
      kind: 'range',
      ranges: [{ startIndex: 16, endIndex: 18 }],
      sourceText: 'const answer = "ok"'
    }
  ])
})

test('CLI plain mode prints only generated assertion lines', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      cliPath,
      '--file',
      fixtureTestPath,
      '--config',
      fixtureConfigPath,
      '--line',
      '4',
      '--scope-mode',
      'minimal',
      '--plain'
    ],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  assert.equal(
    stdout,
    [
      '// <----- keyword.control.simple-poc',
      '//             ^^^^ string.quoted.double.simple-poc',
      '//             ^ punctuation.definition.string.begin.simple-poc',
      '//                ^ punctuation.definition.string.end.simple-poc',
      ''
    ].join('\n')
  )
})
