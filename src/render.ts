import * as tm from 'vscode-textmate'
import { MinimalTailScopeCount } from './minimalTailScopeCount'

export type ScopeMode = 'full' | 'minimal'

export interface RenderOptions {
  compactRanges: boolean
  scopeMode: ScopeMode
  headerScope: string
  minimalTailScopeCount?: MinimalTailScopeCount
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
        ? groupAssertionSpecsByScopes(
            createMinimalAssertionSpecs(tokens, options.headerScope, options.minimalTailScopeCount ?? 1)
          )
        : createMinimalAssertionSpecs(tokens, options.headerScope, options.minimalTailScopeCount ?? 1)
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

function createMinimalAssertionSpecs(
  tokens: readonly NormalizedToken[],
  headerScope: string,
  minimalTailScopeCount: MinimalTailScopeCount
): AssertionSpec[] {
  if (tokens.length === 0) {
    return []
  }

  const normalizedTokens = dropHeaderScope(tokens, headerScope)
  const root = buildMinimalScopeTree(normalizedTokens)
  computeCoverage(root)

  const specs: AssertionSpec[] = []
  collectMinimalSpecs(root, [], [], specs, minimalTailScopeCount)
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
  result: AssertionSpec[],
  minimalTailScopeCount: MinimalTailScopeCount
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
      const emittedScopes = childPathScopes.slice(
        determineMinimalEmitStartIndex(
          childPathScopes,
          lastEmittedScopes,
          collapsedChild.terminalRanges.length > 0,
          minimalTailScopeCount
        )
      )
      if (emittedScopes.length > 0) {
        result.push({
          order: collapsedChild.firstTokenIndex,
          ranges: collapsedChild.coverageRanges,
          scopes: emittedScopes
        })
        nextLastEmittedScopes = childPathScopes
      }
    }

    collectMinimalSpecs(collapsedChild, childPathScopes, nextLastEmittedScopes, result, minimalTailScopeCount)
  }
}

function determineMinimalEmitStartIndex(
  childPathScopes: readonly string[],
  lastEmittedScopes: readonly string[],
  retainTailScopes: boolean,
  minimalTailScopeCount: MinimalTailScopeCount
): number {
  const deltaStartIndex = lastEmittedScopes.length
  if (!retainTailScopes || minimalTailScopeCount === 1) {
    return deltaStartIndex
  }

  const tailStartIndex = Math.max(0, childPathScopes.length - minimalTailScopeCount)
  return Math.min(deltaStartIndex, tailStartIndex)
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
  const sortedSpecs = (compactRanges ? [...specs] : splitAssertionSpecsForUncompactedOutput(specs))
    .sort(compareAssertionSpecs)

  return sortedSpecs
    .flatMap((spec) => renderAssertionSpec(commentToken, sourceLine, spec, compactRanges))
}

function splitAssertionSpecsForUncompactedOutput(specs: readonly AssertionSpec[]): AssertionSpec[] {
  return specs.flatMap((spec) =>
    mergeRanges(spec.ranges).map((range) => ({
      order: spec.order,
      ranges: [range],
      scopes: spec.scopes
    }))
  )
}

function compareAssertionSpecs(left: AssertionSpec, right: AssertionSpec): number {
  const leftRange = getPrimaryRange(left)
  const rightRange = getPrimaryRange(right)

  if (leftRange && rightRange) {
    if (leftRange.startIndex !== rightRange.startIndex) {
      return leftRange.startIndex - rightRange.startIndex
    }

    const leftWidth = leftRange.endIndex - leftRange.startIndex
    const rightWidth = rightRange.endIndex - rightRange.startIndex
    if (leftWidth !== rightWidth) {
      return rightWidth - leftWidth
    }
  }

  return left.order - right.order
}

function getPrimaryRange(spec: AssertionSpec): CaretRange | undefined {
  return spec.ranges[0]
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
  if (!compactRanges) {
    return ranges.map((range) => renderSingleRangeAssertion(commentToken, sourceLine, range, spec.scopes))
  }

  const { caretRanges, leftArrowRanges } = partitionRenderableRanges(ranges, commentToken.length)
  const renderedLines: string[] = leftArrowRanges.map((range) =>
    renderSingleRangeAssertion(commentToken, sourceLine, range, spec.scopes)
  )

  if (caretRanges.length === 1) {
    renderedLines.push(renderSingleRangeAssertion(commentToken, sourceLine, caretRanges[0], spec.scopes))
  } else if (caretRanges.length > 1) {
    renderedLines.push(renderMultiRangeCaretAssertion(commentToken, sourceLine, caretRanges, spec.scopes))
  }

  return renderedLines
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

function partitionRenderableRanges(
  ranges: readonly CaretRange[],
  commentTokenLength: number
): { caretRanges: CaretRange[]; leftArrowRanges: CaretRange[] } {
  const caretRanges: CaretRange[] = []
  const leftArrowRanges: CaretRange[] = []

  for (const range of ranges) {
    if (range.startIndex < commentTokenLength) {
      leftArrowRanges.push(range)
      continue
    }

    caretRanges.push(range)
  }

  return {
    caretRanges,
    leftArrowRanges
  }
}
