# TM Grammar Test Tools

Generate, refresh, and run assertions for [VSCode TextMate grammar tests](https://github.com/PanAeon/vscode-tmgrammar-test) directly in VS Code. Works out of the box in grammar packages, and in any test file once the needed grammar is available in VS Code or [configured](#grammar-loading).

### Generate Assertions

<video controls muted playsinline poster="https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/insert-assertions.png">
  <source src="https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/insert-assertions.mp4" type="video/mp4" />
</video>

<details>
<summary>GIF</summary>

_GIF fallback for GitHub, which doesn't render `<video>`. [Link to mp4](https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/insert-assertions.mp4)_.

![Generate Assertions demo](https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/insert-assertions.gif)

</details>

### Run Tests

<video controls muted playsinline poster="https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/testing.png">
  <source src="https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/testing.mp4" type="video/mp4" />
</video>

<details>
<summary>GIF</summary>

_GIF fallback for GitHub, which doesn't render `<video>`. [Link to mp4](https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/testing.mp4)_.

![Testing demo](https://raw.githubusercontent.com/alexchexes/tmgrammar-test-tools-vscode/master/media/readme/testing.gif)

</details>

## Quick Start

1. Open a syntax test file whose first line matches:

   ```text
   <comment token> SYNTAX TEST "<language scope>" "optional description"
   ```

2. Use CodeLens, Code Actions (lightbulb), or the Command Palette to run one of:
   - `Insert Line Assertions` to generate or safely refresh assertions for whole source line(s)
   - `Replace Line Assertions` to fully replace an existing line(s) assertion block
   - `Insert Range Assertions` to generate assertions only for the selected range or token at the cursor
   - `... (Full)` / `... (Minimal)` variants:
     - `Full` emits full scope stacks starting from the syntax-test header scope
     - `Minimal` applies a heuristic reduction and factoring pass to keep the output shorter while preserving useful scope distinctions
     - unqualified commands use the current `tmGrammarTestTools.scopeMode: full | minimal` setting (default is `full`)
3. The extension resolves grammars from installed VS Code grammar contributions (if `tmGrammarTestTools.autoLoadInstalledGrammars` is enabled), package.json grammar contributions, and optional [provider](#grammar-provider) output, in this order. Then it tokenizes from the top of the syntax test up to the targeted source line(s) and inserts or refreshes the assertion block under each targeted line.

User-facing line and column numbers are 1-based unless explicitly noted otherwise.

Most commands also write context, timing, and grammar-loading details to the `TM Grammar Test Tools` Output panel.

You can bind keyboard shortcuts for all the extension commands.

<details>
<summary>Example <code>keybindings.json</code> snippet</summary>

```jsonc
[
  // Line assertions: use the configured tmGrammarTestTools.scopeMode
  {
    "key": "ctrl+alt+l",
    "command": "tmGrammarTestTools.insertLineAssertions",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+shift+l",
    "command": "tmGrammarTestTools.replaceLineAssertions",
    "when": "editorTextFocus"
  },

  // Line assertions: force full or minimal for this invocation
  {
    "key": "ctrl+alt+1",
    "command": "tmGrammarTestTools.insertLineAssertionsFull",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+2",
    "command": "tmGrammarTestTools.insertLineAssertionsMinimal",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+shift+1",
    "command": "tmGrammarTestTools.replaceLineAssertionsFull",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+shift+2",
    "command": "tmGrammarTestTools.replaceLineAssertionsMinimal",
    "when": "editorTextFocus"
  },

  // Range assertions: use the configured tmGrammarTestTools.scopeMode
  {
    "key": "ctrl+alt+;",
    "command": "tmGrammarTestTools.insertRangeAssertions",
    "when": "editorTextFocus"
  },

  // Range assertions: force full or minimal for this invocation
  {
    "key": "ctrl+alt+3",
    "command": "tmGrammarTestTools.insertRangeAssertionsFull",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+4",
    "command": "tmGrammarTestTools.insertRangeAssertionsMinimal",
    "when": "editorTextFocus"
  }
]
```

</details>

## Command Behavior

- Existing assertion lines are skipped during tokenization so TextMate rule state is preserved across source lines.
- First-column tokens are emitted with the `<--`/`<~--` syntax when needed.
- `Line` assertion commands are line-oriented:
  - with empty selection they target the line at cursor(s)
  - with non-empty selection they target each touched non-blank source line top-to-bottom
  - a non-empty selection made entirely of whitespace-only source lines is treated as intentional and command targets those lines too
- `Insert Line` and `Insert Range` either insert new assertions or, for existing blocks, perform a safe refresh, meaning they don't touch assertion lines that contain negative assertions.
- `Range` commands are selection- or token-**range** oriented:
  - with a non-empty selection(s), they generate assertions for the selected characters
  - with an empty selection(s), they resolve the token at the cursor position(s) and use that token as the range. For example, if the cursor is in the middle of `quux;`, it expands to the full `quux` token and emits assertions for it
  - when only part of a line is selected and that line already has assertions, they insert new assertions into the existing block (instead of replacing it)
  - when the whole line is selected, they behave like `Line` assertion commands
  - that behavior is independent for each line touched by the selection(s) or cursor(s)
  - `Range` commands skip blank or whitespace-only lines, unless selection is made entirely of whitespace-only lines.
- `(Minimal)` command variants:
  - may omit the header scope when it is shared by every token and there is at least one more specific scope to show.
  - factor shared parent scopes so broader scopes are emitted once before narrower child scopes
- `Replace Line` commands always replace the whole assertion block for each targeted source line, so use with caution: they may wipe out negative assertions and weaken the test.

Code Actions and CodeLens expose the safe `Insert` commands. The potentially destructive `Replace Line` commands are available from the command palette.

## Settings

- `tmGrammarTestTools.scopeMode` can be `full` or `minimal`. The generic `Line` and `Range` commands use that setting. The explicit `Full` and `Minimal` commands override it for that invocation. Default is `full`.
- `tmGrammarTestTools.compactRanges` defaults to `true` and merges disjoint caret ranges when they share the same rendered scope list and the tmgrammar assertion syntax can represent the merge.
- `tmGrammarTestTools.autoLoadInstalledGrammars` defaults to `true` and controls whether installed VS Code grammars are loaded before local and provider grammars.
- `tmGrammarTestTools.enableCodeActions` defaults to `true` and adds Code Actions for inserting line or range assertions at the current cursor or selection.
- `tmGrammarTestTools.enableCodeLens` defaults to `true` and adds line-oriented CodeLens commands above non-empty source lines.
- `tmGrammarTestTools.configPath` points to the grammar package `package.json` when the nearest one is not the right source for the current syntax test.
- `tmGrammarTestTools.grammarProvider.*` controls optional external grammar loading. See [Grammar Provider](#grammar-provider).

- _Debugging_: `tmGrammarTestTools.logGrammarDetails` defaults to `false` and, when enabled, logs detailed grammar selection info in the Output panel. Assertion generation logs the actually used grammar scopes with source labels; test runs log the merged grammar load order.

## Testing UI

The extension integrates with VS Code’s native Testing UI.

- Open syntax test files are discovered in the Testing view.
- The extension creates one test item per open syntax test file and one child item per source line that has an assertion block.
- You can run a whole file or a single asserted source line from the Testing view or gutter.
- Test execution uses the real `vscode-tmgrammar-test` runner bundled with the extension.
- Test runs use the current editor text, **including unsaved edits**.
- Failures are shown in the Test Results UI. The `Go to Error` action selects the failing assertion line.
- Right-clicking a failing test exposes `Go to Source Range`, which selects the source-line range covered by that failing assertion.
- Currently, the `Debug` action uses the same runner as `Run`; debugger integration is not implemented yet.

## Grammar Loading

The extension can load grammars from:

- installed VS Code extensions (including built-in ones)
- the nearest local `package.json`, or the one pointed to by `tmGrammarTestTools.configPath`
- the optional [grammar provider](#grammar-provider) command

If your syntax test is not inside the grammar extension repo, the usual ways to point it at the right grammars are:

- set `tmGrammarTestTools.configPath` to the `package.json` that contributes the relevant grammar
- use a [grammar provider](#grammar-provider) when the needed grammars are generated, split across files, or not fully described by `package.json`

The loading rules are then:

- When `tmGrammarTestTools.autoLoadInstalledGrammars` is `false`, installed VS Code grammars are skipped and only local `package.json` plus provider grammars are used.
- For the same exact scope name, precedence follows that fixed load order: installed VS Code grammars first (when enabled) → then local `package.json` grammars → then provider grammars.
- Injection grammars are additive. A local or provider injection grammar can extend a base grammar that comes from an installed or built-in VS Code extension, either by adding more specific scopes within existing content or by contributing injected regions.
- If `tmGrammarTestTools.grammarProvider.command` is set, the extension runs it on each invocation and uses the returned grammar files for the current dump.

## Grammar Provider

You can configure a grammar provider via workspace, workspace-folder, or global `settings.json`. That is useful when the grammars you want to test are not contributed directly via a nearby `package.json`, or are not fully described by it. For example, a repo may use generated grammars, extra base grammars, or test-only grammar files. Another case is when the grammar source is in `.cson` and the actual TextMate grammar files require a build step.

Example usage:

```jsonc
{
  "tmGrammarTestTools.grammarProvider.command": "node buildAndExportGrammars.js",
  "tmGrammarTestTools.grammarProvider.cwd": "${workspaceFolder}", // optional
  "tmGrammarTestTools.grammarProvider.scopes": ["source.js"], // optional
}
```

Provider command output can be either:

- newline-separated grammar file paths
- a JSON array of paths or grammar objects
- a JSON object with a `grammars` array

Example output shape:

```json
[
  "syntaxes/source.base.tmLanguage.json",
  {
    "path": "syntaxes/source.injection.tmLanguage.json",
    "scopeName": "source.injection",
    "injectTo": ["source.base"]
  }
]
```

See a [small example provider](examples/grammar-provider/print-grammars.cjs) that prints a JSON array of relative grammar paths.

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

If `tmGrammarTestTools.grammarProvider.scopes` is set, the provider runs only when the syntax-test header scope exactly matches one of the configured values. Leave it empty or unset to allow the provider for any scope.

If `${workspaceFolder}` is used in `command` or `cwd`, the active file must belong to a workspace folder.

`${projectRoot}` resolves to the nearest ancestor of the active file that contains `package.json` or `.git`. If neither is found, it resolves to the directory containing the file.

If `tmGrammarTestTools.grammarProvider.cwd` is empty or unset, the extension runs the provider command from the active document's workspace folder and falls back to `${projectRoot}` when the file is outside the workspace.

`command` and `cwd` are resolved independently, so you can specify one in the workspace's `.vscode/settings.json` and the other in global `settings.json`, but in most cases it is reasonable to keep them together.

## CLI

*The CLI is currently available from a local checkout of this repository; it is not distributed separately yet. Clone the repository to use it.*

For scripted use outside VS Code.

The CLI is read-only: it prints generated assertions to stdout and never modifies the file.

```bash
cd <this-repo-root>
npm run dump-assertions -- --file <syntax-test-file> --line <lineNumber>
# or
npm run dump-assertions -- --file <syntax-test-file> --range <startLine:startColumn-endLine:endColumn>

# From outside this repo:

# first compile:
cd <this-repo-root> && npm run compile

# then invoke it from anywhere:
cd <anywhere>
node <this-repo-root>/out/cli.js --file <syntax-test-file> <...>
```

### Arguments and Options

Required:

- `--file <syntax-test-file>` points to the syntax test file.
- At least one target is required: `--line` and/or `--range`.

Targets:

- `--line <lineNumber>` generates assertions for a line containing source text. 1-based. You can repeat it.
- `--range <startLine:startColumn-endLine:endColumn>` generates assertions for a selected range using 1-based inclusive columns. You can repeat it too.
- You can specify both at the same time.

Grammar loading:

- `--config <package.json>` loads grammars from a grammar package manifest. If you omit it, the CLI searches upward from `--file` for a `package.json` with `contributes.grammars`.
- `--provider-command <command>` runs the command and loads the returned grammars.
- `--provider-cwd <cwd>` sets the provider working directory. If omitted, the CLI runs the provider from `${projectRoot}` for `--file`.
- `--provider-scope <scope>` is repeatable and limits provider execution to exact syntax-test header scope matches.
- `--provider-timeout-ms <ms>` sets the provider timeout; the CLI fails if the provider does not finish in time.

Render options:

- `--scope-mode <full|minimal>` controls full vs minimal rendering.
- `--compact-ranges` enables disjoint caret compaction. Enabled by default.
- `--no-compact-ranges` disables disjoint caret compaction.

Output options:

- `--json` prints structured JSON output. This is the default.
- `--plain` prints only the generated assertion lines.
- `--compare` prints the source line plus both `minimal` and `full` assertion blocks in plain text.
- `--log-level <silent|info|debug>` prints CLI diagnostics to stderr.

Notes:

- The CLI prints to stdout and never modifies the file.
- With `--log-level info`, the CLI logs a short summary similar to the extension Output panel. `--log-level debug` also logs the effective grammar-usage trace used for assertion generation.
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

## Development

### Testing

Run `npm test`.

### Fixture

This repo also includes a minimal fixture grammar under `fixtures/simple-grammar`.

To try it inside this repo workspace:

1. Start the `Run Extension` debug configuration from VS Code's Run and Debug view.
2. In the Extension Host window, open `fixtures/simple-grammar/tests/example.simple-poc`.
3. Try the extension features: CodeLens above source lines, Code Actions on a selection, command-palette commands, Testing UI gutter, etc.
