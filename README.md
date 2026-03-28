# TM Grammar Test Tools

Proof-of-concept VS Code extension for generating caret assertions in TextMate syntax tests.

## Current POC flow

1. Open a syntax test file whose first line matches:

   ```text
   <comment token> SYNTAX TEST "<language scope>" "optional description"
   ```

2. Run `TM Grammar Test Tools: Insert Caret Assertions For Current Line`.
3. The extension:
   - parses the header
   - finds the nearest `package.json` above the active file that contributes grammars
   - merges those local grammars with grammars contributed by installed VS Code extensions
   - tokenizes source lines from the start of the test through the active source line
   - inserts or replaces the contiguous assertion block directly below that line

## Notes

- Existing assertion lines are skipped during tokenization so rule state is preserved across source lines.
- First-column tokens are emitted with the `<---` syntax when needed so offsets stay correct for the existing test runner.
- If your syntax test is not inside the grammar extension repo, set `tmGrammarTestTools.configPath` to the relevant `package.json`.
- This is important for injection-grammar repos: the local repo can contribute the injection grammar while VS Code supplies the base language grammar, such as `source.js`.

## Fixture

This repo also includes a minimal fixture grammar under `fixtures/simple-grammar`.

To try the POC inside this workspace:

1. Press `F5` to launch the extension host.
2. Open `fixtures/simple-grammar/tests/example.simple-poc`.
3. Place the cursor on a source line and run `TM Grammar Test Tools: Insert Caret Assertions For Current Line`.
