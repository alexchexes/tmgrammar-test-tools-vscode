# TM Grammar Test Tools

Proof-of-concept VS Code extension for generating caret assertions in TextMate syntax tests.

## Current POC flow

1. Open a syntax test file whose first line matches:

   ```text
   <comment token> SYNTAX TEST "<language scope>" "optional description"
   ```

2. Run one of:
   - `TM Grammar Test Tools: Insert Line Assertions`
   - `TM Grammar Test Tools: Insert Line Assertions (Full)`
   - `TM Grammar Test Tools: Insert Line Assertions (Minimal)`
   - `TM Grammar Test Tools: Insert Range Assertions`
   - `TM Grammar Test Tools: Insert Range Assertions (Full)`
   - `TM Grammar Test Tools: Insert Range Assertions (Minimal)`
3. The extension:
   - parses the header
   - finds the nearest `package.json` above the active file that contributes grammars
   - optionally runs a workspace-configured grammar provider command
   - merges those local grammars with grammars contributed by installed VS Code extensions
   - tokenizes source lines from the start of the test through the source line under the cursor, or through each source line touched by the current selection
   - inserts or replaces the assertion block below those source lines

## Notes

- Existing assertion lines are skipped during tokenization so TextMate rule state is preserved across source lines.
- First-column tokens are emitted with the `<---` syntax when needed.
- `Line` commands are line-oriented:
   - with empty selection they target the line at each cursor
   - with non-empty selection they regenerate every touched source line top-to-bottom, and assertion lines map back to their owning source line.
- `Range` commands are range-oriented and operate on source text:
   - with non-empty selection they target the selected characters
   - with empty selection they resolve the token at the cursor position(s) and use that token's range.
- `Range` commands skip blank or whitespace-only source lines only for range-derived targets, and they refuse partial-range replacement on lines that already have assertion blocks.
- `tmGrammarTestTools.scopeMode` can be `full` or `minimal`. The generic `Line` and `Range` commands use that setting. The explicit `Full` and `Minimal` commands override it for that invocation.
- `minimal` drops the header scope only when every token shares it and there is at least one more specific scope to show, then emits broader shared scopes once before narrower child scopes.
- `tmGrammarTestTools.compactRanges` defaults to `true` and merges disjoint caret ranges when they share the same rendered scope list and the tmgrammar assertion syntax can represent the merge.

## Grammar Sources

- If your syntax test is not inside the grammar extension repo, set `tmGrammarTestTools.configPath` to the relevant `package.json`.
- Grammar sources are merged from three places: installed VS Code extensions (including built-in ones), the nearest or configured local `package.json`, and the optional grammar provider command.
- For the same exact scope name, later sources win: installed VS Code grammars are loaded first, then local `package.json` grammars, then provider grammars.
- Injection grammars are additive. A local or provider injection grammar can inject into a base grammar that comes from an installed or built-in VS Code extension, such as a repo contributing `source.js.regexp` while VS Code supplies `source.js`.
- If `tmGrammarTestTools.grammarProvider.command` is set, the extension runs it on each invocation and uses the returned grammar files for the current dump.

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

The current suite covers renderer compaction/minimal-mode behavior, selection targeting/clipping, and round-trips generated fixture assertions through `vscode-tmgrammar-test`.

## Fixture

This repo also includes a minimal fixture grammar under `fixtures/simple-grammar`.

To try the POC inside this workspace:

1. Press `F5` to launch the extension host.
2. Open `fixtures/simple-grammar/tests/example.simple-poc`.
3. Place the cursor on a source line and run `TM Grammar Test Tools: Insert Line Assertions`.
