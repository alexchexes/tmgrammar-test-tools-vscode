import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCommandTemplate, resolveProviderCwdTemplate } from '../src/providerTemplates'

test('provider cwd defaults to workspace folder when one is available', () => {
  const cwd = resolveProviderCwdTemplate({
    filePath: 'D:\\repos\\language-php\\spec\\tmgrammar\\example.php',
    projectRoot: 'D:\\repos\\language-php\\spec\\tmgrammar',
    workspaceFolder: 'D:\\repos\\language-php'
  })

  assert.equal(cwd, 'D:\\repos\\language-php')
})

test('provider cwd falls back to project root when the file is outside a workspace folder', () => {
  const cwd = resolveProviderCwdTemplate({
    filePath: 'D:\\scratch\\example.php',
    projectRoot: 'D:\\scratch'
  })

  assert.equal(cwd, 'D:\\scratch')
})

test('provider cwd rejects an explicit ${workspaceFolder} when the file is outside a workspace folder', () => {
  assert.throws(
    () =>
      resolveProviderCwdTemplate(
        {
          filePath: 'D:\\scratch\\example.php',
          projectRoot: 'D:\\scratch'
        },
        '${workspaceFolder}'
      ),
    /Grammar provider cwd references \$\{workspaceFolder\}, but it is unavailable/
  )
})

test('provider cwd only expands directory-oriented variables', () => {
  const cwd = resolveProviderCwdTemplate(
    {
      filePath: 'D:\\repos\\language-php\\spec\\tmgrammar\\example.php',
      projectRoot: 'D:\\repos\\language-php',
      workspaceFolder: 'D:\\repos\\language-php'
    },
    '${fileDirname}'
  )

  assert.equal(cwd, 'D:\\repos\\language-php\\spec\\tmgrammar')
})

test('provider command rejects ${workspaceFolder} when the file is outside a workspace folder', () => {
  assert.throws(
    () =>
      resolveCommandTemplate('node build.js --cwd ${workspaceFolder}', {
        filePath: 'D:\\scratch\\example.php',
        projectRoot: 'D:\\scratch'
      }),
    /Grammar provider command references \$\{workspaceFolder\}, but it is unavailable/
  )
})
