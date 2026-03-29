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
   - optionally auto-loads grammars contributed by installed VS Code extensions
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
- `tmGrammarTestTools.enableCodeActions` defaults to `true` and adds Code Actions for inserting line or range assertions at the current cursor or selection.
- `tmGrammarTestTools.enableCodeLens` defaults to `true` and adds line-oriented CodeLens commands below source lines, or below existing assertion blocks when possible.

## Grammar Sources

- If your syntax test is not inside the grammar extension repo, set `tmGrammarTestTools.configPath` to the relevant `package.json`.
- By default, grammar sources are merged from three places: installed VS Code extensions (including built-in ones), the nearest or configured local `package.json`, and the optional grammar provider command.
- `tmGrammarTestTools.autoLoadInstalledGrammars` defaults to `true`. When it is `false`, installed VS Code grammars are skipped and only local `package.json` plus provider grammars are used.
- For the same exact scope name, later sources win: installed VS Code grammars are loaded first (when auto-loading is enabled), then local `package.json` grammars, then provider grammars.
- Injection grammars are additive. A local or provider injection grammar can inject into a base grammar that comes from an installed or built-in VS Code extension, such as a repo contributing `source.js.regexp` while VS Code supplies `source.js`.
- If `tmGrammarTestTools.grammarProvider.command` is set, the extension runs it on each invocation and uses the returned grammar files for the current dump.

## Grammar Provider Hook

You can configure a grammar provider via workspace, workspace-folder, or global `settings.json`. That is useful when you work with a grammar that is not contributed directly via a nearby `package.json`. For example:

```jsonc
{
  "tmGrammarTestTools.grammarProvider.command": "node exportMyCsonGrammar.js",
  "tmGrammarTestTools.grammarProvider.cwd": "${workspaceFolder}" // optional
}
```

Provider command output can be either:

- newline-separated grammar file paths
- a JSON array of paths or grammar objects
- a JSON object with a `grammars` array

Provider grammars are merged after installed grammars when auto-loading is enabled and after local package.json grammars, so exact scope-name matches override earlier sources, while injection grammars remain additive.

Supported variables in `tmGrammarTestTools.grammarProvider.command`:

- `${workspaceFolder}`
- `${projectRoot}`
- `${file}`
- `${fileDirname}`
- `${fileBasename}`

Supported variables in `tmGrammarTestTools.grammarProvider.cwd`:

- `${workspaceFolder}`
- `${projectRoot}`
- `${fileDirname}`

If `${workspaceFolder}` is used in `command` or `cwd`, the active file must belong to a workspace folder.

`${projectRoot}` resolves to the nearest ancestor of the active file that contains `package.json` or `.git`. If neither is found, it resolves to the directory containing the file.

If `tmGrammarTestTools.grammarProvider.cwd` is empty or unset, the extension runs the provider command from the active document's workspace folder and falls back to `${projectRoot}` when the file is outside the workspace.

`command` and `cwd` are resolved independently, so you can specify one in the workspace's `.vscode/settings.json` and the other in global `settings.json`, but in most cases it is reasonable to keep them together in the same settings file.

## Testing

Run `npm test`.

The current suite covers renderer compaction/minimal-mode behavior, selection targeting/clipping, and round-trips generated fixture assertions through `vscode-tmgrammar-test`.

## CLI Helper

For scripted use outside VS Code:

```bash
# From this repo:
npm run dump-assertions -- --file <syntax-test-file> --line <lineNumber>
# or
npm run dump-assertions -- --file <syntax-test-file> --range <startLine:startColumn-endLine:endColumn>

# From outside this repo:
# first compile from this repo:
cd <this-repo-root> && npm run compile

# then invoke it from anywhere:
cd <anywhere>
node <this-repo-root>/out/cli.js --file <syntax-test-file> <...>
```

Required:

- `--file <syntax-test-file>` points to the syntax test file.
- At least one target is required: `--line` and/or `--range`.

Targets:

- `--line <lineNumber>` generates assertions for a 1-based document line containing source text. You can repeat it.
- `--range <startLine:startColumn-endLine:endColumn>` generates assertions for a selected range using 1-based inclusive columns. You can repeat it.
- You can specify both at the same time.

Grammar loading:

- `--config <package.json>` loads grammars from a grammar package manifest. If you omit it, the CLI searches upward from `--file` for a `package.json` with `contributes.grammars`.
- `--provider-command <command>` runs a grammar provider command.
- `--provider-cwd <cwd>` sets the provider working directory. If omitted, the CLI runs the provider from `${projectRoot}` for `--file`.

- `--provider-timeout-ms <ms>` sets the provider timeout.

Render options:

- `--scope-mode <full|minimal>` controls full vs minimal rendering.
- `--compact-ranges` enables disjoint caret compaction.
- `--no-compact-ranges` disables disjoint caret compaction.

Output options:

- `--json` prints structured JSON output. This is the default.
- `--plain` prints only the generated assertion lines.

Notes:

- The CLI prints to stdout. It does not modify the file.
- It currently loads grammars only from local `package.json` and/or `--provider-command`. It does not auto-load installed VS Code grammars.

Full usage example:
```bash
node <this-repo-root>/out/cli.js \
  --file /grammar-package/path/to/test.php \
  --provider-command "node utils/exportCsonGrammar.js" \
  --provider-cwd /grammar-package \
  --line 3 \
  --scope-mode minimal \
  --plain
```

## Fixture

This repo also includes a minimal fixture grammar under `fixtures/simple-grammar`.

To try the POC inside this workspace:

1. Press `F5` to launch the extension host.
2. Open `fixtures/simple-grammar/tests/example.simple-poc`.
3. Place the cursor on a source line and run `TM Grammar Test Tools: Insert Line Assertions`.
