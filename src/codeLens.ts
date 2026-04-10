import { ScopeMode } from './render'
import { CommentSyntax, isCommentOnlyLine } from './languageCommentsCore'
import { SourceLine } from './syntaxTestCore'

export interface LineCodeLensSpec {
  commandId: string
  sourceDocumentLine: number
  title: string
}

export function collectLineCodeLensSpecs(
  sourceLines: readonly SourceLine[],
  commentSyntax?: CommentSyntax
): LineCodeLensSpec[] {
  const specs: LineCodeLensSpec[] = []
  let commentLineState = { inBlockComment: false }

  for (const sourceLine of sourceLines) {
    if (sourceLine.text.trim().length === 0) {
      continue
    }

    const commentOnlyLine = isCommentOnlyLine(sourceLine.text, commentSyntax, commentLineState)
    commentLineState = commentOnlyLine.state
    if (commentOnlyLine.isCommentOnly) {
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
        ? 'tmGrammarTestTools.insertAssertionsFull'
        : 'tmGrammarTestTools.insertAssertionsMinimal',
    sourceDocumentLine,
    title: scopeMode === 'full' ? 'Assertions: Full' : 'Minimal'
  }
}
