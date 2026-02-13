# Repository Guidelines

## Project Structure & Module Organization
- `src/extension.ts` is the extension entrypoint.
- `src/commands/` contains VS Code command handlers.
- `src/core/` holds core services (bundles, files, indexing, storage, patching).
- `src/webview/` contains the React-based control panel (`components/`, `controllers/`, `handlers/`).
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

## AST Compression Utility
- Core module: `src/core/compression/` (separate from indexing tree-sitter logic).
- API entrypoint: `compressFile(filePath, fileContent)` from `src/core/compression/index.ts`.
- Supported now: TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`).
- Output: AST-derived code skeleton (imports, signatures, interfaces/types/classes) with bodies removed; returns `null` on unsupported language or parser/WASM failure.
- WASM lookup order: configured parser path, `dist/tree-sitter-wasm/`, then `assets/tree-sitter-wasm/`.
- Manual verification command: run `Repomix: Test Compression` (`repomixRunner.testCompression`) on the active editor file to open compressed output beside the source.

## Coding Style & Naming Conventions
- Language: TypeScript with React for webview UI.
- Formatting: Prettier (`.prettierrc`) with 2-space indentation, single quotes, semicolons, 100-char line width.
- Linting: ESLint (`eslint.config.mjs`); follow `eqeqeq`, `curly`, and no throw-literal warnings.
- Naming: use `camelCase` for variables/functions, `PascalCase` for classes/components, descriptive file names (for example, `BundleController.ts`, `repoIndexer.ts`).

## Testing Guidelines
- Framework stack: Mocha + `@vscode/test-electron` (`vscode-test` command).
- Keep tests under `src/test/**` and name files `*.test.ts`.
- Prefer focused unit tests near feature areas (for example, `src/test/core/indexing/repoIndexer.test.ts`).
- Before opening a PR, run: `npm run check-types && npm run lint && npm run test`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(scope): ...`, `fix: ...`, `docs(...): ...`, `refactor: ...`.
- Keep commits focused and logically grouped; avoid mixing refactors with behavior changes.
- PRs should include: concise description, linked issue (if applicable), testing notes, and screenshots/GIFs for webview or UX changes.
- If packaging/version changes are included, mention resulting artifact changes explicitly.
