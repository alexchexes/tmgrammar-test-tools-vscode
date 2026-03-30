import { ScopeMode } from './render'
import { SourceLine } from './syntaxTestCore'

export interface LineCodeLensSpec {
  commandId: string
  sourceDocumentLine: number
  title: string
}

export function collectLineCodeLensSpecs(sourceLines: readonly SourceLine[]): LineCodeLensSpec[] {
  const specs: LineCodeLensSpec[] = []

  for (const sourceLine of sourceLines) {
    if (sourceLine.text.trim().length === 0) {
      continue
    }

    specs.push(createCodeLensSpec(sourceLine.documentLine, 'full'))
    specs.push(createCodeLensSpec(sourceLine.documentLine, 'minimal'))
  }

  return specs
}

function createCodeLensSpec(sourceDocumentLine: number, scopeMode: ScopeMode): LineCodeLensSpec {
  return {
    commandId:
      scopeMode === 'full'
        ? 'tmGrammarTestTools.insertLineAssertionsFull'
        : 'tmGrammarTestTools.insertLineAssertionsMinimal',
    sourceDocumentLine,
    title: `Line Assertions (${scopeMode === 'full' ? 'Full' : 'Minimal'})`
  }
}
