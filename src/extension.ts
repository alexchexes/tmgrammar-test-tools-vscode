import * as vscode from 'vscode'
import { GrammarContribution, loadGrammarContributions, tryResolveConfigPath } from './grammarConfig'
import { loadProviderGrammarContributions } from './grammarProvider'
import { loadInstalledGrammarContributions } from './installedGrammars'
import { logError, logInfo, registerLogger } from './log'
import { renderAssertionBlock, ScopeMode } from './render'
import {
  clipTokensToRanges,
  collectSelectionRangeTargets,
  coversWholeLine,
  resolveSelectionRanges,
  SelectionInput
} from './selectionTargets'
import { resolveScopeMode } from './scopeMode'
import {
  collectSourceLines,
  findAssertionBlock,
  findTargetSourceLinesForSelections,
  parseHeaderLine,
  SelectionLineTarget,
  SourceLine
} from './syntaxTest'
import { tokenizeSourceLine } from './textmate'

export function activate(context: vscode.ExtensionContext): void {
  registerLogger(context)
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertions', 'line'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertionsFull', 'line', 'full'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertLineAssertionsMinimal', 'line', 'minimal'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertRangeAssertions', 'range'))
  context.subscriptions.push(registerInsertCommand('tmGrammarTestTools.insertRangeAssertionsFull', 'range', 'full'))
  context.subscriptions.push(
    registerInsertCommand('tmGrammarTestTools.insertRangeAssertionsMinimal', 'range', 'minimal')
  )
}

export function deactivate(): void {}

function registerInsertCommand(
  commandId: string,
  targetMode: 'line' | 'range',
  scopeModeOverride?: ScopeMode
): vscode.Disposable {
  return vscode.commands.registerTextEditorCommand(commandId, async (editor) => {
    try {
      if (targetMode === 'range') {
        await insertRangeAssertions(editor, scopeModeOverride)
        return
      }

      await insertLineAssertions(editor, scopeModeOverride)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logError(message)
      void vscode.window.showErrorMessage(message)
    }
  })
}

async function insertLineAssertions(editor: vscode.TextEditor, scopeModeOverride?: ScopeMode): Promise<void> {
  const context = await loadInsertContext(editor, scopeModeOverride, 'line')
  const targetSourceLines = findTargetSourceLinesForSelections(
    context.sourceLines,
    editor.selections.map(toSelectionLineTarget)
  )
  logInfo(
    `Target source lines: ${targetSourceLines.length > 0 ? targetSourceLines.map((line) => line.documentLine + 1).join(', ') : '<none>'}`
  )

  if (targetSourceLines.length === 0) {
    throw new Error('Place the cursor on a source line or its assertion block, or select source lines to update.')
  }

  const sourceLineIndexes = new Map(context.sourceLines.map((line, index) => [line.documentLine, index]))
  const updates: AssertionUpdate[] = []

  for (const targetSourceLine of targetSourceLines) {
    const targetSourceIndex = sourceLineIndexes.get(targetSourceLine.documentLine)
    if (targetSourceIndex === undefined) {
      continue
    }

    const tokens = await tokenizeSourceLine(
      context.grammars,
      context.header.scopeName,
      context.sourceLines,
      targetSourceIndex
    )
    const assertionLines = renderAssertionBlock(context.header.commentToken, targetSourceLine.text, tokens, {
      compactRanges: context.compactRanges,
      headerScope: context.header.scopeName,
      scopeMode: context.scopeMode
    })
    const assertionBlock = findAssertionBlock(context.document, targetSourceLine.documentLine, context.header.commentToken)
    const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine

    if (assertionLines.length === 0 && !hasExistingBlock) {
      continue
    }

    updates.push({
      assertionBlock,
      assertionLines,
      targetSourceLine
    })
  }

  if (updates.length === 0) {
    void vscode.window.showInformationMessage('No assertions were generated for the targeted source lines.')
    return
  }

  const editApplied = await editor.edit((editBuilder) => {
    for (const update of updates) {
      applyAssertionEdit(
        context.document,
        editBuilder,
        update.targetSourceLine.documentLine,
        update.assertionBlock,
        update.assertionLines
      )
    }
  })

  if (!editApplied) {
    throw new Error('The editor rejected the assertion update.')
  }

  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'}.`,
    3000
  )
}

async function insertRangeAssertions(editor: vscode.TextEditor, scopeModeOverride?: ScopeMode): Promise<void> {
  const context = await loadInsertContext(editor, scopeModeOverride, 'range')
  const selectionTargets = collectSelectionRangeTargets(context.sourceLines, editor.selections.map(toSelectionInput))
  logInfo(
    `Range target source lines: ${selectionTargets.length > 0 ? selectionTargets.map((target) => target.sourceLine.documentLine + 1).join(', ') : '<none>'}`
  )

  if (selectionTargets.length === 0) {
    throw new Error('Place the cursor on source text, or select source text to update.')
  }

  const sourceLineIndexes = new Map(context.sourceLines.map((line, index) => [line.documentLine, index]))
  const blockedLines: number[] = []
  const updates: AssertionUpdate[] = []

  for (const selectionTarget of selectionTargets) {
    const targetSourceIndex = sourceLineIndexes.get(selectionTarget.sourceLine.documentLine)
    if (targetSourceIndex === undefined) {
      continue
    }

    const tokens = await tokenizeSourceLine(
      context.grammars,
      context.header.scopeName,
      context.sourceLines,
      targetSourceIndex
    )
    const ranges = resolveSelectionRanges(tokens, selectionTarget.sourceLine.text, selectionTarget)
    if (ranges.length === 0) {
      continue
    }

    const assertionBlock = findAssertionBlock(
      context.document,
      selectionTarget.sourceLine.documentLine,
      context.header.commentToken
    )
    const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
    const isWholeLineTarget = coversWholeLine(ranges, selectionTarget.sourceLine.text.length)

    if (hasExistingBlock && !isWholeLineTarget) {
      blockedLines.push(selectionTarget.sourceLine.documentLine + 1)
      continue
    }

    const clippedTokens = clipTokensToRanges(tokens, ranges)
    const assertionLines = renderAssertionBlock(context.header.commentToken, selectionTarget.sourceLine.text, clippedTokens, {
      compactRanges: context.compactRanges,
      headerScope: context.header.scopeName,
      scopeMode: context.scopeMode
    })

    if (assertionLines.length === 0 && !hasExistingBlock) {
      continue
    }

    updates.push({
      assertionBlock,
      assertionLines,
      targetSourceLine: selectionTarget.sourceLine
    })
  }

  if (blockedLines.length > 0) {
    throw new Error(
      `Partial selection updates are not supported when a line already has assertions. Blocked line${blockedLines.length === 1 ? '' : 's'}: ${blockedLines.join(', ')}.`
    )
  }

  if (updates.length === 0) {
    void vscode.window.showInformationMessage('No assertions were generated for the targeted selection ranges.')
    return
  }

  const editApplied = await editor.edit((editBuilder) => {
    for (const update of updates) {
      applyAssertionEdit(
        context.document,
        editBuilder,
        update.targetSourceLine.documentLine,
        update.assertionBlock,
        update.assertionLines
      )
    }
  })

  if (!editApplied) {
    throw new Error('The editor rejected the assertion update.')
  }

  vscode.window.setStatusBarMessage(
    `Updated assertions for ${updates.length} source line${updates.length === 1 ? '' : 's'} from the current range.`,
    3000
  )
}

async function loadOptionalLocalGrammarContributions(document: vscode.TextDocument) {
  const configPath = await tryResolveConfigPath(document)
  if (!configPath) {
    logInfo('No local package.json grammar config found for the active document.')
    return []
  }

  logInfo(`Using local grammar config: ${configPath}`)
  return loadGrammarContributions(configPath)
}

async function loadInsertContext(
  editor: vscode.TextEditor,
  scopeModeOverride: ScopeMode | undefined,
  targetMode: 'line' | 'range'
): Promise<InsertContext> {
  const document = editor.document
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
  const configuration = vscode.workspace.getConfiguration('tmGrammarTestTools', document.uri)
  const compactRanges = configuration.get<boolean>('compactRanges') ?? true
  const scopeMode = resolveScopeMode(configuration.get<string>('scopeMode'), scopeModeOverride)
  logInfo(`Insert assertions requested for ${document.uri.fsPath}`)
  logInfo(`Workspace folder: ${workspaceFolder?.uri.fsPath ?? '<none>'}`)
  logInfo(`Target mode: ${targetMode}`)
  logInfo(`Render options: scopeMode=${scopeMode}, compactRanges=${compactRanges}`)

  if (document.lineCount === 0) {
    throw new Error('Expected a syntax test file with a header line.')
  }

  const header = parseHeaderLine(document.lineAt(0).text)
  logInfo(`Parsed syntax test header with scope ${header.scopeName}`)
  const sourceLines = collectSourceLines(document, header.commentToken)

  if (sourceLines.length === 0) {
    throw new Error('No source lines were found under the syntax test header.')
  }

  const localGrammars = await loadOptionalLocalGrammarContributions(document)
  const providerGrammars = await loadProviderGrammarContributions(document)
  const installedGrammars = loadInstalledGrammarContributions()
  const grammars = [...installedGrammars, ...localGrammars, ...providerGrammars]
  logInfo(
    `Grammar sources: installed=${installedGrammars.length}, local=${localGrammars.length}, provider=${providerGrammars.length}`
  )

  return {
    compactRanges,
    document,
    grammars,
    header,
    scopeMode,
    sourceLines
  }
}

function toSelectionLineTarget(selection: vscode.Selection): SelectionLineTarget {
  return {
    activeLine: selection.active.line,
    endCharacter: selection.end.character,
    endLine: selection.end.line,
    isEmpty: selection.isEmpty,
    startLine: selection.start.line
  }
}

function toSelectionInput(selection: vscode.Selection): SelectionInput {
  return {
    activeCharacter: selection.active.character,
    activeLine: selection.active.line,
    endCharacter: selection.end.character,
    endLine: selection.end.line,
    isEmpty: selection.isEmpty,
    startCharacter: selection.start.character,
    startLine: selection.start.line
  }
}

function applyAssertionEdit(
  document: vscode.TextDocument,
  editBuilder: vscode.TextEditorEdit,
  sourceLine: number,
  assertionBlock: { startLine: number; endLineExclusive: number },
  assertionLines: readonly string[]
): void {
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
  const hasExistingBlock = assertionBlock.endLineExclusive > assertionBlock.startLine
  const renderedBlock = assertionLines.join(eol)

  if (hasExistingBlock) {
    const replacement = renderedBlock.length === 0 ? '' : appendTrailingEol(renderedBlock, eol, assertionBlock.endLineExclusive, document)
    editBuilder.replace(getLineBlockRange(document, assertionBlock.startLine, assertionBlock.endLineExclusive), replacement)
    return
  }

  if (renderedBlock.length === 0) {
    return
  }

  const insertionLine = sourceLine + 1
  if (insertionLine < document.lineCount) {
    editBuilder.insert(new vscode.Position(insertionLine, 0), renderedBlock + eol)
    return
  }

  editBuilder.insert(document.lineAt(sourceLine).range.end, eol + renderedBlock)
}

function appendTrailingEol(
  renderedBlock: string,
  eol: string,
  endLineExclusive: number,
  document: vscode.TextDocument
): string {
  return endLineExclusive < document.lineCount ? renderedBlock + eol : renderedBlock
}

function getLineBlockRange(document: vscode.TextDocument, startLine: number, endLineExclusive: number): vscode.Range {
  const start = new vscode.Position(startLine, 0)

  if (endLineExclusive < document.lineCount) {
    return new vscode.Range(start, new vscode.Position(endLineExclusive, 0))
  }

  return new vscode.Range(start, document.lineAt(document.lineCount - 1).range.end)
}

interface AssertionUpdate {
  assertionBlock: { startLine: number; endLineExclusive: number }
  assertionLines: readonly string[]
  targetSourceLine: SourceLine
}

interface InsertContext {
  compactRanges: boolean
  document: vscode.TextDocument
  grammars: readonly GrammarContribution[]
  header: ReturnType<typeof parseHeaderLine>
  scopeMode: ScopeMode
  sourceLines: readonly SourceLine[]
}
