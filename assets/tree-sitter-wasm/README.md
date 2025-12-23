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

Parsers are downloaded from official tree-sitter GitHub releases:
- **Primary Source**: GitHub Releases (https://github.com/tree-sitter/)
- **Fallback**: NPM packages (https://www.npmjs.com/search?q=tree-sitter-)

### C# Parser Special Notes

The C# parser (tree-sitter-c-sharp) is available from GitHub releases but may require manual setup:
- GitHub: https://github.com/tree-sitter/tree-sitter-c-sharp/releases
- NPM: https://www.npmjs.com/package/tree-sitter-c-sharp
- If download fails, use token-based code chunking as fallback

## Notes

- WASM files are kept in distribution but not committed to git
- Parsers are downloaded from official tree-sitter GitHub releases (primary) or unpkg (fallback)
- Each parser is language-specific and optimized for that language
- C# and Dart parsers are sourced from unpkg since they don't have GitHub WASM releases
- The manifest.json file contains metadata about all available parsers
