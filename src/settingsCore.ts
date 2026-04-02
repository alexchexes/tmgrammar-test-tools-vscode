export interface InspectSubset<T> {
  defaultLanguageValue?: T
  defaultValue?: T
  globalLanguageValue?: T
  globalValue?: T
}

export function shouldUseWorkspaceScopedSettings(uriScheme: string, inWorkspaceFolder: boolean): boolean {
  void uriScheme
  return inWorkspaceFolder
}

export function resolveNonWorkspaceSettingValue<T>(inspected?: InspectSubset<T>): T | undefined {
  if (!inspected) {
    return undefined
  }

  if (inspected.globalLanguageValue !== undefined) {
    return inspected.globalLanguageValue
  }

  if (inspected.globalValue !== undefined) {
    return inspected.globalValue
  }

  if (inspected.defaultLanguageValue !== undefined) {
    return inspected.defaultLanguageValue
  }

  return inspected.defaultValue
}
