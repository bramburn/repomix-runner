# Compression Module Guidelines

## Purpose
- This module builds AST-based skeletons for LLM context compression.
- It supports selective full-code retention via `keepNames`.
- Keep this module separate from `src/core/indexing/treeSitterService.ts`.

## Public API
- Entrypoint: `compressFile(filePath, fileContent, options?)` in `compressFile.ts`.
- Exported options type: `CompressionOptions` from `index.ts`.
- `CompressionOptions.keepNames` accepts identifiers (for example `['MyClass', 'calculateTotal']`) that should remain full source.

## Selective Compression Rules
- For captures matching `keepNames`, return full node text.
- For non-matching captures, return compressed skeleton text (signatures/interfaces/imports).
- Hierarchy cursor logic in `compressFile` tracks processed ranges.
- If a parent capture is emitted, nested captures are skipped to avoid duplication.

## Architecture
- `LanguageParser.ts`: Tree-sitter init, language/query caching, WASM path resolution.
- `queries/`: language capture queries.
- `strategies/`: per-language parse strategies.
- `types.ts`: contracts (`ParseStrategy`, `CompressionOptions`, capture/chunk types).

## WASM Requirements
- Parsers are loaded from configured path, then `dist/tree-sitter-wasm/`, then `assets/tree-sitter-wasm/`.
- On parser/query/WASM failures, return `null` from `compressFile` so callers can fall back to raw content.

## Agent Integration
- Tier-B context optimization should call `compressFile(file.path, file.content, { keepNames: [] })`.
- Future selective retention can wire `keepNames` from planner/LLM state.

## Validation
- Manual: run `Repomix: Test Compression` (`repomixRunner.testCompression`) and enter optional keep name.
- Pre-commit checks:
  - `npm run check-types`
  - `npm run lint`
