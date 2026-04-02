import { promises as fs } from 'fs'
import * as path from 'path'
import { GrammarContribution } from './grammarTypes'

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

export interface GrammarConfigResolutionOptions {
  configuredPath?: string
  relativeBase?: string
  searchRoot?: string
}

export async function findGrammarConfigPathForFile(
  filePath: string,
  options: GrammarConfigResolutionOptions = {}
): Promise<string | undefined> {
  const configuredPath = options.configuredPath?.trim()

  if (configuredPath) {
    if (!path.isAbsolute(configuredPath) && !options.relativeBase) {
      throw new Error(
        'Relative tmGrammarTestTools.configPath requires a saved file or a workspace folder to resolve against.'
      )
    }

    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(options.relativeBase!, configuredPath)
    await assertGrammarConfig(resolvedPath)
    return resolvedPath
  }

  if (!path.isAbsolute(filePath)) {
    return undefined
  }

  let currentDirectory = path.dirname(filePath)
  const fileSystemRoot = path.parse(currentDirectory).root
  const searchRoot = options.searchRoot ? path.resolve(options.searchRoot) : undefined

  while (true) {
    const candidate = path.join(currentDirectory, 'package.json')
    if (await hasGrammarConfig(candidate)) {
      return candidate
    }

    if (currentDirectory === searchRoot || currentDirectory === fileSystemRoot) {
      break
    }

    currentDirectory = path.dirname(currentDirectory)
  }

  return undefined
}

export async function loadGrammarContributionsFromConfig(configPath: string): Promise<GrammarContribution[]> {
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
