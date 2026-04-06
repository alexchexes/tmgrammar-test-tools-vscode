import test from 'node:test'
import assert from 'node:assert/strict'
import * as os from 'node:os'
import * as path from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import {
  getLocalVscodeTmgrammarTestRuntime,
  getExtensionVscodeTmgrammarTestRuntime
} from '../src/runners/vscodeTmgrammarTestRuntime'
import {
  findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath,
  resolveLocalVscodeTmgrammarTestPackageJsonPath
} from '../src/runners/vscodeTmgrammarTestResolution'

test('resolveLocalVscodeTmgrammarTestPackageJsonPath finds a local dependency from a nested project path', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const projectRoot = path.join(tempRoot, 'project')
    const nestedDirectory = path.join(projectRoot, 'syntaxes', 'tests')
    const packageJsonPath = path.join(projectRoot, 'node_modules', 'vscode-tmgrammar-test', 'package.json')

    await mkdir(path.dirname(packageJsonPath), { recursive: true })
    await mkdir(nestedDirectory, { recursive: true })
    await writeFile(packageJsonPath, JSON.stringify({ name: 'vscode-tmgrammar-test', version: '9.9.9' }))

    assert.equal(resolveLocalVscodeTmgrammarTestPackageJsonPath(nestedDirectory), packageJsonPath)
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})

test('resolveLocalVscodeTmgrammarTestPackageJsonPath returns undefined when no local dependency can be resolved', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const nestedDirectory = path.join(tempRoot, 'project', 'syntaxes', 'tests')
    await mkdir(nestedDirectory, { recursive: true })

    assert.equal(resolveLocalVscodeTmgrammarTestPackageJsonPath(nestedDirectory), undefined)
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})

test('findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath finds an ancestor package.json that declares the dependency', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const projectRoot = path.join(tempRoot, 'project')
    const nestedDirectory = path.join(projectRoot, 'syntaxes', 'tests')
    const packageJsonPath = path.join(projectRoot, 'package.json')

    await mkdir(nestedDirectory, { recursive: true })
    await writeFile(
      packageJsonPath,
      JSON.stringify({
        devDependencies: {
          'vscode-tmgrammar-test': '^0.1.3'
        }
      })
    )

    assert.equal(findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath(nestedDirectory), packageJsonPath)
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})

test('findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath returns undefined when no ancestor package.json declares the dependency', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const projectRoot = path.join(tempRoot, 'project')
    const nestedDirectory = path.join(projectRoot, 'syntaxes', 'tests')
    const packageJsonPath = path.join(projectRoot, 'package.json')

    await mkdir(nestedDirectory, { recursive: true })
    await writeFile(
      packageJsonPath,
      JSON.stringify({
        devDependencies: {
          other: '^1.0.0'
        }
      })
    )

    assert.equal(findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath(nestedDirectory), undefined)
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})

test('getLocalVscodeTmgrammarTestRuntime loads modules from the provided local package', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const packageRoot = path.join(tempRoot, 'project', 'node_modules', 'vscode-tmgrammar-test')
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const commonIndexPath = path.join(packageRoot, 'dist', 'common', 'index.js')
    const unitIndexPath = path.join(packageRoot, 'dist', 'unit', 'index.js')
    const parsingPath = path.join(packageRoot, 'dist', 'unit', 'parsing.js')

    await mkdir(path.dirname(commonIndexPath), { recursive: true })
    await mkdir(path.dirname(unitIndexPath), { recursive: true })
    await writeFile(packageJsonPath, JSON.stringify({ name: 'vscode-tmgrammar-test', version: '9.9.9' }))
    await writeFile(
      commonIndexPath,
      'exports.createRegistry = (grammars) => ({ source: "local", grammars });\n'
    )
    await writeFile(
      unitIndexPath,
      [
        'exports.parseGrammarTestCase = (value) => ({ metadata: { commentToken: "//", description: "", scope: "source.js" }, source: [value], assertions: [] });',
        'exports.runGrammarTestCase = async () => [];'
      ].join('\n')
    )
    await writeFile(
      parsingPath,
      'exports.parseScopeAssertion = () => [{ from: 0, to: 1, scopes: ["source.js"], exclude: [] }];\n'
    )

    const localRuntime = getLocalVscodeTmgrammarTestRuntime(packageJsonPath)
    const extensionRuntime = getExtensionVscodeTmgrammarTestRuntime()

    assert.notStrictEqual(localRuntime.createRegistry, extensionRuntime.createRegistry)
    assert.deepEqual(localRuntime.createRegistry([]), { source: 'local', grammars: [] })
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})

test('getLocalVscodeTmgrammarTestRuntime fails clearly when the local runner is unusable or incompatible', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'tmgrammar-test-tools-runner-'))

  try {
    const packageRoot = path.join(tempRoot, 'project', 'node_modules', 'vscode-tmgrammar-test')
    const packageJsonPath = path.join(packageRoot, 'package.json')
    const commonIndexPath = path.join(packageRoot, 'dist', 'common', 'index.js')
    const unitIndexPath = path.join(packageRoot, 'dist', 'unit', 'index.js')
    const parsingPath = path.join(packageRoot, 'dist', 'unit', 'parsing.js')

    await mkdir(path.dirname(commonIndexPath), { recursive: true })
    await mkdir(path.dirname(unitIndexPath), { recursive: true })
    await writeFile(packageJsonPath, JSON.stringify({ name: 'vscode-tmgrammar-test', version: '9.9.9' }))
    await writeFile(commonIndexPath, 'exports.createRegistry = 123;\n')
    await writeFile(
      unitIndexPath,
      [
        'exports.parseGrammarTestCase = (value) => ({ metadata: { commentToken: "//", description: "", scope: "source.js" }, source: [value], assertions: [] });',
        'exports.runGrammarTestCase = async () => [];'
      ].join('\n')
    )
    await writeFile(
      parsingPath,
      'exports.parseScopeAssertion = () => [{ from: 0, to: 1, scopes: ["source.js"], exclude: [] }];\n'
    )

    assert.throws(
      () => getLocalVscodeTmgrammarTestRuntime(packageJsonPath),
      /Local vscode-tmgrammar-test resolved from .* is unusable or incompatible\. The extension will not fall back to the bundled runner because a local runner was resolved\. Expected export "createRegistry" to be a function\./
    )
  } finally {
    await rm(tempRoot, { force: true, recursive: true })
  }
})
