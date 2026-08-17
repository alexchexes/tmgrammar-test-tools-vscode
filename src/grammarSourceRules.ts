import * as path from 'node:path'
import * as vscode from 'vscode'
import {
  GrammarSourceRuleMatchContext,
  matchesGrammarSourceRule,
  NormalizedGrammarSourceRule,
  normalizeGrammarSourceRules
} from './grammarSourceRulesCore'
import { logWarn } from './log'
import { getEffectiveTmGrammarConfiguration, getEffectiveWorkspaceFolder } from './settings'

export function resolveMatchingGrammarSourceRules(
  document: vscode.TextDocument,
  targetScopeName?: string
): readonly NormalizedGrammarSourceRule[] {
  const configuration = getEffectiveTmGrammarConfiguration(document)
  const normalizedRules = normalizeGrammarSourceRules(configuration.get<unknown>('grammarSources'))
  normalizedRules.warnings.forEach((warning) => logWarn(warning))

  const context = toGrammarSourceRuleMatchContext(document)
  return normalizedRules.rules.filter((rule) => matchesGrammarSourceRule(rule, context, targetScopeName))
}

function toGrammarSourceRuleMatchContext(document: vscode.TextDocument): GrammarSourceRuleMatchContext {
  const workspaceFolder = getEffectiveWorkspaceFolder(document)
  const absoluteFilePath = document.uri.scheme === 'file' ? normalizeGlobCandidatePath(document.uri.fsPath) : undefined
  const workspaceRelativeFilePath =
    document.uri.scheme === 'file' && workspaceFolder
      ? normalizeGlobCandidatePath(path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath))
      : undefined

  return {
    absoluteFilePath,
    languageId: document.languageId,
    workspaceRelativeFilePath
  }
}

function normalizeGlobCandidatePath(value: string): string {
  return value.replace(/\\/g, '/')
}
