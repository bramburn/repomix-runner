# File Embedding Pipeline

<cite>
**Referenced Files in This Document**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts)
- [textChunker.ts](file://src/core/indexing/textChunker.ts)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts)
- [types.ts](file://src/core/indexing/embeddings/types.ts)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts)
- [retryService.ts](file://src/core/indexing/retryService.ts)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts)
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts)
- [fileEmbeddingPipeline.test.ts](file://src/test/core/indexing/fileEmbeddingPipeline.test.ts)
- [repomix.config.json](file://repomix.config.json)
- [README.md](file://README.md)
- [nodes.ts](file://src/search/nodes.ts)
- [configSchema.ts](file://src/config/configSchema.ts)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx)
</cite>

## Update Summary
**Changes Made**
- Significantly expanded language support for text file detection and processing
- Added comprehensive Python ecosystem support: pyproject.toml, poetry.lock, uv.lock
- Enhanced JavaScript/TypeScript ecosystem coverage: bun.lockb, deno.json, deno.jsonc, deno.lock
- Expanded C#/.NET project file support: .csproj, .sln, packages.config, global.json, Directory.Build props/targets
- Enhanced text file detection logic with broader project file recognition
- Updated Tree-sitter service to support Python, C#, and Dart languages
- Added Python WASM parser support and updated language detection mappings

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Priority Queue System](#priority-queue-system)
7. [Provider Support Matrix](#provider-support-matrix)
8. [Dependency Analysis](#dependency-analysis)
9. [Performance Considerations](#performance-considerations)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Conclusion](#conclusion)
12. [Appendices](#appendices)

## Introduction
This document describes the File Embedding Pipeline, which transforms raw file content into vector embeddings suitable for similarity search and retrieval. The pipeline performs:
- Binary file filtering with enhanced language support
- Text extraction and validation with expanded project file recognition
- Semantic and line-based text chunking with Tree-sitter AST support
- Preprocessing and metadata enrichment
- Provider-agnostic embedding generation with priority queue management across three providers (Gemini, Ollama, and LM Studio)
- Batched vector upsert into a vector database

The pipeline now supports significantly expanded language ecosystems including Python, JavaScript/TypeScript, C#/.NET, and enhanced text file detection logic for modern development workflows.

## Project Structure
The embedding pipeline spans several modules with enhanced language support:
- Orchestration and repository scanning
- File processing and chunking with expanded language detection
- Multi-provider embedding service with priority queue management
- Vector database adapter interface
- Utilities for retries, batching, and vector identity
- Tree-sitter service with Python, C#, and Dart language support

```mermaid
graph TB
subgraph "Orchestration"
RI["repoIndexer.ts"]
REO["repoEmbeddingOrchestrator.ts"]
end
subgraph "File Processing"
FEP["fileEmbeddingPipeline.ts"]
TC["textChunker.ts"]
TS["treeSitterService.ts"]
end
subgraph "Enhanced Embedding Layer"
ES["embeddingService.ts"]
ESQ["Priority Queue Management"]
ESD["Debugging Statistics"]
GP["GeminiProvider.ts"]
OP["OllamaProvider.ts"]
LP["LMStudioProvider.ts"]
ET["types.ts"]
end
subgraph "Persistence"
VDT["vectorDb\\types.ts"]
VID["vectorIdentity.ts"]
RS["retryService.ts"]
end
subgraph "Language Support"
PYTHON["Python Ecosystem<br/>pyproject.toml, poetry.lock, uv.lock"]
JSTS["JavaScript/TypeScript Ecosystem<br/>bun.lockb, deno.json, deno.lock"]
CSHARP[".NET/C# Support<br/>.csproj, .sln, packages.config"]
end
subgraph "Usage Context"
SEARCH["search/nodes.ts"]
AGENT["agent/nodes.ts"]
end
RI --> REO
REO --> FEP
FEP --> TC
TC --> TS
FEP --> ES
ES --> ESQ
ES --> ESD
ES --> GP
ES --> OP
ES --> LP
ES --> ET
FEP --> VDT
FEP --> VID
FEP --> RS
SEARCH --> ES
AGENT --> ES
PYTHON --> FEP
JSTS --> FEP
CSHARP --> FEP
TS --> PYTHON
TS --> CSHARP
```

**Diagram sources**
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L49-L217)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L30-L119)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L8-L77)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L9-L45)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L10-L90)
- [types.ts](file://src/core/indexing/embeddings/types.ts#L1-L6)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L19-L42)
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts#L17-L32)
- [retryService.ts](file://src/core/indexing/retryService.ts#L22-L71)
- [nodes.ts](file://src/search/nodes.ts#L95-L105)

**Section sources**
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L49-L217)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L19-L42)

## Core Components
- File Embedding Pipeline: Reads files, filters binaries, chunks text, generates embeddings, and upserts vectors with metadata.
- Enhanced Text Chunker: Implements semantic chunking (when AST is available) and line-based fallback with overlap.
- Multi-provider Embedding Service: Provider abstraction supporting Gemini, Ollama, and LM Studio with request queuing, priority management, and comprehensive debugging statistics.
- Vector Identity: Deterministic vector ID generation and parsing for integrity and incremental updates.
- Retry and Batching: Robust retries with exponential backoff and batching utilities for throughput.
- Repository Orchestrator: Coordinates repository-wide indexing and incremental updates.
- Enhanced Language Detection: Supports expanded ecosystem files including Python, JavaScript/TypeScript, and C#/.NET project files.

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts#L17-L66)
- [retryService.ts](file://src/core/indexing/retryService.ts#L22-L71)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L49-L217)

## Architecture Overview
The pipeline follows a staged flow: repository orchestration feeds file paths to the embedding pipeline, which reads content, chunks it, embeds using the selected provider, and upserts vectors into the vector database. The enhanced embedding service now manages request priorities across three providers and provides comprehensive debugging capabilities.

```mermaid
sequenceDiagram
participant Orchestrator as "RepoEmbeddingOrchestrator"
participant Pipeline as "embedAndUpsertFile"
participant Chunker as "chunkText"
participant EmbedSvc as "EmbeddingService"
participant Queue as "Priority Queue"
participant Provider as "Gemini/Ollama/LM Studio"
participant Adapter as "VectorDbAdapter"
Orchestrator->>Pipeline : "Process file"
Pipeline->>Pipeline : "Skip binary / empty / .git"
Pipeline->>Pipeline : "Enhanced text detection<br/>Python/JS/.NET project files"
Pipeline->>Chunker : "Generate chunks (semantic or line-based)"
Chunker-->>Pipeline : "TextChunk[]"
Pipeline->>EmbedSvc : "embedTexts(batch, priority=false)"
EmbedSvc->>Queue : "enqueue(request, priority=false)"
Queue-->>EmbedSvc : "process in order"
EmbedSvc->>Provider : "embedTexts (selected provider)"
Provider-->>EmbedSvc : "number[][]"
EmbedSvc-->>Pipeline : "embeddings"
Pipeline->>Pipeline : "Build VectorItems with metadata"
Pipeline->>Adapter : "upsertVectors(batch)"
Adapter-->>Pipeline : "ack"
Pipeline-->>Orchestrator : "vector count"
```

**Diagram sources**
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L144-L153)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L265-L389)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L55-L60)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L48-L76)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L36-L44)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L17-L78)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L22-L25)

## Detailed Component Analysis

### File Embedding Pipeline
Responsibilities:
- Binary detection and skip with enhanced language support
- Empty content and directory checks
- Abort signal handling
- Chunking configuration selection (semantic vs token-based)
- Batched embedding with priority queuing and concurrency controls
- Metadata enrichment and vector ID generation
- Comprehensive logging and error wrapping

Key behaviors:
- Binary file filtering uses extension and basename whitelists with expanded ecosystem support.
- Enhanced text detection recognizes Python (pyproject.toml, poetry.lock, uv.lock), JavaScript/TypeScript (bun.lockb, deno.json, deno.jsonc, deno.lock), and C#/.NET project files.
- Chunking is chosen based on AST support and language detection.
- Embeddings are produced in batches with configurable concurrency.
- Vectors are upserted in batches with separate concurrency control.
- Vector IDs include repo, path, chunk index, and a short text hash.

```mermaid
flowchart TD
Start(["Start embedAndUpsertFile"]) --> CheckGit[".git filter"]
CheckGit --> IsBinary{"Binary?"}
IsBinary --> |Yes| SkipBinary["Skip file"]
IsBinary --> |No| ReadFile["Read UTF-8 content"]
ReadFile --> EmptyCheck{"Empty?"}
EmptyCheck --> |Yes| SkipEmpty["Skip file"]
EmptyCheck --> |No| DetectLang["Detect language & AST support<br/>Enhanced: Python/JS/.NET"]
DetectLang --> ChunkCfg["Build ChunkingConfig<br/>useSemanticChunking/useTokenEstimation"]
ChunkCfg --> ChunkText["chunkText()"]
ChunkText --> FilterEmpty["Filter empty chunks"]
FilterEmpty --> HasChunks{"Any chunks left?"}
HasChunks --> |No| SkipNoChunks["Skip file"]
HasChunks --> |Yes| BatchEmbed["Batch embeddings<br/>with priority=false"]
BatchEmbed --> MakeVectors["Build VectorItems<br/>with metadata"]
MakeVectors --> BatchUpsert["Batch upsert to VectorDb"]
BatchUpsert --> Done(["Return vector count"])
```

**Diagram sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts#L17-L32)

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)

### Enhanced Text Detection Logic
The pipeline now supports significantly expanded language ecosystems:

**Python Ecosystem:**
- pyproject.toml: Modern Python project configuration
- poetry.lock: Poetry dependency lock file
- uv.lock: uv package manager lock file

**JavaScript/TypeScript Ecosystem:**
- bun.lockb: Bun package manager lock file
- deno.json: Deno runtime configuration
- deno.jsonc: Deno runtime configuration with comments
- deno.lock: Deno dependency lock file

**C#/.NET Ecosystem:**
- .csproj: C# project files
- .sln: Visual Studio solution files
- packages.config: NuGet packages configuration
- global.json: .NET SDK configuration
- Directory.Build.props: MSBuild properties
- Directory.Build.targets: MSBuild targets

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L40-L75)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L80-L102)
- [fileEmbeddingPipeline.test.ts](file://src/test/core/indexing/fileEmbeddingPipeline.test.ts#L95-L129)

### Enhanced Text Chunking Algorithm
Capabilities:
- Semantic chunking via Tree-sitter when AST is supported.
- Line-based chunking with configurable overlap and max lines.
- Token estimation for non-AST files.
- Symbol metadata propagation for semantic context.

Parameters:
- maxLines: default 60 lines per chunk
- overlapLines: default 10 lines between adjacent chunks
- useTokenEstimation: toggles token count estimation
- useSemanticChunking: enables AST-based chunking
- filePath: used for language detection

```mermaid
flowchart TD
A["chunkText(text, config)"] --> B{"useSemanticChunking AND AST supported?"}
B --> |Yes| C["Initialize Tree-sitter"]
C --> D["Extract symbols"]
D --> E{"Symbols found?"}
E --> |No| F["Fallback to line-based chunking"]
E --> |Yes| G["Combine symbols into chunks respecting maxLines"]
G --> H["Add prelude and epilogue chunks"]
H --> I["Attach symbolInfo and optional token estimates"]
B --> |No| F
F --> J["Iterate lines with overlap"]
J --> K["Create TextChunk with indices and optional tokens"]
```

**Diagram sources**
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L58-L175)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L180-L217)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L30-L119)

**Section sources**
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L24-L30)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L39-L47)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L58-L175)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L180-L217)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L227-L251)

### Multi-provider Embedding Service Abstraction
The EmbeddingService provides a unified interface to switch between providers and produce embeddings for single texts or batches. It now includes advanced queue management with priority-based request processing and comprehensive debugging capabilities across three providers.

**Updated** Enhanced with LM Studio provider support alongside existing Gemini and Ollama providers

Key Features:
- Multi-provider architecture supporting Gemini, Ollama, and LM Studio
- Priority-based request queuing with configurable concurrency limits
- Comprehensive queue statistics for debugging and monitoring
- Request serialization to prevent rate limiting
- Priority flag for user-facing operations (search, agent)
- Source tracking for request identification

```mermaid
classDiagram
class EmbeddingService {
-provider : IEmbeddingProvider
-currentConfig : EmbeddingProviderConfig
-queue : QueueEntry[]
-activeRequests : number
-maxConcurrent : number
+switchProvider(config)
+setMaxConcurrent(max)
+getQueueStats() QueueStats
+embedText(text, source, priority) number[]
+embedTexts(texts, source, priority) number[][]
+getDimensions() number
}
class QueueEntry {
-execute : Function
-resolve : Function
-reject : Function
-source : string
-priority : boolean
}
class QueueStats {
-queueLength : number
-activeRequests : number
-maxConcurrent : number
-priorityQueued : number
}
class IEmbeddingProvider {
<<interface>>
+embedText(text) number[]
+embedTexts(texts) number[][]
+getDimensions() number
}
class GeminiProvider {
-client : GoogleGenAI
-dimensions : number
+getDimensions() number
+embedText(text) number[]
+embedTexts(texts) number[][]
}
class OllamaProvider {
-config : OllamaConfig
+embedText(text) number[]
+embedTexts(texts) number[][]
+getDimensions() number
}
class LMStudioProvider {
-config : LMStudioConfig
+embedText(text) number[]
+embedTexts(texts) number[][]
+getDimensions() number
}
EmbeddingService --> IEmbeddingProvider : "delegates to"
EmbeddingService --> QueueEntry : "manages"
EmbeddingService --> QueueStats : "provides"
GeminiProvider ..|> IEmbeddingProvider
OllamaProvider ..|> IEmbeddingProvider
LMStudioProvider ..|> IEmbeddingProvider
```

**Diagram sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L75-L83)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L89-L103)
- [types.ts](file://src/core/indexing/embeddings/types.ts#L1-L6)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L8-L77)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L9-L45)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L10-L90)

**Section sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L5-L15)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L21-L46)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L68-L71)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L76-L83)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L132-L157)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L16-L18)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L42-L44)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L87-L89)

### Enhanced Tree-sitter Service
The Tree-sitter service now supports additional programming languages crucial for modern development ecosystems:

**Supported Languages:**
- JavaScript/TypeScript: Enhanced AST parsing
- Python: Full Python language support with pyproject.toml recognition
- Rust: Existing support maintained
- C#: New comprehensive C# language support
- Dart: New Dart language support

**Language Detection Enhancements:**
- Updated language detection mappings for .cs and .dart extensions
- Enhanced symbol extraction for C# methods, classes, and interfaces
- Improved Python function and class detection
- Dart function signature and class detection

**Section sources**
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L7-L8)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L84-L89)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L454-L467)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L472-L482)

### Vector Identity and Metadata
Vector IDs are deterministic and include repoId, file path, chunk index, and a short text hash. Metadata includes repoId, file path, chunk indices, source, text hash, and updated timestamp. This enables:
- Debugging and verification
- Incremental updates by detecting changed chunks
- Safe upsert/delete semantics

```mermaid
flowchart TD
A["generateVectorId(repoId, filePath, chunkIndex, chunkText?)"] --> B{"chunkText provided?"}
B --> |Yes| C["sha256(chunkText) -> shortHash"]
B --> |No| D["no shortHash"]
C --> E["return repoId:filePath:chunkIndex:shortHash"]
D --> E
```

**Diagram sources**
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts#L17-L32)

**Section sources**
- [vectorIdentity.ts](file://src/core/indexing/vectorIdentity.ts#L17-L66)

### Repository Orchestration and Incremental Updates
The orchestrator coordinates:
- Full repository embedding with concurrency control
- Incremental embedding for pending files (delete-then-upsert pattern)
- File synchronization with hash-based change detection
- Progress callbacks and graceful abort handling

```mermaid
sequenceDiagram
participant Caller as "Caller"
participant Orchestrator as "RepoEmbeddingOrchestrator"
participant DB as "DatabaseService"
participant Pipeline as "embedAndUpsertFile"
participant Adapter as "VectorDbAdapter"
Caller->>Orchestrator : "embedRepository(repoId, repoRoot, apiKey, adapter, config)"
Orchestrator->>DB : "getRepoFiles(repoId)"
Orchestrator->>Pipeline : "process files (concurrent or sequential)"
Pipeline-->>Orchestrator : "vector counts"
Orchestrator-->>Caller : "summary"
Caller->>Orchestrator : "embedPendingFiles(repoId, repoRoot, apiKey, adapter, config)"
Orchestrator->>DB : "getPendingRepoFiles(repoId)"
Orchestrator->>Adapter : "deleteVectorsForFile(file)"
Orchestrator->>Pipeline : "embedAndUpsertFile(file)"
Orchestrator->>DB : "markRepoFileIndexed(file, sha256)"
Orchestrator-->>Caller : "incremental summary"
```

**Diagram sources**
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L49-L217)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L267-L454)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L186-L469)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L35-L35)

**Section sources**
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L49-L217)
- [repoEmbeddingOrchestrator.ts](file://src/core/indexing/repoEmbeddingOrchestrator.ts#L267-L454)

## Priority Queue System

### Queue Management Architecture
The enhanced embedding service now implements a sophisticated priority queue system that ensures critical user-facing operations receive immediate processing while maintaining fairness for background indexing tasks across all three providers.

**Updated** New priority queue system with comprehensive request management

```mermaid
flowchart TD
Start(["Embedding Request"]) --> PriorityCheck{"priority flag?"}
PriorityCheck --> |true| FrontInsert["Insert at front of queue<br/>for immediate processing"]
PriorityCheck --> |false| BackInsert["Append to back of queue"]
FrontInsert --> QueueStats["Update queue statistics"]
BackInsert --> QueueStats
QueueStats --> CapacityCheck{"activeRequests < maxConcurrent?"}
CapacityCheck --> |true| ProcessNext["Process next request"]
CapacityCheck --> |false| Wait["Wait for capacity"]
ProcessNext --> Execute["Execute provider call"]
Execute --> Complete["Resolve promise"]
Complete --> NextIteration["Process next item"]
NextIteration --> CapacityCheck
```

**Diagram sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L89-L103)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L108-L127)

### Queue Statistics and Debugging
The service provides comprehensive debugging capabilities through queue statistics that help monitor and troubleshoot embedding operations across all providers.

**Updated** New debugging statistics and monitoring capabilities

Key Statistics:
- `queueLength`: Current number of queued requests
- `activeRequests`: Number of currently executing requests
- `maxConcurrent`: Maximum concurrent requests allowed
- `priorityQueued`: Number of priority requests in queue

Usage Examples:
- Search operations use `priority: true` to ensure immediate processing
- Indexing operations use `priority: false` for background processing
- Queue statistics logged for monitoring and debugging across all providers

**Section sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L76-L83)
- [nodes.ts](file://src/search/nodes.ts#L99-L105)

## Provider Support Matrix

### Provider Comparison and Capabilities

| Feature | Gemini | Ollama | LM Studio |
|---------|--------|--------|-----------|
| **API Type** | Cloud API | HTTP REST | HTTP REST |
| **Authentication** | API Key Required | None/Optional | Optional Bearer Token |
| **Response Format** | Structured JSON | Direct Array | OpenAI-style + Direct |
| **Dimension Control** | Fixed (768) | Configurable | Configurable |
| **Batch Support** | Native | Parallel Requests | Parallel Requests |
| **Local Deployment** | No | Yes | Yes |
| **Offline Capability** | No | Yes | Yes |
| **Model Loading** | Predefined | Dynamic | Dynamic |
| **Error Handling** | Structured | Standard | Comprehensive |

### Provider Configuration Examples

**Gemini Configuration:**
```typescript
provider: 'gemini',
gemini: {
  apiKey: 'YOUR_GEMINI_API_KEY'
}
```

**Ollama Configuration:**
```typescript
provider: 'ollama',
ollama: {
  url: 'http://localhost:11434',
  model: 'nomic-embed-text',
  dimension: 768
}
```

**LM Studio Configuration:**
```typescript
provider: 'lmstudio',
lmstudio: {
  baseUrl: 'http://localhost:1234/v1',
  apiKey: '', // Optional
  model: 'nomic-embed-text',
  dimension: 768
}
```

**Section sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L6-L22)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L4-L10)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L3-L7)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L3-L8)

## Dependency Analysis
- File Embedding Pipeline depends on:
  - Enhanced Text chunker for segmentation
  - Multi-provider Embedding service for provider abstraction
  - Vector DB adapter for persistence
  - Retry service for robustness
  - Tree-sitter service for AST-based chunking with expanded language support
  - Vector identity for deterministic IDs

```mermaid
graph LR
FEP["fileEmbeddingPipeline.ts"] --> TC["textChunker.ts"]
FEP --> ES["embeddingService.ts"]
FEP --> RS["retryService.ts"]
FEP --> VID["vectorIdentity.ts"]
FEP --> VDT["vectorDb\\types.ts"]
TC --> TS["treeSitterService.ts"]
ES --> GP["GeminiProvider.ts"]
ES --> OP["OllamaProvider.ts"]
ES --> LP["LMStudioProvider.ts"]
ES --> ET["types.ts"]
ES --> ESQ["Priority Queue System"]
ES --> ESD["Debugging Stats"]
PYTHON[".NET/C# Support"] --> FEP
JSTS["Python Ecosystem"] --> FEP
CSHARP["JavaScript/TypeScript"] --> FEP
TS --> PYTHON
TS --> CSHARP
```

**Diagram sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L4-L10)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L17-L19)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L1-L3)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L1)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L1-L1)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L1-L2)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L1-L1)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L1-L1)
- [types.ts](file://src/core/indexing/embeddings/types.ts#L1-L6)

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L4-L10)
- [textChunker.ts](file://src/core/indexing/textChunker.ts#L17-L19)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L1-L3)
- [vectorDb/types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L1)

## Performance Considerations
- Enhanced concurrency controls:
  - maxConcurrentFiles: controls parallel file processing
  - maxConcurrentBatches: parallel embedding batches
  - maxConcurrentUpserts: parallel upsert batches
  - maxConcurrent: new parameter controlling embedding request concurrency
- Priority-based processing:
  - User-facing operations (search, agent) use priority=true
  - Background indexing uses priority=false
  - Queue serialization prevents rate limiting
- Batching:
  - embeddingBatchSize and vectorDbBatchSize reduce API overhead
- Memory management:
  - Line-based chunking minimizes memory footprint
  - Token estimation avoids over-allocation for non-AST files
- Parallelization:
  - Concurrent file processing with graceful abort
  - Batched embeddings and upserts with backoff retries
  - Priority queue ensures responsive user operations
- Large repositories:
  - Incremental embedding reduces full re-index cost
  - Hash-based change detection skips unchanged files
  - Queue statistics enable performance monitoring
- Provider-specific optimizations:
  - LM Studio supports local inference with configurable model loading
  - Gemini provides fixed dimensionality for predictable performance
  - Ollama offers flexible model selection with dynamic dimension control
- Enhanced language support:
  - Expanded ecosystem file processing reduces unnecessary binary filtering
  - Improved language detection reduces misclassification errors
  - Tree-sitter AST parsing optimized for Python, C#, and Dart languages

## Troubleshooting Guide
Common issues and resolutions:
- Binary files not embedded:
  - Expected behavior; binary extensions and unknown extensions are skipped.
- Empty files:
  - Skipped automatically; ensure content is present.
- .git internals:
  - Explicitly filtered; ensure paths do not leak into processing.
- Provider configuration errors:
  - Missing API keys or invalid provider configs cause initialization failures.
  - LM Studio requires valid model names and accessible base URLs.
- Dimension mismatches:
  - Gemini provider specifies fixed dimensions (768); verify provider alignment.
  - LM Studio allows flexible dimensions with warning-only validation.
  - Ollama requires explicit dimension configuration.
- Network/API failures:
  - Exponential backoff is applied; check provider quotas and connectivity.
  - LM Studio requires running server instance and loaded models.
- Vector DB errors:
  - Ensure adapter supports required operations and credentials are valid.
- Queue congestion:
  - Monitor queue statistics using `embeddingService.getQueueStats()`
  - Adjust `maxConcurrent` setting to balance responsiveness and throughput
- Priority starvation:
  - Ensure user-facing operations use `priority: true`
  - Background tasks automatically use lower priority
- Language detection issues:
  - Verify file extensions match supported ecosystems
  - Check Tree-sitter WASM files are available for new languages
  - Ensure proper language mapping for .cs and .dart files
- Python ecosystem files:
  - pyproject.toml, poetry.lock, and uv.lock are now recognized as text files
  - Verify Python WASM parser is available in assets/tree-sitter-wasm
- JavaScript/TypeScript ecosystem files:
  - bun.lockb, deno.json, deno.jsonc, and deno.lock are now processed as text
  - Ensure proper language detection for .ts and .tsx files
- C#/.NET project files:
  - .csproj, .sln, packages.config, global.json, and Directory.Build files are recognized
  - Verify Tree-sitter C# language support is properly initialized

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L200-L213)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L241-L249)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L31-L44)
- [GeminiProvider.ts](file://src/core/indexing/embeddings/GeminiProvider.ts#L41-L43)
- [OllamaProvider.ts](file://src/core/indexing/embeddings/OllamaProvider.ts#L22-L26)
- [LMStudioProvider.ts](file://src/core/indexing/embeddings/LMStudioProvider.ts#L41-L45)
- [retryService.ts](file://src/core/indexing/retryService.ts#L22-L58)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L76-L83)

## Conclusion
The File Embedding Pipeline provides a robust, extensible, and efficient mechanism to transform repository content into searchable vectors across three embedding providers. Its enhanced language support now covers modern development ecosystems including Python, JavaScript/TypeScript, and C#/.NET projects. The expanded text detection logic ensures comprehensive project file recognition, while the enhanced priority queue system ensures responsive user operations while maintaining fair background processing. The modular design supports Gemini, Ollama, and LM Studio providers, safe incremental updates, comprehensive debugging capabilities, and strong error handling, enabling reliable embeddings at scale with flexible deployment options.

## Appendices

### Configuration Examples
Provider configuration examples for EmbeddingService:

- Enhanced EmbeddingService with Three Providers
  - provider: "gemini" | "ollama" | "lmstudio"
  - gemini.apiKey: "<your-gemini-api-key>"
  - ollama.url: "<http://localhost:11434>"
  - ollama.model: "<model-name>"
  - ollama.dimension: <vector-dimension>
  - lmstudio.baseUrl: "<http://localhost:1234/v1>"
  - lmstudio.apiKey: "<optional-bearer-token>"
  - lmstudio.model: "<model-name>"
  - lmstudio.dimension: <vector-dimension>
  - maxConcurrent: <number> (default: 1)
  - Example reference: [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L5-L15)

- Pipeline configuration (EmbeddingPipelineConfig)
  - chunkingConfig: overrides for maxLines, overlapLines, useTokenEstimation, useSemanticChunking
  - embeddingBatchSize: default 10
  - vectorDbBatchSize: default 50
  - maxConcurrentFiles: default 3
  - maxConcurrentBatches: default 2
  - maxConcurrentUpserts: default 2
  - Example references:
    - [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L130-L143)
    - [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L289-L291)
    - [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L397-L399)

- Priority Usage Examples
  - Search operations: `embeddingService.embedText(query, 'search', true)`
  - Indexing operations: `embeddingService.embedTexts(chunks, 'indexing', false)`
  - Example reference: [nodes.ts](file://src/search/nodes.ts#L101-L102)

- Enhanced Language Support Configuration
  - Python ecosystem: pyproject.toml, poetry.lock, uv.lock
  - JavaScript/TypeScript: bun.lockb, deno.json, deno.jsonc, deno.lock
  - C#/.NET: .csproj, .sln, packages.config, global.json, Directory.Build.*
  - Example reference: [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L50-L66)

- Tree-sitter Language Configuration
  - Supported languages: javascript, typescript, python, rust, csharp, dart
  - WASM parsers location: assets/tree-sitter-wasm/
  - Example reference: [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L84-L89)

- Repository indexing configuration (repomix.config.json)
  - maxFileSize: controls maximum file size considered
  - ignore patterns: .gitignore, dot-ignore, defaults, custom patterns
  - Example reference: [repomix.config.json](file://repomix.config.json#L1-L43)

- Repository indexing flow
  - Scans repository, applies ignore patterns, persists file list to database
  - Example reference: [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)

**Section sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L5-L15)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L130-L143)
- [nodes.ts](file://src/search/nodes.ts#L101-L102)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L50-L66)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L84-L89)
- [repomix.config.json](file://repomix.config.json#L1-L43)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)

### Validation and Metadata Expectations
- Vector metadata fields verified by tests:
  - repoId, filePath, chunkIndex, source, textHash, updatedAt
  - Example reference: [fileEmbeddingPipeline.test.ts](file://src/test/core/indexing/fileEmbeddingPipeline.test.ts#L62-L82)

**Section sources**
- [fileEmbeddingPipeline.test.ts](file://src/test/core/indexing/fileEmbeddingPipeline.test.ts#L62-L82)

### Priority Queue Monitoring
- Queue statistics for debugging:
  - `embeddingService.getQueueStats()` returns current queue status
  - Monitor queueLength, activeRequests, maxConcurrent, priorityQueued
  - Example reference: [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L76-L83)

**Section sources**
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L76-L83)

### Enhanced Language Support Details
- Python ecosystem files recognized as text:
  - pyproject.toml: Modern Python project configuration
  - poetry.lock: Poetry dependency management
  - uv.lock: uv package manager lock files
- JavaScript/TypeScript ecosystem files recognized as text:
  - bun.lockb: Bun package manager
  - deno.json/deno.jsonc: Deno runtime configuration
  - deno.lock: Deno dependency lock
- C#/.NET project files recognized as text:
  - .csproj: C# project files
  - .sln: Visual Studio solutions
  - packages.config: NuGet packages
  - global.json: .NET SDK configuration
  - Directory.Build.props/targets: MSBuild customization
- Tree-sitter language support:
  - Python, C#, and Dart language parsers available
  - WASM files located in assets/tree-sitter-wasm/
  - Language detection mappings updated for new extensions

**Section sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L50-L66)
- [fileEmbeddingPipeline.test.ts](file://src/test/core/indexing/fileEmbeddingPipeline.test.ts#L95-L129)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L454-L467)
- [treeSitterService.ts](file://src/core/indexing/treeSitterService.ts#L472-L482)