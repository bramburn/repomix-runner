# Compression Module Guidelines

## Purpose

- Build AST-based skeletons for context compression and semantic-folding workflows.
- Support selective full-code retention via `CompressionOptions.keepNames`.
- Stay independent from indexing tree-sitter logic in `src/core/indexing/treeSitterService.ts`.

## Public API

- `compressFile(filePath, fileContent, options?)` in `compressFile.ts`
- `compressFileWithTokens(filePath, fileContent, options?)` for token-aware callers
- `isSupportedExtension(filePath)` and `getSupportedExtensions()`
- Re-exported via `src/core/compression/index.ts`

## Supported Languages and Extensions

- TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`
- JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs` (uses TypeScript grammar/query strategy)
- Dart: `.dart`
- Python: `.py`
- C#: `.cs`
- Rust: `.rs`

## Architecture

- `compressFile.ts`: language detection, query capture iteration, replacement assembly, token helpers.
- `LanguageParser.ts`: Tree-sitter init, parser/query/language caching, WASM path resolution.
- `queries/`: language capture queries.
- `strategies/`: per-language parsing/replacement strategy implementations.
- `types.ts`: contracts (`ParseStrategy`, `CompressionOptions`, capture/replacement types).

## Query and Strategy Contract

Use `@definition.*` tags expected by strategies:
- `@definition.import`
- `@definition.class`
- `@definition.function`
- `@definition.method`
- `@definition.interface`
- `@definition.enum`
- `@definition.type`
- `@definition.module`

Keep query captures and strategy handling aligned; if you add/remove tags, update `types.ts` and affected strategies.

## WASM Resolution

Lookup order in `LanguageParser.resolveWasmPath(...)`:
1. configured parser path via `setWasmDirectory(...)`
2. `dist/tree-sitter-wasm/` (runtime)
3. `assets/tree-sitter-wasm/` (fallback)

Return `null` from compression APIs only on unsupported language or parser/query/WASM/runtime failure so callers can fall back gracefully.

## Behavior Rules

- Process captures in reverse order to preserve replacement offsets.
- For `keepNames` matches, preserve full node text.
- Skip nested duplicate emission by relying on capture/replacement bounds.
- If no captures are found for a supported language, return original content (not `null`).
- If captures exist but no body replacement applies, return original content (not `null`).

## Workflow: Add a New Language

1. Add query in `queries/` (e.g., `queryGo.ts`).
2. Add strategy in `strategies/` (e.g., `GoParseStrategy.ts`) extending `BaseParseStrategy`.
3. Register language config in `LanguageParser.ts` (`wasmFile`, `query`, `strategy`).
4. Extend `detectLanguage(...)` and extension map in `compressFile.ts`.
5. Add parser WASM under `assets/tree-sitter-wasm/` and ensure packaging includes it.

## Validation

- Manual: run `Repomix: Test Compression` (`repomixRunner.testCompression`) from an active editor.
- Pre-commit checks:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test`
