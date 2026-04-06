import { ResolvedGrammarTestRunner } from './types'

export function consumeRunScopedResolutionWarningNotification(
  shownNotificationKeys: Set<string>,
  resolvedRunner: Pick<ResolvedGrammarTestRunner, 'resolutionNotificationKey' | 'resolutionWarning'>
): string | undefined {
  if (!resolvedRunner.resolutionWarning || !resolvedRunner.resolutionNotificationKey) {
    return undefined
  }

  if (shownNotificationKeys.has(resolvedRunner.resolutionNotificationKey)) {
    return undefined
  }

  shownNotificationKeys.add(resolvedRunner.resolutionNotificationKey)
  return resolvedRunner.resolutionWarning
}
