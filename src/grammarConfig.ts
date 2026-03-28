import * as vscode from 'vscode'
import { promises as fs } from 'fs'
import * as path from 'path'

export interface GrammarContribution {
  path: string
  scopeName: string
  injectTo?: string[]
  language?: string
}

interface PackageJsonShape {
  contributes?: {
    grammars?: Array<{
      path?: unknown
      scopeName?: unknown
      injectTo?: unknown
      language?: unknown
    }>
  }
}

export async function resolveConfigPath(document: vscode.TextDocument): Promise<string> {
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const configuredPath = configuration.get<string>('configPath')?.trim()
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)

  if (configuredPath) {
    if (path.isAbsolute(configuredPath)) {
      await assertGrammarConfig(configuredPath)
      return configuredPath
    }

    const relativeBase = workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath)
    const resolvedPath = path.resolve(relativeBase, configuredPath)
    await assertGrammarConfig(resolvedPath)
    return resolvedPath
  }

  let currentDirectory = path.dirname(document.uri.fsPath)
  const workspaceRoot = workspaceFolder?.uri.fsPath
  const fileSystemRoot = path.parse(currentDirectory).root

  while (true) {
    const candidate = path.join(currentDirectory, 'package.json')
    if (await hasGrammarConfig(candidate)) {
      return candidate
    }

    if (currentDirectory === workspaceRoot || currentDirectory === fileSystemRoot) {
      break
    }

    currentDirectory = path.dirname(currentDirectory)
  }

  throw new Error(
    'Could not find a package.json with contributes.grammars above the active file. Set tmGrammarTestTools.configPath to point at the grammar package.json.'
  )
}

export async function loadGrammarContributions(configPath: string): Promise<GrammarContribution[]> {
  const packageJson = await readPackageJson(configPath)
  const grammars = packageJson.contributes?.grammars ?? []
  const configDirectory = path.dirname(configPath)

  if (grammars.length === 0) {
    throw new Error(`No contributes.grammars entries were found in ${configPath}.`)
  }

  return grammars.map((grammar, index) => {
    if (typeof grammar.path !== 'string' || grammar.path.length === 0) {
      throw new Error(`Grammar entry ${index + 1} in ${configPath} is missing a valid path.`)
    }

    return {
      path: path.resolve(configDirectory, grammar.path),
      scopeName: typeof grammar.scopeName === 'string' ? grammar.scopeName : '',
      injectTo: Array.isArray(grammar.injectTo)
        ? grammar.injectTo.filter((value): value is string => typeof value === 'string')
        : undefined,
      language: typeof grammar.language === 'string' ? grammar.language : undefined
    }
  })
}

async function hasGrammarConfig(configPath: string): Promise<boolean> {
  try {
    const packageJson = await readPackageJson(configPath)
    return (packageJson.contributes?.grammars?.length ?? 0) > 0
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

async function assertGrammarConfig(configPath: string): Promise<void> {
  const exists = await hasGrammarConfig(configPath)
  if (!exists) {
    throw new Error(`No contributes.grammars entries were found in ${configPath}.`)
  }
}

async function readPackageJson(configPath: string): Promise<PackageJsonShape> {
  const content = await fs.readFile(configPath, 'utf8')
  return JSON.parse(content) as PackageJsonShape
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
