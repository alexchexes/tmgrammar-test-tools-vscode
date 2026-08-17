import { promises as fs } from 'node:fs'
import * as vscode from 'vscode'
import { resolveProjectRoot } from './grammarConfig'
import { findGrammarConfigPathForFile, loadGrammarContributionsFromConfig } from './grammarPackage'
import { loadProviderGrammarContributionsForRule } from './grammarProvider'
import { resolveGrammarSourcePath } from './grammarSourceRulePaths'
import { resolveMatchingGrammarSourceRules } from './grammarSourceRules'
import { NormalizedGrammarSourceRule } from './grammarSourceRulesCore'
import { SourcedGrammarContribution } from './grammarSources'
import { GrammarContribution } from './grammarTypes'
import { formatDuration, logInfo, startStopwatch } from './log'
import { ProviderTemplateContext } from './providerTemplates'
import { getEffectiveWorkspaceFolder } from './settings'

export interface DocumentGrammarSourceLoadCaches {
  configLoads?: Map<string, Promise<GrammarContribution[]>>
  explicitGrammarLoads?: Map<string, Promise<GrammarContribution[]>>
  providerLoads?: Map<string, Promise<GrammarContribution[]>>
}

export interface LoadedDocumentGrammarSources {
  configGrammars: readonly GrammarContribution[]
  explicitGrammars: readonly GrammarContribution[]
  providerGrammars: readonly GrammarContribution[]
  sourcedEntries: readonly SourcedGrammarContribution[]
}

export async function loadDocumentGrammarSources(
  document: vscode.TextDocument,
  targetScopeName: string,
  caches?: DocumentGrammarSourceLoadCaches
): Promise<LoadedDocumentGrammarSources> {
  const matchedRules = resolveMatchingGrammarSourceRules(document, targetScopeName)
  const projectRoot = await resolveProjectRoot(document)
  const templateContext = toProviderTemplateContext(document, projectRoot)
  const sourcedEntries: SourcedGrammarContribution[] = []
  const configGrammars: GrammarContribution[] = []
  const explicitGrammars: GrammarContribution[] = []
  const providerGrammars: GrammarContribution[] = []

  const configRules = matchedRules.filter((rule) => rule.kind === 'configPath')
  if (configRules.length === 0) {
    const discoveredConfigGrammars = await loadDiscoveredConfigGrammars(document, caches?.configLoads)
    configGrammars.push(...discoveredConfigGrammars)
    sourcedEntries.push(...discoveredConfigGrammars.map((grammar) => ({ grammar, source: 'config' as const })))
  }

  for (const rule of matchedRules) {
    if (rule.kind === 'configPath') {
      const ruleGrammars = await loadConfigRuleGrammars(rule, templateContext, caches?.configLoads)
      configGrammars.push(...ruleGrammars)
      sourcedEntries.push(...ruleGrammars.map((grammar) => ({ grammar, source: 'config' as const })))
      continue
    }

    if (rule.kind === 'grammars') {
      const ruleGrammars = await loadExplicitGrammarRuleGrammars(rule, templateContext, caches?.explicitGrammarLoads)
      explicitGrammars.push(...ruleGrammars)
      sourcedEntries.push(...ruleGrammars.map((grammar) => ({ grammar, source: 'explicit' as const })))
      continue
    }

    const ruleGrammars = await loadProviderRuleGrammars(
      document,
      targetScopeName,
      rule,
      templateContext,
      caches?.providerLoads
    )
    providerGrammars.push(...ruleGrammars)
    sourcedEntries.push(...ruleGrammars.map((grammar) => ({ grammar, source: 'provider' as const })))
  }

  return {
    configGrammars,
    explicitGrammars,
    providerGrammars,
    sourcedEntries
  }
}

async function loadDiscoveredConfigGrammars(
  document: vscode.TextDocument,
  cache?: Map<string, Promise<GrammarContribution[]>>
): Promise<readonly GrammarContribution[]> {
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  const discoveredConfigPath = await findGrammarConfigPathForFile(document.uri.fsPath, {
    searchRoot: workspaceFolder?.uri.fsPath
  })

  if (!discoveredConfigPath) {
    logInfo('No local package.json grammar config found for the active document.')
    return []
  }

  const stopwatch = startStopwatch()
  logInfo(`Using discovered local grammar config: ${discoveredConfigPath}`)
  const cachedLoad = cache?.get(discoveredConfigPath) ?? loadGrammarContributionsFromConfig(discoveredConfigPath)
  cache?.set(discoveredConfigPath, cachedLoad)
  const grammars = await cachedLoad
  logInfo(`Loaded discovered local grammar config in ${formatDuration(stopwatch())}.`)
  return grammars
}

async function loadConfigRuleGrammars(
  rule: NormalizedGrammarSourceRule,
  templateContext: ProviderTemplateContext,
  cache?: Map<string, Promise<GrammarContribution[]>>
): Promise<readonly GrammarContribution[]> {
  const stopwatch = startStopwatch()
  const configPath = resolveGrammarSourcePath(rule.configPath!, templateContext, 'Grammar source configPath')
  logInfo(`Using grammar source config path: ${configPath}`)
  const cachedLoad = cache?.get(configPath) ?? loadGrammarContributionsFromConfig(configPath)
  cache?.set(configPath, cachedLoad)
  const grammars = await cachedLoad
  logInfo(`Loaded grammar source config path in ${formatDuration(stopwatch())}.`)
  return grammars
}

async function loadExplicitGrammarRuleGrammars(
  rule: NormalizedGrammarSourceRule,
  templateContext: ProviderTemplateContext,
  cache?: Map<string, Promise<GrammarContribution[]>>
): Promise<readonly GrammarContribution[]> {
  const stopwatch = startStopwatch()
  const grammarPaths = rule.grammars!.map((grammarPath) =>
    resolveGrammarSourcePath(grammarPath, templateContext, 'Grammar source grammars')
  )
  logInfo(`Using explicit grammar path(s): ${grammarPaths.join(', ')}`)

  const grammars = (
    await Promise.all(
      grammarPaths.map((grammarPath) => {
        const cachedLoad = cache?.get(grammarPath) ?? buildExplicitGrammarContribution(grammarPath)
        cache?.set(grammarPath, cachedLoad)
        return cachedLoad
      })
    )
  ).flat()

  logInfo(`Loaded explicit grammar path(s) in ${formatDuration(stopwatch())}.`)
  return grammars
}

async function buildExplicitGrammarContribution(grammarPath: string): Promise<GrammarContribution[]> {
  await fs.access(grammarPath)
  return [
    {
      path: grammarPath,
      scopeName: ''
    }
  ]
}

async function loadProviderRuleGrammars(
  document: vscode.TextDocument,
  targetScopeName: string,
  rule: NormalizedGrammarSourceRule,
  templateContext: ProviderTemplateContext,
  cache?: Map<string, Promise<GrammarContribution[]>>
): Promise<readonly GrammarContribution[]> {
  return loadProviderGrammarContributionsForRule(document, targetScopeName, rule.provider!, templateContext, cache)
}

function toProviderTemplateContext(document: vscode.TextDocument, projectRoot: string): ProviderTemplateContext {
  return {
    filePath: document.uri.fsPath,
    projectRoot,
    workspaceFolder: getEffectiveWorkspaceFolder(document)?.uri.fsPath
  }
}
