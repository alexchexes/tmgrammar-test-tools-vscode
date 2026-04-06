import { readFileSync } from 'node:fs'
import * as path from 'node:path'

export function resolveLocalVscodeTmgrammarTestPackageJsonPath(searchDirectory: string): string | undefined {
  try {
    return require.resolve('vscode-tmgrammar-test/package.json', {
      paths: [searchDirectory]
    })
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      return undefined
    }

    throw error
  }
}

export function findDeclaredVscodeTmgrammarTestDependencyPackageJsonPath(
  searchDirectory: string
): string | undefined {
  let currentDirectory = path.resolve(searchDirectory)
  const fileSystemRoot = path.parse(currentDirectory).root

  while (true) {
    const packageJsonPath = path.join(currentDirectory, 'package.json')
    if (packageJsonDeclaresVscodeTmgrammarTest(packageJsonPath)) {
      return packageJsonPath
    }

    if (currentDirectory === fileSystemRoot) {
      return undefined
    }

    currentDirectory = path.dirname(currentDirectory)
  }
}

function isModuleNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'MODULE_NOT_FOUND'
}

function packageJsonDeclaresVscodeTmgrammarTest(packageJsonPath: string): boolean {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }

    return (
      packageJson.dependencies?.['vscode-tmgrammar-test'] !== undefined ||
      packageJson.devDependencies?.['vscode-tmgrammar-test'] !== undefined ||
      packageJson.optionalDependencies?.['vscode-tmgrammar-test'] !== undefined
    )
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    return false
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
