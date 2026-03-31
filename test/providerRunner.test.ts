import * as assert from 'node:assert/strict'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runGrammarProvider } from '../src/providerRunner'

test('grammar provider accepts newline-separated grammar file paths', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-provider-'))

  try {
    await writeFile(path.join(tempDir, 'one.tmLanguage.json'), '{}')
    await writeFile(path.join(tempDir, 'two.tmLanguage.json'), '{}')
    const scriptPath = path.join(tempDir, 'provider-newlines.cjs')
    await writeFile(
      scriptPath,
      "process.stdout.write('one.tmLanguage.json\\ntwo.tmLanguage.json\\n')\n"
    )

    const grammars = await runGrammarProvider(
      {
        filePath: path.join(tempDir, 'example.test'),
        projectRoot: tempDir,
        workspaceFolder: tempDir
      },
      {
        command: `"${process.execPath}" "${scriptPath}"`,
        cwd: tempDir
      }
    )

    assert.deepEqual(grammars, [
      {
        path: path.join(tempDir, 'one.tmLanguage.json'),
        scopeName: ''
      },
      {
        path: path.join(tempDir, 'two.tmLanguage.json'),
        scopeName: ''
      }
    ])
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})

test('grammar provider accepts a JSON array of paths or grammar objects', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-provider-'))

  try {
    await writeFile(path.join(tempDir, 'base.tmLanguage.json'), '{}')
    await writeFile(path.join(tempDir, 'inject.tmLanguage.json'), '{}')
    const scriptPath = path.join(tempDir, 'provider-array.cjs')
    await writeFile(
      scriptPath,
      [
        'process.stdout.write(JSON.stringify([',
        '  "base.tmLanguage.json",',
        '  {',
        '    path: "inject.tmLanguage.json",',
        '    scopeName: "source.injected",',
        '    injectTo: ["source.base"],',
        '    language: "javascript"',
        '  }',
        ']))'
      ].join('\n')
    )

    const grammars = await runGrammarProvider(
      {
        filePath: path.join(tempDir, 'example.test'),
        projectRoot: tempDir,
        workspaceFolder: tempDir
      },
      {
        command: `"${process.execPath}" "${scriptPath}"`,
        cwd: tempDir
      }
    )

    assert.deepEqual(grammars, [
      {
        path: path.join(tempDir, 'base.tmLanguage.json'),
        scopeName: ''
      },
      {
        injectTo: ['source.base'],
        language: 'javascript',
        path: path.join(tempDir, 'inject.tmLanguage.json'),
        scopeName: 'source.injected'
      }
    ])
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})

test('grammar provider accepts a JSON object with a grammars array', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-provider-'))

  try {
    await writeFile(path.join(tempDir, 'from-object.tmLanguage.json'), '{}')
    const scriptPath = path.join(tempDir, 'provider-object.cjs')
    await writeFile(
      scriptPath,
      [
        'process.stdout.write(JSON.stringify({',
        '  grammars: [',
        '    {',
        '      path: "from-object.tmLanguage.json",',
        '      scopeName: "source.object"',
        '    }',
        '  ]',
        '}))'
      ].join('\n')
    )

    const grammars = await runGrammarProvider(
      {
        filePath: path.join(tempDir, 'example.test'),
        projectRoot: tempDir,
        workspaceFolder: tempDir
      },
      {
        command: `"${process.execPath}" "${scriptPath}"`,
        cwd: tempDir
      }
    )

    assert.deepEqual(grammars, [
      {
        injectTo: undefined,
        language: undefined,
        path: path.join(tempDir, 'from-object.tmLanguage.json'),
        scopeName: 'source.object'
      }
    ])
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})
