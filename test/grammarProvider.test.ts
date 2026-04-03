import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldRunProviderForScope } from '../src/providerScopeFilter'
import { buildProviderLoadCacheKey, resolveCommandTemplate, resolveProviderCwdTemplate } from '../src/providerTemplates'

test('provider command expands supported variables', () => {
  const command = resolveCommandTemplate(
    'node dump.js --file "${file}" --name "${fileBasename}" --dir "${fileDirname}" --root "${projectRoot}" --workspace "${workspaceFolder}"',
    {
      filePath: 'D:\\repos\\language-php\\spec\\tmgrammar\\example.php',
      projectRoot: 'D:\\repos\\language-php',
      workspaceFolder: 'D:\\repos\\language-php'
    }
  )

  assert.equal(
    command,
    'node dump.js --file "D:\\repos\\language-php\\spec\\tmgrammar\\example.php" --name "example.php" --dir "D:\\repos\\language-php\\spec\\tmgrammar" --root "D:\\repos\\language-php" --workspace "D:\\repos\\language-php"'
  )
})

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

test('provider cwd expands supported variables', () => {
  const cwd = resolveProviderCwdTemplate(
    {
      filePath: 'D:\\repos\\language-php\\spec\\tmgrammar\\example.php',
      projectRoot: 'D:\\repos\\language-php',
      workspaceFolder: 'D:\\repos\\language-php'
    },
    '${workspaceFolder}\\tmp\\from-${projectRoot}\\at-${fileDirname}'
  )

  assert.equal(
    cwd,
    'D:\\repos\\language-php\\tmp\\from-D:\\repos\\language-php\\at-D:\\repos\\language-php\\spec\\tmgrammar'
  )
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

test('provider scopes limit execution to exact matching syntax test scopes', () => {
  assert.equal(shouldRunProviderForScope('source.php', ['source.php']), true)
  assert.equal(shouldRunProviderForScope('source.js', ['source.php']), false)
})

test('provider scopes are optional', () => {
  assert.equal(shouldRunProviderForScope('source.js', undefined), true)
})

test('provider cache key stays stable for the same resolved invocation', () => {
  const firstKey = buildProviderLoadCacheKey(
    'node dump.js --file "D:\\repos\\language-php\\spec\\tmgrammar\\one.php"',
    'D:\\repos\\language-php',
    'source.php',
    30000
  )
  const secondKey = buildProviderLoadCacheKey(
    'node dump.js --file "D:\\repos\\language-php\\spec\\tmgrammar\\one.php"',
    'D:\\repos\\language-php',
    'source.php',
    30000
  )

  assert.equal(firstKey, secondKey)
})

test('provider cache key differs when the resolved file-specific command differs', () => {
  const firstKey = buildProviderLoadCacheKey(
    'node dump.js --file "D:\\repos\\language-php\\spec\\tmgrammar\\one.php"',
    'D:\\repos\\language-php',
    'source.php',
    30000
  )
  const secondKey = buildProviderLoadCacheKey(
    'node dump.js --file "D:\\repos\\language-php\\spec\\tmgrammar\\two.php"',
    'D:\\repos\\language-php',
    'source.php',
    30000
  )

  assert.notEqual(firstKey, secondKey)
})

test('provider cache key differs when the resolved cwd, scope, or timeout differs', () => {
  const baseKey = buildProviderLoadCacheKey(
    'node dump.js',
    'D:\\repos\\language-php',
    'source.php',
    30000
  )

  assert.notEqual(
    baseKey,
    buildProviderLoadCacheKey('node dump.js', 'D:\\repos\\language-php\\spec', 'source.php', 30000)
  )
  assert.notEqual(
    baseKey,
    buildProviderLoadCacheKey('node dump.js', 'D:\\repos\\language-php', 'source.js', 30000)
  )
  assert.notEqual(
    baseKey,
    buildProviderLoadCacheKey('node dump.js', 'D:\\repos\\language-php', 'source.php', 1000)
  )
})
