# Tree-sitter WASM Parsers

This directory contains WASM binaries for tree-sitter language parsers.

## Supported Languages
- javascript
- typescript
- python
- rust
- csharp
- dart

## Usage

These parsers are used for semantic code chunking and analysis in the repomix-runner extension.

## Updating Parsers

Run the setup script to download the latest parsers:
```bash
npm run setup:treesitter
```

## Download Sources

Parsers are downloaded from:
- **Primary Source**: GitHub Releases (https://github.com/tree-sitter/) - for JS, TS, Python, Rust
- **Secondary Source**: tree-sitter-wasms package (https://unpkg.com/tree-sitter-wasms/) - for C#, Dart

### C# and Dart Parser Notes

These parsers are sourced from the tree-sitter-wasms package which provides
web-tree-sitter compatible WASM files built with the correct ABI version.

## Notes

- WASM files are kept in assets/ to persist across builds
- Parsers are language-specific and optimized for each language
- web-tree-sitter version must be compatible with WASM file ABI version
- The manifest.json file contains metadata about all available parsers
- See: https://github.com/tree-sitter/tree-sitter/issues/5171 for ABI compatibility info
