# Architecture Diagram: Code Chunking & Embedding Pipeline

## Current Flow (Line-Based Chunking)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Repository Indexing                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              IndexingController.handleIndexRepo()               │
│  - Get repository files                                         │
│  - Resolve API keys                                             │
│  - Create RepoEmbeddingOrchestrator                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         RepoEmbeddingOrchestrator.embedRepository()             │
│  - Fetch files from database                                    │
│  - Process each file sequentially                               │
│  - Track progress                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        embedAndUpsertFile() - For Each File                     │
│                                                                 │
│  1. Read file content (async)                                   │
│  2. Chunk content (FAST - 1-5ms)                                │
│  3. Embed chunks (async)                                        │
│  4. Upsert to Pinecone (async)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              chunkText() - Line-Based Chunking                  │
│                                                                 │
│  Input:  File content (string)                                  │
│  Config: maxLines=60, overlapLines=10                           │
│                                                                 │
│  Process:                                                       │
│  ├─ Split by newlines                                           │
│  ├─ Group into 60-line chunks                                   │
│  ├─ Add 10-line overlap                                         │
│  └─ Track startLine, endLine                                    │
│                                                                 │
│  Output: TextChunk[]                                            │
│  ├─ text: string                                                │
│  ├─ chunkIndex: number                                          │
│  ├─ startLine: number                                           │
│  └─ endLine: number                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         EmbeddingService.embedTexts() - Batch Embed             │
│                                                                 │
│  Input:  Chunk texts (string[])                                 │
│  API:    Google Gemini embedding-001                            │
│                                                                 │
│  Output: Embeddings (number[][])                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         PineconeService.upsertVectors() - Store Vectors         │
│                                                                 │
│  Input:  Vectors with metadata                                  │
│  Metadata:                                                      │
│  ├─ repoId: Repository identifier                               │
│  ├─ filePath: File path                                         │
│  ├─ chunkIndex: Chunk number                                    │
│  ├─ startLine: Starting line (NEW)                              │
│  ├─ endLine: Ending line (NEW)                                  │
│  ├─ source: "repomix"                                           │
│  ├─ textHash: SHA256 hash                                       │
│  └─ updatedAt: ISO timestamp                                    │
│                                                                 │
│  Output: Vectors stored in Pinecone                             │
└─────────────────────────────────────────────────────────────────┘
```

## Future Flow (Semantic Chunking - Not Yet Implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│              chunkText() - Semantic Chunking                    │
│                                                                 │
│  Input:  File content (string)                                  │
│  Language: Detected from file extension                         │
│                                                                 │
│  Process:                                                       │
│  ├─ Load tree-sitter WASM parser                                │
│  ├─ Parse code to AST                                           │
│  ├─ Extract symbols (functions, classes, etc)                   │
│  ├─ Group related code                                          │
│  └─ Create semantic chunks                                      │
│                                                                 │
│  Output: TextChunk[] (semantic boundaries)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Component Relationships

```
IndexingController
    │
    └─► RepoEmbeddingOrchestrator
            │
            ├─► DatabaseService (fetch files)
            │
            └─► embedAndUpsertFile() (for each file)
                    │
                    ├─► textChunker.chunkText()
                    │       │
                    │       └─► TreeSitterService (future)
                    │
                    ├─► EmbeddingService.embedTexts()
                    │       │
                    │       └─► Google Gemini API
                    │
                    └─► PineconeService.upsertVectors()
                            │
                            └─► Pinecone Vector DB
```

## Performance Timeline

```
File Processing Timeline (per file):

Read File
    │ ~5-50ms
    ▼
Chunk Content (Line-Based)
    │ ~1-5ms ✅ FAST
    ▼
Embed Chunks (Batch)
    │ ~100-500ms (depends on chunk count)
    ▼
Upsert to Pinecone
    │ ~50-200ms (depends on vector count)
    ▼
Total: ~200-750ms per file (non-blocking)
```

## Configuration Points

```
ChunkingConfig
├─ maxLines: 60 (default)
│   └─ Adjust for larger/smaller chunks
│
└─ overlapLines: 10 (default)
    └─ Adjust for more/less context

EmbeddingPipelineConfig
├─ chunkingConfig: ChunkingConfig
├─ embeddingBatchSize: 10 (default)
└─ pineconeUpsertBatchSize: 50 (default)
```

## Data Flow Example

```
Input File: src/utils/helper.ts (200 lines)

Step 1: Chunk (60 lines, 10 overlap)
├─ Chunk 0: lines 0-60
├─ Chunk 1: lines 50-110
├─ Chunk 2: lines 100-160
└─ Chunk 3: lines 150-200

Step 2: Embed (batch size 10)
├─ Batch 1: Chunks 0-9
└─ Batch 2: Chunks 10-...

Step 3: Upsert (batch size 50)
└─ All vectors with metadata

Result: Vectors in Pinecone
├─ ID: git:repo:src/utils/helper.ts:0:abc123
├─ Metadata: {repoId, filePath, chunkIndex, startLine: 0, endLine: 60, ...}
└─ Vector: [0.123, 0.456, ...]
```

## Key Improvements

```
Before (Token-Based)          After (Line-Based)
├─ Blocking: YES              ├─ Blocking: NO ✅
├─ Speed: 50-200ms            ├─ Speed: 1-5ms ✅
├─ CPU: 65%                   ├─ CPU: <5% ✅
├─ Freezes: 3+ seconds        ├─ Freezes: None ✅
└─ Responsive: NO             └─ Responsive: YES ✅
```

