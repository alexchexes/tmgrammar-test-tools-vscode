import { promises as fs } from 'fs'
import * as oniguruma from 'vscode-oniguruma'
import * as tm from 'vscode-textmate'
import { GrammarContribution } from './grammarConfig'
import { SourceLine } from './syntaxTest'

let onigLibPromise: Promise<tm.IOnigLib> | undefined

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

async function createRegistry(grammars: readonly GrammarContribution[]): Promise<tm.Registry> {
  const resolvedGrammars = await resolveGrammarScopes(grammars)
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

  return new tm.Registry({
    onigLib: getOnigLib(),
    loadGrammar: async (scopeName) => {
      const grammar = grammarIndex.get(scopeName)
      if (!grammar) {
        return null
      }

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

      return resolvedInjections
    }
  })
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
  grammars: readonly GrammarContribution[]
): Promise<ResolvedGrammarContribution[]> {
  return Promise.all(
    grammars.map(async (grammar) => {
      if (grammar.scopeName) {
        return grammar
      }

      const rawGrammar = await loadRawGrammar(grammar.path)
      return {
        ...grammar,
        scopeName: rawGrammar.scopeName
      }
    })
  )
}

async function loadRawGrammar(grammarPath: string): Promise<tm.IRawGrammar> {
  const content = await fs.readFile(grammarPath, 'utf8')
  return tm.parseRawGrammar(content, grammarPath)
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength)
  bytes.set(buffer)
  return bytes.buffer
}

type ResolvedGrammarContribution = GrammarContribution & { scopeName: string }
