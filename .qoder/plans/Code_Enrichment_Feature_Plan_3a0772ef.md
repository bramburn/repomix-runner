# Code Enrichment Feature Implementation Plan

## Overview
Add ability to pre-generate LLM summaries for methods/classes and inject them as enriching comments during AST compression (e.g., `getDimensions(): number { ... } // Returns the embedding dimension size...`).

## Architecture Design

### 1. Database Schema Extension (`src/chat/db/migrations/003_code_enrichment.sql`)

Create new table to store symbol-level summaries:

```sql
CREATE TABLE code_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL CHECK (symbol_type IN ('function', 'method', 'class', 'interface', 'type')),
  summary TEXT NOT NULL,
  signature TEXT NOT NULL,  -- full function/method signature for matching
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  git_commit TEXT,
  UNIQUE(file_path, symbol_name, repo_id)
);
CREATE INDEX idx_enrichments_file ON code_enrichments(file_path, repo_id);
CREATE INDEX idx_enrichments_symbol ON code_enrichments(symbol_name, repo_id);
```

### 2. Repository Layer (`src/chat/db/enrichmentRepository.ts`)

CRUD operations for code enrichments:
- `createEnrichment()` / `upsertEnrichment()` 
- `findByFilePath()` - get all enrichments for a file
- `findBySymbol()` - lookup by file + symbol name
- `deleteByFilePath()` - cleanup on re-index
- `findStale()` - find enrichments needing refresh based on git commit

### 3. LangGraph Workflow for Enrichment Generation

#### State Definition (`src/chat/enrichment/state.ts`)
```typescript
import { Annotation } from '@langchain/langgraph';

export const EnrichmentState = Annotation.Root({
  repoId: Annotation<string>,
  filePaths: Annotation<string[]>,
  currentFileIndex: Annotation<number>,
  currentFile: Annotation<string>,
  symbolsToSummarize: Annotation<Array<{name: string, type: string, signature: string}>>,
  currentSymbolIndex: Annotation<number>,
  generatedSummaries: Annotation<Array<{
    symbolName: string;
    symbolType: string;
    summary: string;
    signature: string;
  }>>,
  errors: Annotation<string[]>({
    reducer: (s, a) => s.concat(a),
    default: () => [],
  }),
});
```

#### Graph Nodes (`src/chat/enrichment/nodes.ts`)
1. **extractSymbolsNode**: Use TreeSitter to extract all methods/functions/classes from file
2. **filterExistingEnrichmentsNode**: Check DB for existing summaries, filter to only new/changed symbols
3. **generateSummaryNode**: LLM call to generate summary for single symbol (uses queue for rate limiting)
4. **saveEnrichmentsNode**: Batch insert/update generated summaries to DB
5. **advanceToFileNode**: Move to next file in queue
6. **advanceToSymbolNode**: Move to next symbol in current file

#### Graph Definition (`src/chat/enrichment/graph.ts`)
```typescript
const workflow = new StateGraph(EnrichmentState)
  .addNode('extractSymbols', extractSymbolsNode)
  .addNode('filterExisting', filterExistingEnrichmentsNode)
  .addNode('generateSummary', generateSummaryNode)
  .addNode('saveEnrichments', saveEnrichmentsNode)
  .addNode('advanceToFile', advanceToFileNode)
  .addNode('advanceToSymbol', advanceToSymbolNode)
  
  .addEdge('__start__', 'extractSymbols')
  .addEdge('extractSymbols', 'filterExisting')
  .addConditionalEdges('filterExisting', (state) => {
    return state.symbolsToSummarize.length > 0 ? 'generateSummary' : 'advanceToFile';
  })
  .addEdge('generateSummary', 'saveEnrichments')
  .addEdge('saveEnrichments', 'advanceToSymbol')
  .addConditionalEdges('advanceToSymbol', (state) => {
    return state.currentSymbolIndex < state.symbolsToSummarize.length 
      ? 'generateSummary' 
      : 'advanceToFile';
  })
  .addConditionalEdges('advanceToFile', (state) => {
    return state.currentFileIndex < state.filePaths.length 
      ? 'extractSymbols' 
      : '__end__';
  });
```

### 4. Integration with Compression Engine

#### Modify Compression Options (`src/core/compression/types.ts`)
```typescript
export interface CompressionOptions {
  keepNames?: string[];
  enableEnrichment?: boolean;  // NEW: whether to add enrichment comments
  repoId?: string;              // NEW: for DB lookup
}
```

#### Create Enrichment Injector (`src/core/compression/enrichmentInjector.ts`)
New file that:
1. Queries DB for enrichments matching current file
2. During AST compression, matches symbols by name/signature
3. Appends `// {summary}` comment after function/method signatures
4. Handles edge cases (missing enrichment, multiple matches)

Key functions:
- `loadEnrichmentsForFile(filePath, repoId): Promise<Map<string, CodeEnrichment>>`
- `injectEnrichment(signature: string, summary: string): string` - appends comment
- `modifyBodyReplacement(capture, strategy, enrichments): BodyReplacement` - wraps existing replacement with enrichment

#### Update compressFile (`src/core/compression/compressFile.ts`)
```typescript
export async function compressFile(
  filePath: string,
  fileContent: string,
  options?: CompressionOptions
): Promise<string | null> {
  // ... existing code ...
  
  // NEW: Load enrichments if enabled
  const enrichments = options?.enableEnrichment && options?.repoId
    ? await loadEnrichmentsForFile(filePath, options.repoId)
    : new Map();
  
  let result = fileContent;
  for (const capture of rawCaptures) {
    let replacement = strategy.getBodyReplacement(capture, { sourceCode: fileContent }, options);
    
    // NEW: Inject enrichment comment if available
    if (replacement && enrichments.size > 0) {
      replacement = injectEnrichmentIntoReplacement(capture, replacement, enrichments);
    }
    
    // ... rest of existing logic ...
  }
}
```

### 5. Background Job Trigger

#### Add to Indexing Service (`src/core/indexing/backgroundIndexingService.ts`)
After successful indexing completes:
```typescript
async function triggerEnrichmentGeneration(repoId: string, indexedFiles: string[]) {
  // Spawn background graph execution
  const graph = createEnrichmentGraph(extensionContext, pgPool);
  
  const config = {
    configurable: {
      thread_id: `enrichment-${repoId}-${Date.now()}`,
    },
  };
  
  const initialState = {
    repoId,
    filePaths: indexedFiles.filter(f => isSupportedExtension(f)),
    currentFileIndex: 0,
    currentSymbolIndex: 0,
  };
  
  // Run without awaiting (fire-and-forget with error handling)
  graph.invoke(initialState, config).catch(err => {
    logger.both.error('Enrichment generation failed:', err);
  });
}
```

### 6. Configuration Settings

#### Add to package.json
```json
"repomix.enrichment.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable AI-powered code enrichment during compression"
},
"repomix.enrichment.autoGenerate": {
  "type": "boolean", 
  "default": true,
  "description": "Automatically generate enrichments after indexing"
}
```

### 7. UI Controls (Optional Future Enhancement)

Settings UI toggle for enable/disable
Status indicator showing enrichment generation progress
Manual trigger command: `Repomix: Generate Code Enrichments`

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. ✅ Create database migration and repository layer
2. ✅ Implement LangGraph state and nodes
3. ✅ Build enrichment generation graph
4. ✅ Test standalone enrichment workflow

### Phase 2: Integration (Week 2)
1. ✅ Add compression options and enrichment injector
2. ✅ Modify compressFile to support enrichment injection
3. ✅ Integrate with background indexing service
4. ✅ Add configuration settings

### Phase 3: Testing & Refinement (Week 3)
1. ✅ End-to-end testing with real codebases
2. ✅ Performance optimization (batch DB operations, parallel symbol processing)
3. ✅ Error handling and recovery mechanisms
4. ✅ Documentation and examples

## Key Technical Considerations

### Symbol Matching Strategy
- Primary match: `symbol_name` + `file_path` composite key
- Fallback match: fuzzy signature comparison (handle whitespace changes)
- Invalidation: git commit hash change triggers re-summarization

### LLM Queue Integration
- Reuse existing `llmClient.ts` queue from HITL workflow
- Rate limit: 10 requests/minute to avoid API throttling
- Retry logic: exponential backoff on failures
- Structured output schema for consistent summary format

### Performance Optimization
- Batch DB inserts using array operations
- Parallel file processing (up to 5 files concurrently)
- Incremental updates (only changed symbols)
- Cache loaded enrichments per session

### Edge Cases to Handle
- Symbols with identical names in same file (different scopes)
- Anonymous functions (skip enrichment)
- Exported vs non-exported symbols (prioritize exported)
- Very long summaries (truncate to 140 chars)

## Success Metrics
- Enrichment coverage: % of compressible symbols with summaries
- Token overhead: enrichment comments should add <10% to compressed size
- User value: qualitative feedback on comprehension improvement
- Performance: background generation shouldn't block indexing completion

## Files to Create/Modify Summary

**New Files:**
- `src/chat/db/migrations/003_code_enrichment.sql`
- `src/chat/db/enrichmentRepository.ts`
- `src/chat/enrichment/state.ts`
- `src/chat/enrichment/nodes.ts`
- `src/chat/enrichment/graph.ts`
- `src/core/compression/enrichmentInjector.ts`

**Modified Files:**
- `src/core/compression/types.ts` - add enrichment options
- `src/core/compression/compressFile.ts` - integrate enrichment injection
- `src/core/indexing/backgroundIndexingService.ts` - trigger enrichment generation
- `package.json` - add configuration properties
- `src/webview/components/SettingsTab.tsx` - add UI toggles (optional)
