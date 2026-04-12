# Changelog

## 0.2.0 - 2026-04-12

- Added universal `Insert Assertions` commands in CodeLens, Code Actions, and the command palette. They now switch between line and range behavior automatically based on the current cursor or selection.
- Improved CodeLens ergonomics:
  - hide lenses on source lines that look like comments
  - use shorter labels
  - show `Assertions: Loading…` while slower grammar loading or assertion generation is in progress
- Added `tmGrammarTestTools.minimalTailScopeCount` so `Minimal` assertions can optionally keep the last two scopes instead of only the last one.
- Improved assertion-generation feedback:
  - status bar progress feedback
  - clearer output log message when an edit is rejected
- Expanded Testing UI support:
  - `tmGrammarTestTools.testDiscovery.include` / `exclude` can add workspace syntax test files to the Testing view by glob
  - single-line Testing runs are no longer blocked by malformed assertions elsewhere in the file
  - Testing output now uses clearer relative labels and logs the full target path in the Output panel
  - failure output includes `Actual scopes` details in more places
  - `Copy` command on failed test items now more reliable and consistent
- Added local `vscode-tmgrammar-test` runner support for Testing UI:
  - in trusted workspaces, prefer a local project dependency when one is available
  - otherwise keep using the bundled runner
  - warn when a local dependency is declared but missing
  - fail clearly when a resolved local runner is unusable

## 0.1.1 - 2026-04-02

- Fix: Handle unsaved files properly, so grammar resolution no longer stalls for them.
- Fix: For files outside the current workspace, ignore workspace-scoped settings and use only global/default settings (while keeping untitled drafts in workspace context).

## 0.1.0 - 2026-04-01

- Initial public preview release.
- Generate line and range assertions in full or minimal scope modes.
- Safe refresh existing assertion blocks while preserving manual negative or mixed lines.
- Replace whole-line assertion blocks explicitly when a destructive refresh is needed.
- Run syntax test files or individual asserted source lines from VS Code's Testing UI.
- Use optional grammar providers, installed grammar loading, and CLI dumping/logging helpers for nontrivial grammar setups.
