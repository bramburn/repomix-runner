# Repository Guidelines

## Project Structure & Module Organization
- `src/extension.ts` is the extension entrypoint.
- `src/commands/` contains VS Code command handlers.
- `src/core/` holds core services (bundles, files, indexing, storage, patching, compression).
- `src/chat/` contains the HITL chat workflow (graph, nodes, queue, batch, compression, architecture, db).
- `src/webview/` contains the React-based control panel (`components/`, `controllers/`, `handlers/`).
- `src/agent/` contains the smart repomix graph used by command + webview agent flows.
- `src/test/` contains automated tests; `src/test/test-workspace/` provides fixture files.
- `assets/` stores icons/media and Tree-sitter assets; `scripts/` contains packaging/setup utilities.
- `rust/` contains the optional Rust binary build used by packaging workflows.

## Build, Test, and Development Commands
- `npm run watch`: run esbuild + TypeScript watch mode for local development.
- `npm run compile`: type-check, lint, and build to `dist/`.
- `npm run package`: production build for extension packaging.
- `npm run test`: run VS Code extension tests (`vscode-test`).
- `npm run lint`: run ESLint on `src/`.
- `npm run check-types`: run TypeScript checks without emitting files.
- `npm run package:vsix`: create a `.vsix` in `bin/`.
- `npm run build:rust`: build the Rust helper binary when needed.
- `npm run test:compression`: run compression diagnostic test harness.
- `npm run diagnose:compression`: run parser/wasm compression diagnostics.

## AST Compression Utility
- Core module: `src/core/compression/` (separate from indexing tree-sitter logic).
- API entrypoints: `compressFile(...)`, `compressFileWithTokens(...)`, `isSupportedExtension(...)` from `src/core/compression/index.ts`.
- Supported now: TypeScript/JavaScript (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`), Dart (`.dart`), Python (`.py`), C# (`.cs`), Rust (`.rs`).
- Output: AST-derived code skeleton with body replacement; returns `null` on unsupported language or parser/WASM failure.
- `CompressionOptions.keepNames` preserves full source for selected symbols while compressing everything else.
- WASM lookup order: configured parser path, `dist/tree-sitter-wasm/`, then `assets/tree-sitter-wasm/`.
- Manual verification command: run `Repomix: Test Compression` (`repomixRunner.testCompression`) on the active editor file to open compressed output beside the source.

## AI Chat & HITL Workflow
- Main graph: `createHitlChatGraph(...)` in `src/chat/graph.ts`.
- Flow includes: context gathering, compression, goal review, package approval, batch submission/polling, edit review, apply, optional review loop, summary, memory extraction.
- Queue and lifecycle: `src/chat/queue/*` and webview queue commands (`chatSubmit`, `chatForceSubmit`, `chatStop`, `chatClearQueue`, etc.).
- Persistence: PostgreSQL-backed thread/memory/batch/architecture storage in `src/chat/db/*`.

## Coding Style & Naming Conventions
- Language: TypeScript with React for webview UI.
- Formatting: Prettier (`.prettierrc`) with 2-space indentation, single quotes, semicolons, 100-char line width.
- Linting: ESLint (`eslint.config.mjs`); follow `eqeqeq`, `curly`, and no throw-literal warnings.
- Naming: use `camelCase` for variables/functions, `PascalCase` for classes/components, descriptive file names (for example, `BundleController.ts`, `repoIndexer.ts`).

## Testing Guidelines
- Framework stack: Mocha + `@vscode/test-electron` (`vscode-test` command).
- Keep tests under `src/test/**` and name files `*.test.ts`.
- Prefer focused unit tests near feature areas (chat compression, queue, batch parsing, architecture, message schemas).
- Before opening a PR, run: `npm run check-types && npm run lint && npm run test`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(scope): ...`, `fix: ...`, `docs(...): ...`, `refactor: ...`.
- Keep commits focused and logically grouped; avoid mixing refactors with behavior changes.
- PRs should include: concise description, linked issue (if applicable), testing notes, and screenshots/GIFs for webview or UX changes.
- If packaging/version changes are included, mention resulting artifact changes explicitly.

## Tools Available

### ast-grep (sg)
A CLI tool for code structural search, lint, and rewrite across many languages.

**Installation:** `brew install ast-grep`

**When to use:**
- Search for code patterns using AST matching (not just text search)
- Find specific code structures like function calls, class definitions, imports
- Refactor code patterns across multiple files
- Lint for specific code patterns

**Common Commands:**
- `sg -p 'console.log($ARGS)'` - Find all console.log calls
- `sg -p 'import $NAME from "lodash"'` - Find lodash imports
- `sg -p 'function $NAME($$$ARGS) { $$$BODY }'` - Match function patterns
- `sg -p '$A && $A()' -l ts` - Find redundant logical AND in TypeScript
- `sg scan --rule rule.yml` - Run a rule file

**Key Flags:**
- `-p` or `--pattern`: Pattern to search
- `-l` or `--lang`: Language filter (ts, js, python, etc.)
- `-r` or `--rewrite`: Rewrite matched code
- `-i` or `--interactive`: Interactive mode
- `--json`: Output as JSON for parsing

**Pattern Syntax:**
- `$VAR` - Meta variable (matches any single node)
- `$$$VAR` - Multi-meta variable (matches multiple nodes)
- Use concrete syntax for the language you're searching
