import * as path from 'node:path'
import { ProviderTemplateContext } from './providerTemplates'

export function resolveGrammarSourcePathTemplate(template: string, context: ProviderTemplateContext, label: string): string {
  return replaceTemplateTokens(template, context, label)
}

export function resolveGrammarSourcePath(template: string, context: ProviderTemplateContext, label: string): string {
  const resolvedTemplate = resolveGrammarSourcePathTemplate(template, context, label).trim()
  if (resolvedTemplate.length === 0) {
    throw new Error(`${label} resolved to an empty path.`)
  }

  if (path.isAbsolute(resolvedTemplate)) {
    return resolvedTemplate
  }

  const relativeBase = context.workspaceFolder ?? path.dirname(context.filePath)
  return path.resolve(relativeBase, resolvedTemplate)
}

function replaceTemplateTokens(template: string, context: ProviderTemplateContext, label: string): string {
  let resolvedTemplate = template
  const replacements: Record<string, string | undefined> = {
    '${file}': context.filePath,
    '${fileBasename}': path.basename(context.filePath),
    '${fileDirname}': path.dirname(context.filePath),
    '${projectRoot}': context.projectRoot,
    '${workspaceFolder}': context.workspaceFolder
  }

  for (const [token, value] of Object.entries(replacements)) {
    if (!resolvedTemplate.includes(token)) {
      continue
    }

    if (value === undefined) {
      throw new Error(`${label} references ${token}, but it is unavailable for the active document.`)
    }

    resolvedTemplate = resolvedTemplate.split(token).join(value)
  }

  return resolvedTemplate
}
