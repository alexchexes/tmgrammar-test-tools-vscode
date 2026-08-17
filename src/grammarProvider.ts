import * as vscode from 'vscode'
import { GrammarContribution } from './grammarTypes'
import { formatDuration, logInfo, startStopwatch } from './log'
import { buildProviderLoadCacheKey, ProviderTemplateContext, resolveCommandTemplate, resolveProviderCwdTemplate } from './providerTemplates'
import { runGrammarProvider } from './providerRunner'

export interface ConfiguredGrammarProviderRule {
  command: string
  cwd?: string
  timeoutMs: number
}

export async function loadProviderGrammarContributionsForRule(
  _document: vscode.TextDocument,
  targetScopeName: string,
  providerRule: ConfiguredGrammarProviderRule,
  context: ProviderTemplateContext,
  cache?: Map<string, Promise<GrammarContribution[]>>
): Promise<GrammarContribution[]> {
  void _document
  const stopwatch = startStopwatch()
  const resolvedCommand = resolveCommandTemplate(providerRule.command, context)
  const resolvedCwd = resolveProviderCwdTemplate(context, providerRule.cwd)
  const cacheKey = buildProviderLoadCacheKey(resolvedCommand, resolvedCwd, targetScopeName, providerRule.timeoutMs)

  logInfo(`Resolved project root: ${context.projectRoot}`)
  logInfo(`Running grammar provider command: ${resolvedCommand}`)
  logInfo(`Grammar provider cwd: ${resolvedCwd}`)

  const loadPromise =
    cache?.get(cacheKey) ??
    runGrammarProvider(context, {
      command: providerRule.command,
      cwd: providerRule.cwd,
      timeoutMs: providerRule.timeoutMs
    })

  cache?.set(cacheKey, loadPromise)

  const grammars = await loadPromise

  logInfo(
    `Grammar provider returned ${grammars.length} grammar path(s): ${grammars
      .slice(0, 5)
      .map((grammar) => grammar.path)
      .join(', ')}${grammars.length > 5 ? ', ...' : ''}`
  )
  logInfo(`Grammar provider completed in ${formatDuration(stopwatch())}.`)

  return grammars
}
