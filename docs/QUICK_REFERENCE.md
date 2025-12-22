# Quick Reference: Code Chunking

## Current Implementation

### Line-Based Chunking
**File**: `src/core/indexing/textChunker.ts`

```typescript
// Default settings
const DEFAULT_MAX_LINES = 60;        // ~800-1000 tokens
const DEFAULT_OVERLAP_LINES = 10;    // Context overlap

// Usage
const chunks = chunkText(fileContent, {
  maxLines: 60,
  overlapLines: 10
});

// Result
interface TextChunk {
  text: string;           // Chunk content
  chunkIndex: number;     // Chunk number
  startLine: number;      // Starting line
  endLine: number;        // Ending line
}
```

### Performance
- **Speed**: 1-5ms per file
- **Blocking**: No
- **Accuracy**: ~4 chars = 1 token

## Configuration

### In fileEmbeddingPipeline.ts

```typescript
const config: EmbeddingPipelineConfig = {
  chunkingConfig: {
    maxLines: 60,        // Adjust chunk size
    overlapLines: 10     // Adjust overlap
  },
  embeddingBatchSize: 10,
  pineconeUpsertBatchSize: 50
};
```

## Vector Metadata

```typescript
interface VectorMetadata {
  repoId: string;        // Repository ID
  filePath: string;      // File path
  chunkIndex: number;    // Chunk index
  startLine?: number;    // Starting line (NEW)
  endLine?: number;      // Ending line (NEW)
  source?: string;       // "repomix"
  textHash?: string;     // SHA256 hash
  updatedAt?: string;    // ISO timestamp
}
```

## Tree-Sitter (Future)

### Setup
```bash
npm run setup:treesitter
```

### Service
**File**: `src/core/indexing/treeSitterService.ts`

```typescript
import { treeSitterService } from './treeSitterService';

// Language detection
const lang = TreeSitterService.detectLanguage('file.ts');
// Returns: 'typescript'

// Supported languages
const languages = ['javascript', 'typescript', 'python', 'rust', 'csharp', 'dart'];
```

### Future: Semantic Chunking
```typescript
// When implemented
const symbols = await treeSitterService.extractSymbols(code, 'typescript');
// Returns: CodeSymbol[] with functions, classes, methods
```

## Common Tasks

### Adjust Chunk Size
Edit `textChunker.ts`:
```typescript
const DEFAULT_MAX_LINES = 80;  // Increase for larger chunks
```

### Add Language Support
1. Update `LANGUAGES` in `scripts/setup-treesitter.mjs`
2. Update `TreeSitterService.detectLanguage()`
3. Update `TreeSitterService.getExtensionForLanguage()`
4. Run `npm run setup:treesitter`

### Debug Chunking
```typescript
// In fileEmbeddingPipeline.ts
console.log(`[EMBEDDING_PIPELINE] Chunking completed in ${chunkDuration}ms, generated ${chunks.length} chunks`);

// Check chunk metadata
chunks.forEach(chunk => {
  console.log(`Chunk ${chunk.chunkIndex}: lines ${chunk.startLine}-${chunk.endLine}`);
});
```

## Troubleshooting

### Extension Freezing
- ✅ Fixed by line-based chunking
- If still freezing, check for other blocking operations

### Language Not Detected
Check file extension in `TreeSitterService.detectLanguage()`

### WASM Files Missing
```bash
npm run setup:treesitter
```

## Performance Targets

| Operation | Target | Current |
|-----------|--------|---------|
| Chunk per file | <10ms | 1-5ms ✓ |
| Embed per chunk | <100ms | Varies |
| Total per file | <500ms | Varies |

## Related Files

- `src/core/indexing/textChunker.ts` - Chunking logic
- `src/core/indexing/fileEmbeddingPipeline.ts` - Pipeline
- `src/core/indexing/treeSitterService.ts` - Language support
- `scripts/setup-treesitter.mjs` - Setup script
- `docs/TREE_SITTER_SETUP.md` - Full documentation

## Links

- [Tree-sitter Docs](https://tree-sitter.github.io/)
- [TREE_SITTER_SETUP.md](./TREE_SITTER_SETUP.md)
- [CHUNKING_MIGRATION.md](./CHUNKING_MIGRATION.md)

