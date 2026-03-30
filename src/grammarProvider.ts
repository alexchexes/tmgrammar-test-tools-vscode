import * as vscode from 'vscode'
import { resolveProjectRoot } from './grammarConfig'
import { GrammarContribution } from './grammarTypes'
import { formatDuration, logInfo, startStopwatch } from './log'
import { normalizeConfiguredProviderScopes, shouldRunProviderForScope } from './providerScopeFilter'
import { ProviderTemplateContext, resolveCommandTemplate, resolveProviderCwdTemplate } from './providerTemplates'
import { runGrammarProvider } from './providerRunner'

export async function loadProviderGrammarContributions(
  document: vscode.TextDocument,
  targetScopeName: string
): Promise<GrammarContribution[]> {
  const stopwatch = startStopwatch()
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const configuredCommand = configuration.get<string>('grammarProvider.command')?.trim()

  if (!configuredCommand) {
    logInfo('No grammar provider command configured for the active document.')
    return []
  }

  const configuredScopes = normalizeConfiguredProviderScopes(configuration.get<readonly string[]>('grammarProvider.scopes'))
  if (!shouldRunProviderForScope(targetScopeName, configuredScopes)) {
    logInfo(
      `Skipping grammar provider for scope ${targetScopeName} because grammarProvider.scopes is limited to: ${(configuredScopes ?? []).join(', ')}`
    )
    return []
  }

  const projectRoot = await resolveProjectRoot(document)
  const configuredCwd = configuration.get<string>('grammarProvider.cwd')?.trim()
  const timeoutMs = configuration.get<number>('grammarProvider.timeoutMs') ?? 30000
  const context = toProviderTemplateContext(document, projectRoot)

  logInfo(`Resolved project root: ${projectRoot}`)
  logInfo(`Running grammar provider command: ${resolveCommandTemplate(configuredCommand, context)}`)
  logInfo(`Grammar provider cwd: ${resolveProviderCwdTemplate(context, configuredCwd)}`)

  const grammars = await runGrammarProvider(context, {
    command: configuredCommand,
    cwd: configuredCwd,
    timeoutMs
  })

  logInfo(
    `Grammar provider returned ${grammars.length} grammar path(s): ${grammars
      .slice(0, 5)
      .map((grammar) => grammar.path)
      .join(', ')}${grammars.length > 5 ? ', ...' : ''}`
  )
  logInfo(`Grammar provider completed in ${formatDuration(stopwatch())}.`)

  return grammars
}

function toProviderTemplateContext(document: vscode.TextDocument, projectRoot: string): ProviderTemplateContext {
  return {
    filePath: document.uri.fsPath,
    projectRoot,
    workspaceFolder: vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
  }
}
