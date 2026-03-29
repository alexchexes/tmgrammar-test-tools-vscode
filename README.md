# TM Grammar Test Tools

Proof-of-concept VS Code extension for generating caret assertions in TextMate syntax tests.

## Current POC flow

1. Open a syntax test file whose first line matches:

   ```text
   <comment token> SYNTAX TEST "<language scope>" "optional description"
   ```

2. Run one of:
   - `TM Grammar Test Tools: Insert Caret Assertions For Current Line`
   - `TM Grammar Test Tools: Insert Caret Assertions For Current Line (Full)`
   - `TM Grammar Test Tools: Insert Caret Assertions For Current Line (Minimal)`
   - `TM Grammar Test Tools: Insert Caret Assertions For Selection`
   - `TM Grammar Test Tools: Insert Caret Assertions For Selection (Full)`
   - `TM Grammar Test Tools: Insert Caret Assertions For Selection (Minimal)`
3. The extension:
   - parses the header
   - finds the nearest `package.json` above the active file that contributes grammars
   - optionally runs a workspace-configured grammar provider command
   - merges those local grammars with grammars contributed by installed VS Code extensions
   - tokenizes source lines from the start of the test through the active source line
   - inserts or replaces the contiguous assertion block directly below that line

## Notes

- Existing assertion lines are skipped during tokenization so rule state is preserved across source lines.
- First-column tokens are emitted with the `<---` syntax when needed so offsets stay correct for the existing test runner.
- The current `Current Line` commands are line-oriented: an empty selection targets the line at each cursor, and a non-empty selection regenerates every touched source line top-to-bottom.
- The current `Selection` commands are range-oriented: a non-empty selection targets the selected characters, and an empty selection resolves the token at the cursor position and uses that token's range.
- `Selection` commands skip blank or whitespace-only source lines only for range-derived targets, and they refuse partial-range replacement on lines that already have assertion blocks.
- If your syntax test is not inside the grammar extension repo, set `tmGrammarTestTools.configPath` to the relevant `package.json`.
- This is important for injection-grammar repos: the local repo can contribute the injection grammar while VS Code supplies the base language grammar, such as `source.js`.
- If `tmGrammarTestTools.grammarProvider.command` is set, the extension runs it on each invocation and uses the returned grammar files for the current dump.
- `tmGrammarTestTools.scopeMode` can be `full` or `minimal`. The generic command uses that setting. The explicit `Full` and `Minimal` commands override it for that invocation.
- `minimal` drops the header scope only when every token shares it and there is at least one more specific scope to show, then emits broader shared scopes once before narrower child scopes.
- `tmGrammarTestTools.compactRanges` defaults to `true` and merges disjoint caret ranges when they share the same rendered scope list and the tmgrammar assertion syntax can represent the merge.

## Grammar Provider Hook

You can configure a repo-specific grammar provider in settings:

```json
{
  "tmGrammarTestTools.grammarProvider.command": "node utils/exportPhpGrammar.js",
  "tmGrammarTestTools.grammarProvider.cwd": "${projectRoot}"
}
```

Supported variables in the command and cwd:

- `${projectRoot}`
- `${workspaceFolder}`
- `${file}`
- `${fileDirname}`
- `${fileBasename}`

Provider command output can be either:

- newline-separated grammar file paths
- a JSON array of paths or grammar objects
- a JSON object with a `grammars` array

For example, `language-php` can use its existing export script so the command sees the current state of `grammars/php.cson` while still loading the extra dependent grammars needed by the test harness.

## Testing

Run `npm test`.

The current suite covers renderer compaction/minimal-mode behavior and round-trips generated fixture assertions through `vscode-tmgrammar-test`.

## Fixture

This repo also includes a minimal fixture grammar under `fixtures/simple-grammar`.

To try the POC inside this workspace:

1. Press `F5` to launch the extension host.
2. Open `fixtures/simple-grammar/tests/example.simple-poc`.
3. Place the cursor on a source line and run `TM Grammar Test Tools: Insert Caret Assertions For Current Line`.
