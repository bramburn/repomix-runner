# Tree-sitter Setup Guide

## Overview

This project uses tree-sitter for semantic code parsing and analysis. Tree-sitter provides language-aware parsing capabilities that enable intelligent code chunking and analysis.

## Current Status

- **Line-based chunking**: Currently implemented for fast, non-blocking code chunking
- **Tree-sitter infrastructure**: Set up and ready for future semantic chunking
- **WASM parsers**: Infrastructure in place to download and manage language parsers

## Supported Languages

The following languages are supported for future semantic analysis:

- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Python (`.py`)
- Rust (`.rs`)
- C# (`.cs`)
- Dart (`.dart`)

## Setup Instructions

### 1. Initialize Tree-sitter WASM Files

To set up the tree-sitter WASM parsers:

```bash
npm run setup:treesitter
```

This command will:
- Create the `dist/tree-sitter-wasm` directory
- Generate a manifest of available parsers
- Create documentation for future reference

### 2. WASM Files Location

WASM files are stored in:
```
dist/tree-sitter-wasm/
├── manifest.json          # List of available parsers
├── README.md              # Parser documentation
└── [language].wasm        # Language-specific WASM binaries (when downloaded)
```

### 3. Git Handling

WASM files are **not committed to git** because:
- They are large binary files
- They can be regenerated from the setup script
- They are specific to the build environment

The `.gitignore` file includes:
```
dist/tree-sitter-wasm
```

## Architecture

### Current Implementation

**File**: `src/core/indexing/textChunker.ts`

Uses line-based chunking:
- Fast and non-blocking
- Respects line boundaries
- Default: 60 lines per chunk with 10-line overlap
- Suitable for all code types

### Future Implementation

**File**: `src/core/indexing/treeSitterService.ts`

Provides infrastructure for semantic chunking:
- Language detection from file extensions
- Symbol extraction (functions, classes, methods)
- Semantic-aware chunk boundaries
- Will be enabled when performance allows

## Configuration

### Chunking Configuration

In `src/core/indexing/fileEmbeddingPipeline.ts`:

```typescript
interface EmbeddingPipelineConfig {
  chunkingConfig?: ChunkingConfig;
  embeddingBatchSize?: number;
  pineconeUpsertBatchSize?: number;
}

interface ChunkingConfig {
  maxLines?: number;      // Default: 60
  overlapLines?: number;  // Default: 10
}
```

## Development

### Adding a New Language

1. Add language to `LANGUAGES` in `scripts/setup-treesitter.mjs`
2. Update `TreeSitterService.getExtensionForLanguage()`
3. Update `TreeSitterService.detectLanguage()`
4. Run `npm run setup:treesitter`

### Implementing Semantic Chunking

When ready to implement semantic chunking:

1. Download WASM files: `npm run setup:treesitter`
2. Implement `TreeSitterService.extractSymbols()`
3. Create semantic chunking function
4. Update `fileEmbeddingPipeline.ts` to use semantic chunking
5. Test with various code samples

## Performance Notes

- **Line-based chunking**: ~1-5ms per file
- **Token-based chunking** (removed): ~50-200ms per file (blocking)
- **Semantic chunking** (future): ~10-50ms per file (with WASM)

## Troubleshooting

### WASM Files Not Found

If you see errors about missing WASM files:

```bash
npm run setup:treesitter
```

### Language Not Detected

Check that the file extension is in the supported list:
- `.js`, `.jsx` → JavaScript
- `.ts`, `.tsx` → TypeScript
- `.py` → Python
- `.rs` → Rust
- `.cs` → C#
- `.dart` → Dart

## References

- [Tree-sitter Documentation](https://tree-sitter.github.io/)
- [Tree-sitter Language Parsers](https://github.com/tree-sitter)
- [WASM in Node.js](https://nodejs.org/en/docs/guides/nodejs-performance-getting-started/)

