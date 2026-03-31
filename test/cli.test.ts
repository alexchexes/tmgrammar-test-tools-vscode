import * as assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
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

test('CLI compare mode prints minimal and full assertion blocks with the source line', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, '--file', fixtureTestPath, '--config', fixtureConfigPath, '--line', '4', '--compare'],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  assert.equal(
    stdout,
    [
      'line 4',
      'const answer = "ok"',
      '',
      'minimal',
      '// <----- keyword.control.simple-poc',
      '//             ^^^^ string.quoted.double.simple-poc',
      '//             ^ punctuation.definition.string.begin.simple-poc',
      '//                ^ punctuation.definition.string.end.simple-poc',
      '',
      'full',
      '// <----- source.simple-poc keyword.control.simple-poc',
      '//   ^^^^^^^^^^ source.simple-poc',
      '//             ^ source.simple-poc string.quoted.double.simple-poc punctuation.definition.string.begin.simple-poc',
      '//              ^^ source.simple-poc string.quoted.double.simple-poc',
      '//                ^ source.simple-poc string.quoted.double.simple-poc punctuation.definition.string.end.simple-poc',
      ''
    ].join('\n')
  )
})

test('CLI compare mode rejects --scope-mode because it always prints both forms', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [cliPath, '--file', fixtureTestPath, '--config', fixtureConfigPath, '--line', '4', '--compare', '--scope-mode', 'minimal'],
      {
        cwd: path.resolve(__dirname, '../..')
      }
    ),
    /--compare cannot be combined with --scope-mode/
  )
})

test('CLI info log level writes diagnostics to stderr while keeping stdout JSON clean', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stdout, stderr } = await execFileAsync(
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
      '--log-level',
      'info'
    ],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  const output = JSON.parse(stdout) as {
    scopeName: string
    targets: Array<{
      documentLine: number
      kind: string
    }>
  }

  assert.equal(output.scopeName, 'source.simple-poc')
  assert.deepEqual(
    output.targets.map((target) => ({ documentLine: target.documentLine, kind: target.kind })),
    [{ documentLine: 4, kind: 'line' }]
  )
  assert.match(stderr, /\[info\] Parsed syntax test header with scope source\.simple-poc/)
  assert.match(stderr, /\[info\] Base grammar winner: source\.simple-poc -> \[local\]/)
})

test('CLI debug log level writes effective grammar usage trace to stderr', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')

  const { stderr } = await execFileAsync(
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
      '--log-level',
      'debug'
    ],
    {
      cwd: path.resolve(__dirname, '../..')
    }
  )

  assert.match(stderr, /\[debug\] Effective grammar usage for source line 4:/)
  assert.match(stderr, /\[debug\]\s+base scope:/)
})

test('CLI provider-scope skips the provider for non-matching syntax test scopes', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-cli-provider-scope-'))

  try {
    const scriptPath = path.join(tempDir, 'provider-fail.cjs')
    await writeFile(scriptPath, "process.stderr.write('provider should have been skipped\\n'); process.exit(1)\n")

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        cliPath,
        '--file',
        fixtureTestPath,
        '--config',
        fixtureConfigPath,
        '--line',
        '4',
        '--provider-command',
        `"${process.execPath}" "${scriptPath}"`,
        '--provider-scope',
        'source.other',
        '--log-level',
        'info'
      ],
      {
        cwd: path.resolve(__dirname, '../..')
      }
    )

    const output = JSON.parse(stdout) as {
      scopeName: string
      targets: Array<{ assertionLines: string[]; documentLine: number; kind: string; sourceText: string }>
    }

    assert.equal(output.scopeName, 'source.simple-poc')
    assert.deepEqual(
      output.targets.map((target) => ({ documentLine: target.documentLine, kind: target.kind })),
      [{ documentLine: 4, kind: 'line' }]
    )
    assert.match(stderr, /Skipping grammar provider for scope source\.simple-poc because --provider-scope is limited to: source\.other/)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})

test('CLI provider-scope runs the provider for exact matching syntax test scopes', async () => {
  const cliPath = path.resolve(__dirname, '../src/cli.js')
  const fixtureConfigPath = path.resolve(__dirname, '../../fixtures/simple-grammar/package.json')
  const fixtureTestPath = path.resolve(__dirname, '../../fixtures/simple-grammar/tests/example.simple-poc')
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-cli-provider-scope-'))

  try {
    const scriptPath = path.join(tempDir, 'provider-fail.cjs')
    await writeFile(scriptPath, "process.stderr.write('provider ran\\n'); process.exit(1)\n")

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          cliPath,
          '--file',
          fixtureTestPath,
          '--config',
          fixtureConfigPath,
          '--line',
          '4',
          '--provider-command',
          `"${process.execPath}" "${scriptPath}"`,
          '--provider-scope',
          'source.simple-poc'
        ],
        {
          cwd: path.resolve(__dirname, '../..')
        }
      ),
      /provider ran/
    )
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
