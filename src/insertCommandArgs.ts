import { MinimalHeaderScopeFactoring } from './minimalHeaderScopeFactoring'

export interface ParsedInsertCommandArgs {
  minimalHeaderScopeFactoring?: MinimalHeaderScopeFactoring | string
  minimalTailScopeCount?: number
  requestedFromCodeLens?: boolean
  targetSourceDocumentLine?: number
}

export function parseInsertCommandArgs(value: unknown): ParsedInsertCommandArgs {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const result: ParsedInsertCommandArgs = {}

  if ('targetSourceDocumentLine' in value && typeof value.targetSourceDocumentLine === 'number') {
    result.targetSourceDocumentLine = value.targetSourceDocumentLine
  }

  if ('minimalTailScopeCount' in value && typeof value.minimalTailScopeCount === 'number') {
    result.minimalTailScopeCount = value.minimalTailScopeCount
  }

  if ('minimalHeaderScopeFactoring' in value && typeof value.minimalHeaderScopeFactoring === 'string') {
    result.minimalHeaderScopeFactoring = value.minimalHeaderScopeFactoring
  }

  if ('requestedFromCodeLens' in value && value.requestedFromCodeLens === true) {
    result.requestedFromCodeLens = true
  }

  return result
}
