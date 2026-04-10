export function buildRejectedAssertionUpdateMessage(
  preparedDocumentVersion: number,
  currentDocumentVersion: number
): string {
  if (preparedDocumentVersion !== currentDocumentVersion) {
    return `The editor rejected the assertion update because the document changed while assertions were being prepared (prepared against version ${preparedDocumentVersion}, current version ${currentDocumentVersion}). Try the command again.`
  }

  return 'The editor rejected the assertion update. VS Code did not provide any further reason.'
}
