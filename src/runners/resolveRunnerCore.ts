export interface LocalRunnerTrustDecision {
  allowLocalResolution: boolean
  resolutionWarning?: string
}

export function resolveLocalRunnerTrustDecision(isTrusted: boolean): LocalRunnerTrustDecision {
  if (isTrusted) {
    return {
      allowLocalResolution: true
    }
  }

  return {
    allowLocalResolution: false,
    resolutionWarning:
      'Workspace is not trusted; skipping local vscode-tmgrammar-test resolution and using the bundled runner.'
  }
}
