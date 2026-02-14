# Compression Module Guidelines

## Purpose
- This module builds AST-based skeletons for LLM context compression.
- It supports selective full-code retention via `keepNames`.
- Keep this module separate from `src/core/indexing/treeSitterService.ts`.

## Supported Languages
- **TypeScript/JavaScript**: Uses `typescript.wasm` and `TypeScriptParseStrategy`.
- **Dart**: Uses `dart.wasm` and `DartParseStrategy`.
- **Python**: Uses `python.wasm` and `PythonParseStrategy` (handles decorators and indentation).
- **C#**: Uses `csharp.wasm` and `CsharpParseStrategy` (handles namespaces and properties).
- **Rust**: Uses `rust.wasm` and `RustParseStrategy` (handles structs, impls, and traits).

## Public API
- Entrypoint: `compressFile(filePath, fileContent, options?)` in `compressFile.ts`.
- Exported options type: `CompressionOptions` from `index.ts`.
- `CompressionOptions.keepNames` accepts identifiers (for example `['MyClass', 'calculateTotal']`) that should remain full source.

## Query Guidelines

The module uses Tree-sitter queries to identify nodes for compression. Queries use a specific set of tags that the `ParseStrategy` implementations expect:

- `@definition.import`: Matches import/using/require statements. Usually preserved in full or slightly cleaned.
- `@definition.class`: Matches class, struct, record, or mixin definitions. Strategies typically extract the header and collapse the body.
- `@definition.function`: Matches top-level function definitions. Strategies extract the signature and collapse the body.
- `@definition.method`: Matches methods within classes or interfaces.
- `@definition.interface`: Matches interface definitions.
- `@definition.enum`: Matches enum definitions.
- `@definition.type`: Matches type aliases or typedefs.
- `@definition.module`: Matches namespaces or module declarations.

### Writing Effective Queries
- **Group nodes**: Use `[ (node_type) ... ]` to group multiple node types under the same tag.
- **Specific nodes**: Target the most relevant nodes to avoid over-capturing. For example, in Python, `(decorated_definition)` is captured to include decorators, and the strategy then resolves whether it wraps a class or a function.
- **Tagging**: Always use the `@definition.*` tags defined in `CaptureType` ([`src/core/compression/types.ts`](src/core/compression/types.ts)).

## Workflow: Adding a New Language

1.  **Create Query**: Add a new query file in `queries/` (e.g., `queryGo.ts`). Use Tree-sitter tags like `@definition.import`, `@definition.class`, `@definition.function`.
2.  **Create Strategy**: Add a new strategy file in `strategies/` (e.g., `GoParseStrategy.ts`) extending `BaseParseStrategy`. Implement `parseCapture` and `extractNodeName`.
3.  **Register Language**: 
    - In `LanguageParser.ts`, import the new query and strategy.
    - Instantiate the strategy as a singleton.
    - Add a new entry to the `configs` record with the `wasmFile`, `query`, and `strategy`.
4.  **Enable Detection**: 
    - In `compressFile.ts`, update the `detectLanguage` function's return type and the `languageByExtension` map to include the new extension.
5.  **Provide WASM**: Ensure the corresponding `.wasm` parser is available in `assets/tree-sitter-wasm/`.

## Workflow: Editing/Removing a Language

- **Edit**: Modify the query in `queries/` or the logic in the corresponding `strategies/` file.
- **Remove**: 
    - Delete the query and strategy files.
    - Remove the registration from `LanguageParser.ts`.
    - Remove the extension mapping from `detectLanguage` in `compressFile.ts`.

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
