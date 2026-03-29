import * as path from 'path'

export interface ProviderTemplateContext {
  filePath: string
  projectRoot: string
  workspaceFolder?: string
}

export function resolveCommandTemplate(template: string, context: ProviderTemplateContext): string {
  return replaceTemplateTokens(template, context, {
    '${file}': (value) => value.filePath,
    '${fileBasename}': (value) => path.basename(value.filePath),
    '${fileDirname}': (value) => path.dirname(value.filePath),
    '${projectRoot}': (value) => value.projectRoot,
    '${workspaceFolder}': (value) => value.workspaceFolder
  }, 'Grammar provider command')
}

export function resolveProviderCwdTemplate(
  context: ProviderTemplateContext,
  configuredCwd?: string
): string {
  const trimmedCwd = configuredCwd?.trim()
  if (!trimmedCwd) {
    return context.workspaceFolder ?? context.projectRoot
  }

  return replaceTemplateTokens(trimmedCwd, context, {
    '${fileDirname}': (value) => path.dirname(value.filePath),
    '${projectRoot}': (value) => value.projectRoot,
    '${workspaceFolder}': (value) => value.workspaceFolder
  }, 'Grammar provider cwd')
}

function replaceTemplateTokens(
  template: string,
  context: ProviderTemplateContext,
  replacements: Record<string, (context: ProviderTemplateContext) => string | undefined>,
  label: string
): string {
  let resolvedTemplate = template
  for (const [token, resolveValue] of Object.entries(replacements)) {
    if (!resolvedTemplate.includes(token)) {
      continue
    }

    const value = resolveValue(context)
    if (value === undefined) {
      throw new Error(`${label} references ${token}, but it is unavailable for the active document.`)
    }

    resolvedTemplate = resolvedTemplate.split(token).join(value)
  }

  return resolvedTemplate
}
