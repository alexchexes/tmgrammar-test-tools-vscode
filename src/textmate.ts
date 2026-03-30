import { promises as fs } from 'fs'
import * as oniguruma from 'vscode-oniguruma'
import * as tm from 'vscode-textmate'
import { GrammarContribution } from './grammarTypes'
import { SourcedGrammarContribution } from './grammarSources'
import { SourceLine } from './syntaxTestCore'

let onigLibPromise: Promise<tm.IOnigLib> | undefined

export interface TokenizationTraceGrammarEntry {
  injectTo?: readonly string[]
  language?: string
  path: string
  scopeName: string
  source?: 'installed' | 'local' | 'provider'
}

export interface TokenizationLoadedScopeTrace {
  overridden: readonly TokenizationTraceGrammarEntry[]
  scopeName: string
  winner: TokenizationTraceGrammarEntry
}

export interface TokenizationTrace {
  loadedScopes: readonly TokenizationLoadedScopeTrace[]
  requestedScopeName: string
}

export async function tokenizeSourceLine(
  grammars: readonly GrammarContribution[],
  scopeName: string,
  sourceLines: readonly SourceLine[],
  targetSourceIndex: number
): Promise<readonly tm.IToken[]> {
  if (targetSourceIndex < 0 || targetSourceIndex >= sourceLines.length) {
    throw new Error('Could not resolve the active source line inside the syntax test.')
  }

  const registry = await createRegistry(grammars)
  const grammar = await registry.loadGrammar(scopeName)

  if (!grammar) {
    throw new Error(`Could not load grammar scope ${scopeName}.`)
  }

  let ruleStack: tm.StackElement | null = null

  for (let index = 0; index <= targetSourceIndex; index++) {
    const line = sourceLines[index]
    const tokenizedLine = grammar.tokenizeLine(line.text, ruleStack)
    ruleStack = tokenizedLine.ruleStack

    if (index === targetSourceIndex) {
      return tokenizedLine.tokens
    }
  }

  throw new Error('Tokenization ended before the target source line was reached.')
}

export async function tokenizeSourceLineWithTrace(
  grammars: readonly GrammarContribution[],
  scopeName: string,
  sourceLines: readonly SourceLine[],
  targetSourceIndex: number,
  sourcedGrammars?: readonly SourcedGrammarContribution[]
): Promise<{ tokens: readonly tm.IToken[]; trace: TokenizationTrace }> {
  if (targetSourceIndex < 0 || targetSourceIndex >= sourceLines.length) {
    throw new Error('Could not resolve the active source line inside the syntax test.')
  }

  const { registry, traceRecorder } = await createRegistryWithTrace(grammars, sourcedGrammars)
  const grammar = await registry.loadGrammar(scopeName)

  if (!grammar) {
    throw new Error(`Could not load grammar scope ${scopeName}.`)
  }

  let ruleStack: tm.StackElement | null = null

  for (let index = 0; index <= targetSourceIndex; index++) {
    const line = sourceLines[index]
    const tokenizedLine = grammar.tokenizeLine(line.text, ruleStack)
    ruleStack = tokenizedLine.ruleStack

    if (index === targetSourceIndex) {
      return {
        tokens: tokenizedLine.tokens,
        trace: traceRecorder.build(scopeName)
      }
    }
  }

  throw new Error('Tokenization ended before the target source line was reached.')
}

export async function resolveGrammarContributionScopes(
  grammars: readonly GrammarContribution[]
): Promise<readonly GrammarContribution[]> {
  const resolved = await resolveGrammarScopes(grammars)
  return resolved.map(({ source: _source, ...grammar }) => grammar)
}

export function formatTokenizationTraceLines(
  trace: TokenizationTrace,
  sourceDocumentLine?: number
): readonly string[] {
  const scopeChain = getScopeChain(trace.requestedScopeName)
  const broaderScopes = new Set(scopeChain.slice(0, -1))
  const baseScope = trace.loadedScopes.find((scope) => scope.scopeName === trace.requestedScopeName)
  const directInjections = trace.loadedScopes
    .filter(
      (scope) =>
        scope.scopeName !== trace.requestedScopeName &&
        (scope.winner.injectTo ?? []).some((injectTo) => scopeChain.includes(injectTo))
    )
    .sort((left, right) =>
      compareDirectInjectionTraceEntries(left, right, trace.requestedScopeName, broaderScopes)
    )
  const transitiveLoadedScopes = trace.loadedScopes.filter(
    (scope) =>
      scope.scopeName !== trace.requestedScopeName &&
      !(scope.winner.injectTo ?? []).some((injectTo) => scopeChain.includes(injectTo))
  )

  const lines: string[] = [
    sourceDocumentLine === undefined
      ? 'Effective grammar usage:'
      : `Effective grammar usage for source line ${sourceDocumentLine}:`
  ]

  lines.push('  base scope:')
  if (baseScope) {
    appendTraceScope(lines, baseScope, 4)
  } else {
    lines.push(`    ${trace.requestedScopeName} -> <not loaded>`)
  }

  lines.push('  direct injections:')
  if (directInjections.length > 0) {
    for (const scope of directInjections) {
      appendTraceScope(
        lines,
        scope,
        4,
        classifyDirectInjectionKind(scope, trace.requestedScopeName, broaderScopes)
      )
    }
  } else {
    lines.push('    <none>')
  }

  if (transitiveLoadedScopes.length > 0) {
    lines.push('  transitive loaded scopes:')
    for (const scope of transitiveLoadedScopes) {
      appendTraceScope(lines, scope, 4)
    }
  }

  return lines
}

async function createRegistry(grammars: readonly GrammarContribution[]): Promise<tm.Registry> {
  const resolvedGrammars = await resolveGrammarScopes(grammars)
  const { grammarIndex, injections, rawGrammarCache } = indexResolvedGrammars(resolvedGrammars)

  return buildRegistry(grammarIndex, injections, rawGrammarCache)
}

async function createRegistryWithTrace(
  grammars: readonly GrammarContribution[],
  sourcedGrammars?: readonly SourcedGrammarContribution[]
): Promise<{ registry: tm.Registry; traceRecorder: TokenizationTraceRecorder }> {
  const resolvedGrammars = await resolveGrammarScopes(grammars, sourcedGrammars)
  const { grammarIndex, injections, rawGrammarCache } = indexResolvedGrammars(resolvedGrammars)
  const traceRecorder = new TokenizationTraceRecorder(resolvedGrammars)

  return {
    registry: buildRegistry(grammarIndex, injections, rawGrammarCache, (scopeName) => {
      traceRecorder.recordLoadedScope(scopeName)
    }),
    traceRecorder
  }
}

function getOnigLib(): Promise<tm.IOnigLib> {
  onigLibPromise ??= loadOnigLib()
  return onigLibPromise
}

async function loadOnigLib(): Promise<tm.IOnigLib> {
  const wasmPath = require.resolve('vscode-oniguruma').replace(/main\.js$/, 'onig.wasm')
  const wasmBuffer = await fs.readFile(wasmPath)
  await oniguruma.loadWASM(toArrayBuffer(wasmBuffer))

  return {
    createOnigScanner(patterns) {
      return new oniguruma.OnigScanner(patterns)
    },
    createOnigString(value) {
      return new oniguruma.OnigString(value)
    }
  }
}

async function resolveGrammarScopes(
  grammars: readonly GrammarContribution[],
  sourcedGrammars?: readonly SourcedGrammarContribution[]
): Promise<ResolvedGrammarContribution[]> {
  return Promise.all(
    grammars.map(async (grammar, index) => {
      const source = sourcedGrammars && sourcedGrammars.length === grammars.length ? sourcedGrammars[index].source : undefined
      if (grammar.scopeName) {
        return {
          ...grammar,
          source
        }
      }

      const rawGrammar = await loadRawGrammar(grammar.path)
      return {
        ...grammar,
        scopeName: rawGrammar.scopeName,
        source
      }
    })
  )
}

async function loadRawGrammar(grammarPath: string): Promise<tm.IRawGrammar> {
  const content = await fs.readFile(grammarPath, 'utf8')
  return tm.parseRawGrammar(content, grammarPath)
}

function indexResolvedGrammars(resolvedGrammars: readonly ResolvedGrammarContribution[]): {
  grammarIndex: Map<string, ResolvedGrammarContribution>
  injections: Record<string, string[]>
  rawGrammarCache: Map<string, Promise<tm.IRawGrammar>>
} {
  const grammarIndex = new Map<string, ResolvedGrammarContribution>()
  const injections: Record<string, string[]> = {}
  const rawGrammarCache = new Map<string, Promise<tm.IRawGrammar>>()

  for (const grammar of resolvedGrammars) {
    grammarIndex.set(grammar.scopeName, grammar)

    for (const injectScope of grammar.injectTo ?? []) {
      injections[injectScope] ??= []
      injections[injectScope].push(grammar.scopeName)
    }
  }

  return {
    grammarIndex,
    injections,
    rawGrammarCache
  }
}

function buildRegistry(
  grammarIndex: ReadonlyMap<string, ResolvedGrammarContribution>,
  injections: Readonly<Record<string, string[]>>,
  rawGrammarCache: Map<string, Promise<tm.IRawGrammar>>,
  onLoadScope?: (scopeName: string) => void
): tm.Registry {
  return new tm.Registry({
    onigLib: getOnigLib(),
    loadGrammar: async (scopeName) => {
      const grammar = grammarIndex.get(scopeName)
      if (!grammar) {
        return null
      }

      onLoadScope?.(scopeName)

      let rawGrammarPromise = rawGrammarCache.get(grammar.path)
      if (!rawGrammarPromise) {
        rawGrammarPromise = loadRawGrammar(grammar.path)
        rawGrammarCache.set(grammar.path, rawGrammarPromise)
      }

      return rawGrammarPromise
    },
    getInjections: (scopeName) => {
      const parts = scopeName.split('.')
      const resolvedInjections: string[] = []

      for (let index = 1; index <= parts.length; index++) {
        const subScopeName = parts.slice(0, index).join('.')
        resolvedInjections.push(...(injections[subScopeName] ?? []))
      }

      return uniqueStrings(resolvedInjections)
    }
  })
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength)
  bytes.set(buffer)
  return bytes.buffer
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function formatTraceGrammarEntry(entry: TokenizationTraceGrammarEntry): string {
  const source = entry.source ? `[${entry.source}] ` : ''
  const language = entry.language ? ` language=${entry.language}` : ''
  const injectTo =
    entry.injectTo && entry.injectTo.length > 0 ? ` injectTo=${entry.injectTo.join(',')}` : ''
  return `${source}${entry.path}${language}${injectTo}`
}

function appendTraceScope(
  lines: string[],
  scope: TokenizationLoadedScopeTrace,
  indent: number,
  suffix?: string
): void {
  const prefix = ' '.repeat(indent)
  const suffixText = suffix ? ` ${suffix}` : ''
  lines.push(`${prefix}${scope.scopeName} -> ${formatTraceGrammarEntry(scope.winner)}${suffixText}`)
  for (const overridden of scope.overridden) {
    lines.push(`${prefix}  lower-priority candidate: ${formatTraceGrammarEntry(overridden)}`)
  }
}

function classifyDirectInjectionKind(
  scope: TokenizationLoadedScopeTrace,
  requestedScopeName: string,
  broaderScopes: ReadonlySet<string>
): string | undefined {
  const injectTo = scope.winner.injectTo ?? []
  if (injectTo.includes(requestedScopeName)) {
    return '(exact)'
  }

  const broaderMatches = injectTo.filter((value) => broaderScopes.has(value))
  if (broaderMatches.length > 0) {
    return `(inherited via ${broaderMatches.join(', ')})`
  }

  return undefined
}

function compareDirectInjectionTraceEntries(
  left: TokenizationLoadedScopeTrace,
  right: TokenizationLoadedScopeTrace,
  requestedScopeName: string,
  broaderScopes: ReadonlySet<string>
): number {
  const specificityDelta =
    getDirectInjectionSpecificity(right.winner, requestedScopeName, broaderScopes) -
    getDirectInjectionSpecificity(left.winner, requestedScopeName, broaderScopes)
  if (specificityDelta !== 0) {
    return specificityDelta
  }

  return left.scopeName.localeCompare(right.scopeName)
}

function getDirectInjectionSpecificity(
  grammar: TokenizationTraceGrammarEntry,
  requestedScopeName: string,
  broaderScopes: ReadonlySet<string>
): number {
  const injectTo = grammar.injectTo ?? []
  if (injectTo.includes(requestedScopeName)) {
    return 2
  }

  if (injectTo.some((value) => broaderScopes.has(value))) {
    return 1
  }

  return 0
}

function getScopeChain(scopeName: string): readonly string[] {
  const parts = scopeName.split('.')
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'))
}

class TokenizationTraceRecorder {
  private readonly candidatesByScope = new Map<string, ResolvedGrammarContribution[]>()
  private readonly loadedScopeNames: string[] = []
  private readonly loadedScopeSet = new Set<string>()

  constructor(grammars: readonly ResolvedGrammarContribution[]) {
    for (const grammar of grammars) {
      const candidates = this.candidatesByScope.get(grammar.scopeName)
      if (candidates) {
        candidates.push(grammar)
      } else {
        this.candidatesByScope.set(grammar.scopeName, [grammar])
      }
    }
  }

  recordLoadedScope(scopeName: string): void {
    if (this.loadedScopeSet.has(scopeName)) {
      return
    }

    this.loadedScopeSet.add(scopeName)
    this.loadedScopeNames.push(scopeName)
  }

  build(requestedScopeName: string): TokenizationTrace {
    return {
      requestedScopeName,
      loadedScopes: this.loadedScopeNames
        .map((scopeName) => this.toLoadedScopeTrace(scopeName))
        .filter((scope): scope is TokenizationLoadedScopeTrace => scope !== undefined)
    }
  }

  private toLoadedScopeTrace(scopeName: string): TokenizationLoadedScopeTrace | undefined {
    const candidates = this.candidatesByScope.get(scopeName)
    if (!candidates || candidates.length === 0) {
      return undefined
    }

    const winner = candidates[candidates.length - 1]
    return {
      scopeName,
      winner: toTraceGrammarEntry(winner),
      overridden: candidates.slice(0, -1).map(toTraceGrammarEntry)
    }
  }

}

function toTraceGrammarEntry(grammar: ResolvedGrammarContribution): TokenizationTraceGrammarEntry {
  return {
    injectTo: grammar.injectTo,
    language: grammar.language,
    path: grammar.path,
    scopeName: grammar.scopeName,
    source: grammar.source
  }
}

type ResolvedGrammarContribution = GrammarContribution & {
  scopeName: string
  source?: 'installed' | 'local' | 'provider'
}
