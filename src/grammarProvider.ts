import { exec } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import * as vscode from 'vscode'
import { GrammarContribution, resolveProjectRoot } from './grammarConfig'
import { logInfo } from './log'

const execAsync = promisify(exec)

interface ProviderGrammarEntry {
  path?: unknown
  scopeName?: unknown
  injectTo?: unknown
  language?: unknown
}

interface ProviderPayload {
  grammars?: unknown
}

export async function loadProviderGrammarContributions(document: vscode.TextDocument): Promise<GrammarContribution[]> {
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const configuredCommand = configuration.get<string>('grammarProvider.command')?.trim()

  if (!configuredCommand) {
    logInfo('No grammar provider command configured for the active document.')
    return []
  }

  const projectRoot = await resolveProjectRoot(document)
  const resolvedCommand = resolveTemplate(configuredCommand, document, projectRoot)
  const resolvedCwd = resolveTemplate(
    configuration.get<string>('grammarProvider.cwd')?.trim() || '${projectRoot}',
    document,
    projectRoot
  )
  const timeoutMs = configuration.get<number>('grammarProvider.timeoutMs') ?? 30000

  logInfo(`Resolved project root: ${projectRoot}`)
  logInfo(`Running grammar provider command: ${resolvedCommand}`)
  logInfo(`Grammar provider cwd: ${resolvedCwd}`)
  await assertDirectoryExists(resolvedCwd)

  let stdout = ''
  let stderr = ''

  try {
    const result = await execAsync(resolvedCommand, {
      cwd: resolvedCwd,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    throw buildProviderError(error, resolvedCommand, resolvedCwd)
  }

  const grammars = await parseProviderOutput(stdout, resolvedCwd)
  if (grammars.length === 0) {
    const stderrMessage = stderr.trim()
    throw new Error(
      stderrMessage.length > 0
        ? `Grammar provider command returned no grammar paths.\n${stderrMessage}`
        : 'Grammar provider command returned no grammar paths.'
    )
  }

  logInfo(
    `Grammar provider returned ${grammars.length} grammar path(s): ${grammars
      .slice(0, 5)
      .map((grammar) => grammar.path)
      .join(', ')}${grammars.length > 5 ? ', ...' : ''}`
  )
  return grammars
}

async function parseProviderOutput(stdout: string, cwd: string): Promise<GrammarContribution[]> {
  const trimmedOutput = stdout.trim()
  if (trimmedOutput.length === 0) {
    return []
  }

  const parsedJson = tryParseJsonOutput(trimmedOutput)
  const entries =
    parsedJson === undefined ? trimmedOutput.split(/\r?\n/).filter((entry) => entry.trim().length > 0) : normalizeJsonOutput(parsedJson)

  return Promise.all(entries.map((entry) => normalizeEntry(entry, cwd)))
}

function tryParseJsonOutput(output: string): unknown | undefined {
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

function normalizeJsonOutput(payload: unknown): Array<string | ProviderGrammarEntry> {
  if (Array.isArray(payload)) {
    return payload
  }

  if (isObject(payload) && Array.isArray((payload as ProviderPayload).grammars)) {
    return (payload as ProviderPayload).grammars as Array<string | ProviderGrammarEntry>
  }

  throw new Error('Grammar provider JSON output must be an array or an object with a grammars array.')
}

async function normalizeEntry(entry: string | ProviderGrammarEntry, cwd: string): Promise<GrammarContribution> {
  if (typeof entry === 'string') {
    return buildGrammarContribution(entry, cwd)
  }

  if (!isObject(entry) || typeof entry.path !== 'string' || entry.path.trim().length === 0) {
    throw new Error('Each grammar provider entry must be a path string or an object with a path field.')
  }

  const normalizedPath = await resolveExistingPath(entry.path, cwd)
  return {
    path: normalizedPath,
    scopeName: typeof entry.scopeName === 'string' ? entry.scopeName : '',
    injectTo: Array.isArray(entry.injectTo)
      ? entry.injectTo.filter((value): value is string => typeof value === 'string')
      : undefined,
    language: typeof entry.language === 'string' ? entry.language : undefined
  }
}

async function buildGrammarContribution(grammarPath: string, cwd: string): Promise<GrammarContribution> {
  return {
    path: await resolveExistingPath(grammarPath, cwd),
    scopeName: ''
  }
}

async function resolveExistingPath(candidatePath: string, cwd: string): Promise<string> {
  const trimmedPath = candidatePath.trim()
  if (trimmedPath.length === 0) {
    throw new Error('Grammar provider returned an empty path.')
  }

  const resolvedPath = path.isAbsolute(trimmedPath) ? trimmedPath : path.resolve(cwd, trimmedPath)

  try {
    await fs.access(resolvedPath)
    return resolvedPath
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Grammar provider returned a path that does not exist: ${resolvedPath}`)
    }

    throw error
  }
}

async function assertDirectoryExists(directoryPath: string): Promise<void> {
  try {
    const stats = await fs.stat(directoryPath)
    if (!stats.isDirectory()) {
      throw new Error(`Grammar provider cwd is not a directory: ${directoryPath}`)
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Grammar provider cwd does not exist: ${directoryPath}`)
    }

    throw error
  }
}

function resolveTemplate(template: string, document: vscode.TextDocument, projectRoot: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
  const replacements: Record<string, string | undefined> = {
    '${projectRoot}': projectRoot,
    '${workspaceFolder}': workspaceFolder,
    '${file}': document.uri.fsPath,
    '${fileDirname}': path.dirname(document.uri.fsPath),
    '${fileBasename}': path.basename(document.uri.fsPath)
  }

  let resolvedTemplate = template
  for (const [token, value] of Object.entries(replacements)) {
    if (value) {
      resolvedTemplate = resolvedTemplate.split(token).join(value)
    }
  }

  return resolvedTemplate
}

function buildProviderError(error: unknown, command: string, cwd: string): Error {
  const commandDetails = `Grammar provider command failed.\nCommand: ${command}\nCwd: ${cwd}`

  if (isExecError(error)) {
    const stderr = error.stderr?.toString().trim()
    const stdout = error.stdout?.toString().trim()
    const details = stderr || stdout || error.message
    return new Error(`${commandDetails}\n${details}`)
  }

  return new Error(`${commandDetails}\n${error instanceof Error ? error.message : String(error)}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isExecError(
  error: unknown
): error is Error & { code?: number | string; stderr?: string | Buffer; stdout?: string | Buffer } {
  return typeof error === 'object' && error !== null && 'message' in error
}
