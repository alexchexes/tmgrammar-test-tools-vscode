import * as vscode from 'vscode'
import { CommentSyntax, parseCommentSyntaxFromLanguageConfigurationText } from './languageCommentsCore'

interface ExtensionPackageJsonShape {
  contributes?: {
    languages?: Array<{
      configuration?: unknown
      id?: unknown
    }>
  }
}

const languageCommentSyntaxCache = new Map<string, Promise<CommentSyntax | undefined>>()

export function getLanguageCommentSyntax(languageId: string): Promise<CommentSyntax | undefined> {
  const cached = languageCommentSyntaxCache.get(languageId)
  if (cached) {
    return cached
  }

  const loadPromise = loadLanguageCommentSyntax(languageId)
  languageCommentSyntaxCache.set(languageId, loadPromise)
  return loadPromise
}

async function loadLanguageCommentSyntax(languageId: string): Promise<CommentSyntax | undefined> {
  const configurationUri = findLanguageConfigurationUri(languageId)
  if (!configurationUri) {
    return undefined
  }

  let text: string
  try {
    const bytes = await vscode.workspace.fs.readFile(configurationUri)
    text = Buffer.from(bytes).toString('utf8')
  } catch {
    return undefined
  }

  return parseCommentSyntaxFromLanguageConfigurationText(text)
}

function findLanguageConfigurationUri(languageId: string): vscode.Uri | undefined {
  let configurationUri: vscode.Uri | undefined

  for (const extension of vscode.extensions.all) {
    const packageJson = extension.packageJSON as ExtensionPackageJsonShape
    const languages = packageJson.contributes?.languages ?? []

    for (const language of languages) {
      if (language.id !== languageId || typeof language.configuration !== 'string' || language.configuration.length === 0) {
        continue
      }

      configurationUri = vscode.Uri.joinPath(extension.extensionUri, language.configuration)
    }
  }

  return configurationUri
}
