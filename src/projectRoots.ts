import { promises as fs } from 'fs'
import * as path from 'path'

export async function resolveProjectRootForFile(filePath: string): Promise<string> {
  if (!path.isAbsolute(filePath)) {
    throw new Error('Expected a saved file path or workspace folder to resolve the project root.')
  }

  let currentDirectory = path.dirname(filePath)
  const fileSystemRoot = path.parse(currentDirectory).root

  while (true) {
    if ((await pathExists(path.join(currentDirectory, 'package.json'))) || (await pathExists(path.join(currentDirectory, '.git')))) {
      return currentDirectory
    }

    if (currentDirectory === fileSystemRoot) {
      return path.dirname(filePath)
    }

    currentDirectory = path.dirname(currentDirectory)
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
