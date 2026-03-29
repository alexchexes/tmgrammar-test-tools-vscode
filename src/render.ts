import * as tm from 'vscode-textmate'

export type ScopeMode = 'full' | 'minimal'

export interface RenderOptions {
  compactRanges: boolean
  scopeMode: ScopeMode
  headerScope: string
}

interface AssertionSpec {
  order: number
  ranges: CaretRange[]
  scopes: string[]
}

interface MinimalScopeNode {
  children: Map<string, MinimalScopeNode>
  coverageRanges: CaretRange[]
  firstTokenIndex: number
  terminalRanges: Array<{
    order: number
    range: CaretRange
  }>
}

interface CaretRange {
  startIndex: number
  endIndex: number
}

interface NormalizedToken {
  index: number
  range: CaretRange
  scopes: string[]
}

export function renderAssertionBlock(
  commentToken: string,
  sourceLine: string,
  tokens: readonly tm.IToken[],
  options: RenderOptions
): string[] {
  const renderableTokens = tokens
    .filter((token) => token.endIndex > token.startIndex && token.scopes.length > 0)
    .map((token, index) => ({
      index,
      range: {
        startIndex: token.startIndex,
        endIndex: token.endIndex
      },
      scopes: [...token.scopes]
    }))

  const assertionSpecs = createAssertionSpecs(renderableTokens, options)
  return renderAssertionSpecs(commentToken, sourceLine, assertionSpecs, options.compactRanges)
}

function createAssertionSpecs(tokens: readonly NormalizedToken[], options: RenderOptions): AssertionSpec[] {
  switch (options.scopeMode) {
    case 'minimal':
      return options.compactRanges
        ? groupAssertionSpecsByScopes(createMinimalAssertionSpecs(tokens, options.headerScope))
        : createMinimalAssertionSpecs(tokens, options.headerScope)
    case 'full':
    default:
      return options.compactRanges ? groupAssertionSpecsByScopes(createFullAssertionSpecs(tokens)) : createFullAssertionSpecs(tokens)
  }
}

function createFullAssertionSpecs(tokens: readonly NormalizedToken[]): AssertionSpec[] {
  return tokens.map((token) => ({
    order: token.index,
    ranges: [token.range],
    scopes: token.scopes
  }))
}

function createMinimalAssertionSpecs(tokens: readonly NormalizedToken[], headerScope: string): AssertionSpec[] {
  if (tokens.length === 0) {
    return []
  }

  const normalizedTokens = dropHeaderScope(tokens, headerScope)
  const root = buildMinimalScopeTree(normalizedTokens)
  computeCoverage(root)

  const specs: AssertionSpec[] = []
  collectMinimalSpecs(root, [], [], specs)
  return specs
}

function dropHeaderScope(tokens: readonly NormalizedToken[], headerScope: string): NormalizedToken[] {
  const canDropHeader =
    headerScope.length > 0 &&
    tokens.every((token) => token.scopes[0] === headerScope) &&
    tokens.some((token) => token.scopes.length > 1)

  if (!canDropHeader) {
    return [...tokens]
  }

  return tokens.map((token) => ({
    ...token,
    scopes: token.scopes.slice(1)
  }))
}

function buildMinimalScopeTree(tokens: readonly NormalizedToken[]): MinimalScopeNode {
  const root = createMinimalScopeNode()

  for (const token of tokens) {
    let node = root
    for (const scope of token.scopes) {
      let child = node.children.get(scope)
      if (!child) {
        child = createMinimalScopeNode()
        node.children.set(scope, child)
      }

      node = child
    }

    node.terminalRanges.push({
      order: token.index,
      range: token.range
    })
  }

  return root
}

function createMinimalScopeNode(): MinimalScopeNode {
  return {
    children: new Map(),
    coverageRanges: [],
    firstTokenIndex: Number.POSITIVE_INFINITY,
    terminalRanges: []
  }
}

function computeCoverage(node: MinimalScopeNode): void {
  const coverageRanges = [...node.terminalRanges.map((item) => item.range)]
  let firstTokenIndex = node.terminalRanges.reduce(
    (result, item) => Math.min(result, item.order),
    Number.POSITIVE_INFINITY
  )

  for (const child of node.children.values()) {
    computeCoverage(child)
    coverageRanges.push(...child.coverageRanges)
    firstTokenIndex = Math.min(firstTokenIndex, child.firstTokenIndex)
  }

  node.coverageRanges = mergeRanges(coverageRanges)
  node.firstTokenIndex = firstTokenIndex
}

function collectMinimalSpecs(
  node: MinimalScopeNode,
  pathScopes: readonly string[],
  lastEmittedScopes: readonly string[],
  result: AssertionSpec[]
): void {
  const children = [...node.children.entries()]
    .map(([scope, child]) => ({
      child,
      scope
    }))
    .sort((left, right) => left.child.firstTokenIndex - right.child.firstTokenIndex)

  for (const { child, scope } of children) {
    const { didCollapse, node: collapsedChild, scopes: childPathScopes } = collapseSharedPrefix(child, [...pathScopes, scope])
    let nextLastEmittedScopes = lastEmittedScopes

    if (didCollapse || collapsedChild.terminalRanges.length > 0) {
      const emittedScopes = childPathScopes.slice(lastEmittedScopes.length)
      if (emittedScopes.length > 0) {
        result.push({
          order: collapsedChild.firstTokenIndex,
          ranges: collapsedChild.coverageRanges,
          scopes: emittedScopes
        })
        nextLastEmittedScopes = childPathScopes
      }
    }

    collectMinimalSpecs(collapsedChild, childPathScopes, nextLastEmittedScopes, result)
  }
}

function collapseSharedPrefix(
  node: MinimalScopeNode,
  scopes: readonly string[]
): { didCollapse: boolean; node: MinimalScopeNode; scopes: string[] } {
  let currentNode = node
  const currentScopes = [...scopes]
  let didCollapse = false

  while (currentNode.terminalRanges.length === 0 && currentNode.children.size === 1) {
    const [scope, childNode] = currentNode.children.entries().next().value as [string, MinimalScopeNode]
    currentScopes.push(scope)
    currentNode = childNode
    didCollapse = true
  }

  return {
    didCollapse,
    node: currentNode,
    scopes: currentScopes
  }
}

function groupAssertionSpecsByScopes(specs: readonly AssertionSpec[]): AssertionSpec[] {
  const groupedSpecs = new Map<string, AssertionSpec>()

  for (const spec of specs) {
    if (spec.scopes.length === 0) {
      continue
    }

    const key = spec.scopes.join('\u0000')
    const existingSpec = groupedSpecs.get(key)
    if (!existingSpec) {
      groupedSpecs.set(key, {
        order: spec.order,
        ranges: [...spec.ranges],
        scopes: [...spec.scopes]
      })
      continue
    }

    existingSpec.order = Math.min(existingSpec.order, spec.order)
    existingSpec.ranges.push(...spec.ranges)
  }

  return [...groupedSpecs.values()].map((spec) => ({
    ...spec,
    ranges: mergeRanges(spec.ranges)
  }))
}

function renderAssertionSpecs(
  commentToken: string,
  sourceLine: string,
  specs: readonly AssertionSpec[],
  compactRanges: boolean
): string[] {
  return [...specs]
    .sort((left, right) => left.order - right.order)
    .flatMap((spec) => renderAssertionSpec(commentToken, sourceLine, spec, compactRanges))
}

function renderAssertionSpec(
  commentToken: string,
  sourceLine: string,
  spec: AssertionSpec,
  compactRanges: boolean
): string[] {
  if (spec.scopes.length === 0 || spec.ranges.length === 0) {
    return []
  }

  const ranges = mergeRanges(spec.ranges)
  const shouldSplitRanges =
    !compactRanges || (ranges.length > 1 && ranges.some((range) => range.startIndex < commentToken.length))

  if (shouldSplitRanges) {
    return ranges.map((range) => renderSingleRangeAssertion(commentToken, sourceLine, range, spec.scopes))
  }

  if (ranges.length === 1) {
    return [renderSingleRangeAssertion(commentToken, sourceLine, ranges[0], spec.scopes)]
  }

  return [renderMultiRangeCaretAssertion(commentToken, sourceLine, ranges, spec.scopes)]
}

function renderSingleRangeAssertion(
  commentToken: string,
  sourceLine: string,
  range: CaretRange,
  scopes: readonly string[]
): string {
  const width = Math.max(range.endIndex - range.startIndex, 1)
  const scopeText = scopes.join(' ')

  if (range.startIndex < commentToken.length) {
    return `${commentToken} <${'~'.repeat(range.startIndex)}${'-'.repeat(width)} ${scopeText}`
  }

  const padding = sourceLine
    .slice(commentToken.length, range.startIndex)
    .replace(/[^\t]/g, ' ')

  return `${commentToken}${padding}${'^'.repeat(width)} ${scopeText}`
}

function renderMultiRangeCaretAssertion(
  commentToken: string,
  sourceLine: string,
  ranges: readonly CaretRange[],
  scopes: readonly string[]
): string {
  const maxEndIndex = Math.max(...ranges.map((range) => range.endIndex))
  const markerChars: string[] = Array.from(sourceLine.slice(commentToken.length, maxEndIndex), (character) =>
    character === '\t' ? '\t' : ' '
  )

  for (const range of ranges) {
    for (let index = range.startIndex; index < range.endIndex; index++) {
      markerChars[index - commentToken.length] = '^'
    }
  }

  return `${commentToken}${markerChars.join('')} ${scopes.join(' ')}`
}

function mergeRanges(ranges: readonly CaretRange[]): CaretRange[] {
  const sortedRanges = [...ranges].sort((left, right) => {
    if (left.startIndex !== right.startIndex) {
      return left.startIndex - right.startIndex
    }

    return left.endIndex - right.endIndex
  })

  const mergedRanges: CaretRange[] = []
  for (const range of sortedRanges) {
    const previousRange = mergedRanges.at(-1)
    if (!previousRange || range.startIndex > previousRange.endIndex) {
      mergedRanges.push({ ...range })
      continue
    }

    previousRange.endIndex = Math.max(previousRange.endIndex, range.endIndex)
  }

  return mergedRanges
}
