# Core Features

<cite>
**Referenced Files in This Document**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts)
- [createBundle.ts](file://src/commands/createBundle.ts)
- [runRepomix.ts](file://src/commands/runRepomix.ts)
- [ExecutionQueueManager.ts](file://src/webview/services/ExecutionQueueManager.ts)
- [graph.ts](file://src/agent/graph.ts)
- [nodes.ts](file://src/agent/nodes.ts)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts)
- [llmReranking.ts](file://src/core/indexing/llmReranking.ts)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts)
- [AgentController.ts](file://src/webview/controllers/AgentController.ts)
- [configSchema.ts](file://src/config/configSchema.ts)
- [compressFile.ts](file://src/core/compression/compressFile.ts)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts)
- [BaseParseStrategy.ts](file://src/core/compression/strategies/BaseParseStrategy.ts)
- [TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts)
- [DartParseStrategy.ts](file://src/core/compression/strategies/DartParseStrategy.ts)
- [PythonParseStrategy.ts](file://src/core/compression/strategies/PythonParseStrategy.ts)
- [CsharpParseStrategy.ts](file://src/core/compression/strategies/CsharpParseStrategy.ts)
- [RustParseStrategy.ts](file://src/core/compression/strategies/RustParseStrategy.ts)
- [queryTypescript.ts](file://src/core/compression/queries/queryTypescript.ts)
- [queryDart.ts](file://src/core/compression/queries/queryDart.ts)
- [queryPython.ts](file://src/core/compression/queries/queryPython.ts)
- [queryCsharp.ts](file://src/core/compression/queries/queryCsharp.ts)
- [queryRust.ts](file://src/core/compression/queries/queryRust.ts)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts)
- [databaseService.ts](file://src/core/storage/databaseService.ts)
- [conversationService.ts](file://src/services/conversationService.ts)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts)
- [chat.ts](file://src/types/chat.ts)
- [planService.ts](file://src/services/planService.ts)
- [graph.ts](file://src/chat/graph.ts)
- [testCompression.ts](file://src/commands/testCompression.ts)
- [state.ts](file://src/agent/state.ts)
- [AGENTS.md](file://src/core/compression/AGENTS.md)
- [COMPRESSION_TESTING.md](file://COMPRESSION_TESTING.md)
- [diagnose-compression.js](file://scripts/diagnose-compression.js)
</cite>

## Update Summary
**Changes Made**
- Complete rewrite of compression engine from chunk-based to advanced body replacement strategy
- Updated multi-language support to include Rust with dedicated AST parsing
- Enhanced language strategies with comprehensive metadata tracking system
- Implemented selective compression capabilities with keepNames configuration
- Strengthened compression engine with improved error handling and fallback mechanisms

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document details the three primary feature pillars of Repomix Runner Plus:
- Bundle Management System: persistent, organized collections of files and configurations for repeatable runs.
- AI-Powered File Selection: a smart agent workflow that performs semantic search, relevance confirmation, and automated packaging.
- Enhanced Clipboard Operations: cross-platform copy modes, remote clipboard support, and binary integration.

**Updated** The compression engine has been completely rewritten from a chunk-based approach to an advanced body replacement strategy. The system now provides comprehensive metadata tracking with detailed compression insights, improved error handling, and better user transparency about compression results. Multi-language support expanded to include Rust with dedicated AST-based file skeleton generation and selective compression capabilities with keepNames configuration.

It explains how each feature addresses user needs, the workflows they enable, interdependencies among components, configuration options, and practical examples.

## Project Structure
The core features span several subsystems:
- Bundles: persistent storage and lifecycle management for user-defined groups of files and settings.
- Agent: a LangGraph-based workflow orchestrating retrieval, filtering, summarization, command generation, and execution.
- Indexing: repository indexing, embedding generation, and vector database adapters for semantic search.
- Files and Clipboard: cross-platform copy-to-clipboard logic, temp file handling, and remote clipboard binary integration.
- Commands and Webview: orchestration of runs, queueing, and UI-driven agent interactions.
- **New** Enhanced Compression: AST-based file compression system supporting seven programming languages with comprehensive metadata tracking and improved user transparency.
- **New** Branch Maintenance: branch-aware indexing with automatic cleanup and maintenance.
- **New** Chat System: persistent conversation threads with plan execution capabilities.

```mermaid
graph TB
subgraph "Bundles"
BM["BundleManager<br/>save/get/delete"]
CB["createBundle command"]
end
subgraph "Agent"
GR["createSmartRepomixGraph"]
ND["Agent Nodes<br/>analyze/retrieval/filtering/relevance/command/execute"]
EMB["EmbeddingService"]
VDF["VectorDB Factory"]
PF["ProcessedFile Metadata<br/>compressionLevel/tokens/relevance"]
end
subgraph "Indexing"
RI["RepoIndexer"]
LLMR["LLM Reranking"]
BMS["BranchMaintenanceService"]
end
subgraph "Enhanced Compression"
CF["compressFile<br/>body replacement strategy"]
LP["LanguageParser<br/>Tree-sitter integration"]
TPS["TypeScriptParseStrategy"]
DPS["DartParseStrategy"]
PPS["PythonParseStrategy"]
CSP["CsharpParseStrategy"]
RPS["RustParseStrategy<br/>+Selective Compression"]
QT["queryTypescript"]
QD["queryDart"]
QP["queryPython"]
QC["queryCsharp"]
QR["queryRust"]
TC["testCompression<br/>validation utility"]
end
subgraph "Chat System"
CS["ConversationService<br/>persistent threads"]
PC["PlanService<br/>plan execution"]
CC["ChatController<br/>UI integration"]
CG["ChatGraph<br/>plan & execute loop"]
end
subgraph "Files & Clipboard"
CT["copyToClipboard"]
RCH["RemoteClipboardHandler"]
end
subgraph "Commands & Webview"
RR["runRepomix"]
EQM["ExecutionQueueManager"]
AC["AgentController"]
end
BM --> CB
CB --> RR
RR --> CT
AC --> GR
GR --> ND
ND --> PF
ND --> EMB
ND --> VDF
RI --> EMB
LLMR --> ND
BMS --> RI
CF --> LP
LP --> TPS
LP --> DPS
LP --> PPS
LP --> CSP
LP --> RPS
TPS --> QT
DPS --> QD
PPS --> QP
CSP --> QC
RPS --> QR
TC --> CF
CS --> PC
PC --> CC
CC --> CG
CT --> RCH
EQM --> RR
```

**Diagram sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)
- [runRepomix.ts](file://src/commands/runRepomix.ts#L48-L154)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [llmReranking.ts](file://src/core/indexing/llmReranking.ts#L43-L143)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L6-L25)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L26-L88)
- [TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L11-L62)
- [DartParseStrategy.ts](file://src/core/compression/strategies/DartParseStrategy.ts#L1-L118)
- [PythonParseStrategy.ts](file://src/core/compression/strategies/PythonParseStrategy.ts#L1-L118)
- [CsharpParseStrategy.ts](file://src/core/compression/strategies/CsharpParseStrategy.ts#L1-L118)
- [RustParseStrategy.ts](file://src/core/compression/strategies/RustParseStrategy.ts#L11-L118)
- [queryTypescript.ts](file://src/core/compression/queries/queryTypescript.ts#L1-L18)
- [queryDart.ts](file://src/core/compression/queries/queryDart.ts#L1-L118)
- [queryPython.ts](file://src/core/compression/queries/queryPython.ts#L1-L118)
- [queryCsharp.ts](file://src/core/compression/queries/queryCsharp.ts#L1-L118)
- [queryRust.ts](file://src/core/compression/queries/queryRust.ts#L1-L22)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [graph.ts](file://src/chat/graph.ts#L11-L67)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L10-L190)
- [ExecutionQueueManager.ts](file://src/webview/services/ExecutionQueueManager.ts#L15-L133)
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L44-L178)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)
- [state.ts](file://src/agent/state.ts#L3-L12)

**Section sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)
- [runRepomix.ts](file://src/commands/runRepomix.ts#L48-L154)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [llmReranking.ts](file://src/core/indexing/llmReranking.ts#L43-L143)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L10-L190)
- [ExecutionQueueManager.ts](file://src/webview/services/ExecutionQueueManager.ts#L15-L133)
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L44-L178)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L6-L25)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L37-L64)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L6-L33)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)
- [state.ts](file://src/agent/state.ts#L3-L12)

## Core Components
- Bundle Management System
  - Persistent storage of bundles in a workspace-local JSON file.
  - Active bundle tracking and events for UI updates.
  - Creation, retrieval, saving, and deletion of bundles.
- AI-Powered File Selection
  - LangGraph workflow with nodes for objective analysis, retrieval, filtering, relevance confirmation, summary, command generation, and execution.
  - Semantic search powered by embeddings and vector databases.
  - Structured LLM prompts and caching for performance.
  - **Enhanced** ProcessedFile metadata tracking with compression levels, token counts, and relevance scores for transparent context optimization.
- Enhanced Clipboard Operations
  - Cross-platform copy modes: content (text) and file (binary).
  - Remote clipboard support via a Windows helper binary invoked from a temp directory.
  - OS-specific clipboard commands and dependency checks.
- **New** Enhanced AST-Based Compression System
  - Comprehensive file compression using Tree-sitter AST parsing across seven programming languages.
  - Multi-language support including TypeScript, JavaScript, Dart, Python, C#, Rust, and enhanced language strategies.
  - Selective full-code retention via `keepNames` configuration.
  - Advanced body replacement strategy with hierarchical chunk processing and deduplication.
  - Dedicated language-specific strategies for optimal compression quality.
  - **Enhanced** Comprehensive metadata tracking including compression levels, token usage, and relevance scoring.
  - Improved error handling with fallback mechanisms and detailed logging.
- **New** Branch-Aware Indexing Architecture
  - Repository indexing with branch-specific tracking and cleanup.
  - Automatic maintenance of stale branches across vector databases and local storage.
  - Unique indexing progress tracking per repository and branch combination.
  - Schema-aware branch detection with timestamped legacy table naming for database reliability.
- **New** Persistent Chat Threads with Plan Execution
  - Thread-based conversation management with token usage tracking.
  - Plan execution capabilities with surgical text replacement.
  - Integration with chat graph workflow for plan & execute loops.

**Section sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L10-L190)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L26-L88)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [state.ts](file://src/agent/state.ts#L3-L12)

## Architecture Overview
The system integrates three pillars around a central execution pipeline with enhanced compression and indexing capabilities:
- Users define or select bundles to run.
- The agent optionally discovers relevant files using semantic search and LLM-based filtering.
- **Enhanced** File compression using AST-based techniques improves context quality across seven programming languages with comprehensive metadata tracking.
- **New** Branch-aware indexing ensures accurate search results across repository branches.
- **New** Persistent chat threads enable long-term conversation management with plan execution.
- Repomix executes with discovered files, and output is copied according to configuration.

```mermaid
sequenceDiagram
participant User as "User"
participant Webview as "AgentController"
participant Graph as "createSmartRepomixGraph"
participant Nodes as "Agent Nodes"
participant Embed as "EmbeddingService"
participant VDB as "VectorDB Adapter"
participant Compress as "Enhanced AST Compression"
participant BranchMaint as "BranchMaintenanceService"
participant Runner as "runRepomix"
participant Clip as "copyToClipboard"
User->>Webview : "Submit query"
Webview->>Graph : "stream() workflow"
Graph->>Nodes : "analyzeObjective()"
Nodes->>Embed : "embedText(query)"
Embed-->>Nodes : "query vector"
Nodes->>VDB : "queryVectors(topK)"
VDB-->>Nodes : "matches -> candidate files"
Nodes->>Compress : "compressFile() AST parsing (7 languages)"
Compress-->>Nodes : "compressed context + metadata"
Nodes->>BranchMaint : "cleanupStaleBranches()"
BranchMaint-->>Nodes : "cleaned stale data"
Nodes->>Nodes : "initialFiltering() + relevanceConfirmation()"
Nodes->>Nodes : "generateSummary()"
Nodes->>Nodes : "commandGeneration()"
Nodes->>Runner : "execPromisify(finalCommand)"
Runner-->>Clip : "copyToClipboard(output, tmp)"
Clip-->>User : "Clipboard updated"
```

**Diagram sources**
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L44-L178)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L48-L60)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [runRepomix.ts](file://src/commands/runRepomix.ts#L88-L123)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)

## Detailed Component Analysis

### Bundle Management System
Purpose
- Persist user-defined groups of files and settings.
- Enable quick selection and reuse of predefined configurations.
- Track an active bundle for UI and execution contexts.

Key Behaviors
- Initialize workspace storage directory and metadata file.
- CRUD operations on bundles with JSON persistence.
- Track and emit active bundle changes.
- Create bundles via a form and set them active.

User Workflows
- Create a bundle, add files, and run it.
- Switch active bundle to quickly compare configurations.
- Delete unused bundles to keep workspace tidy.

Interdependencies
- Commands depend on BundleManager for persistence.
- ExecutionQueueManager uses bundle IDs to run bundles.
- UI components subscribe to bundle change events.

```mermaid
classDiagram
class BundleManager {
-repomixDir : string
-bundlesFile : string
-_activeBundleId : string
+initialize()
+setActiveBundle(id)
+getActiveBundleId()
+getActiveBundle()
+getAllBundles()
+getBundle(id)
+saveBundle(id, payload)
+deleteBundle(id)
+onDidChangeBundles
+onDidChangeActiveBundle
}
class CreateBundleCommand {
+createBundle(bundleManager)
}
BundleManager <.. CreateBundleCommand : "persists"
```

**Diagram sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)

**Section sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L18-L115)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)

### AI-Powered File Selection
Purpose
- Automatically discover relevant files for a given query using semantic search and LLM-based filtering.
- Provide a reproducible, auditable run history.
- **Enhanced** Track comprehensive metadata about compression results for transparent context optimization.

Workflow
- Objective analysis: classify task type and relevance criteria.
- Retrieval: embed query and search vector database for candidate files.
- **Enhanced** Context compression: apply AST-based compression to improve semantic quality across seven programming languages with detailed metadata tracking.
- Filtering: fast pass to reduce candidate set.
- Relevance confirmation: batched LLM evaluation with confidence thresholds.
- Summary: optional markdown summary of selected files.
- Command generation: build Repomix CLI command with selected files.
- Execution: run Repomix and record run history.

**Enhanced** Semantic Search Infrastructure
- EmbeddingService supports multiple providers and exposes dimensionality.
- VectorDB factory selects provider and adapter per repository.
- RepoIndexer builds a file catalog and clears old entries before indexing.
- **New** BranchMaintenanceService automatically cleans stale branches across vector databases.

**Enhanced** Compression Metadata Tracking
- ProcessedFile interface tracks compressionLevel ('full' | 'skeleton' | 'summary'), tokens, and relevanceScore for each processed file.
- Agent nodes collect detailed compression metrics during context optimization.
- Transparent logging provides insights into compression success rates and fallback scenarios.
- Token estimation provides real-time cost awareness for different compression strategies.

Recommendation Engine
- Retrieval uses vector similarity; fallback to filesystem listing if unavailable.
- LLM reranking refines top candidates using structured prompts and confidence thresholds.
- Nodes cache LLM responses to reduce cost and latency.

```mermaid
flowchart TD
Start(["Agent Start"]) --> Obj["analyzeObjective"]
Obj --> Ret["retrieve candidates via embeddings"]
Ret --> Comp["compressFile() Enhanced AST compression"]
Comp --> Meta["track ProcessedFile metadata<br/>compressionLevel/tokens/relevance"]
Meta --> IR["initialFiltering (names/dirs)"]
IR --> RC["relevanceConfirmation (batch LLM)"]
RC --> Sum["generateSummary"]
Sum --> CG["commandGeneration"]
CG --> Exec["finalExecution (run Repomix)"]
Exec --> End(["Agent Complete"])
Ret --> |no adapter| FS["fallback to workspace files"]
RC --> |parallel fails| Seq["sequential processing"]
Comp --> BM["BranchMaintenanceService"]
BM --> Ret
```

**Diagram sources**
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [llmReranking.ts](file://src/core/indexing/llmReranking.ts#L43-L143)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [state.ts](file://src/agent/state.ts#L3-L12)

**Section sources**
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)
- [llmReranking.ts](file://src/core/indexing/llmReranking.ts#L43-L143)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [state.ts](file://src/agent/state.ts#L3-L12)

### Enhanced Clipboard Operations
Purpose
- Provide flexible copy modes to clipboard: raw content or entire file.
- Support remote environments by invoking a Windows helper binary when needed.
- Manage temporary files and OS-specific clipboard commands.

Cross-Platform Modes
- Content mode: uses VS Code's clipboard API to copy text.
- File mode: copies a file to the OS clipboard using platform-specific commands or a helper binary.

Remote Clipboard Support
- A remote handler decodes base64-encoded files into a temp directory and invokes a Windows helper binary to set the clipboard.
- The handler manages temp directories, binary discovery, timeouts, and asynchronous cleanup.

```mermaid
sequenceDiagram
participant Ext as "Extension"
participant Clip as "copyToClipboard"
participant OS as "OS Clipboard"
participant WinBin as "repomix-clipboard.exe"
participant Remote as "RemoteClipboardHandler"
Ext->>Clip : "copyToClipboard(output, tmp, os?)"
alt content mode
Clip->>OS : "writeText(content)"
else file mode
Clip->>OS : "platform-specific command"
opt windows
Clip->>WinBin : "execute with temp dir"
end
end
Ext->>Remote : "processRemoteFiles(files, mode)"
Remote->>Remote : "decode+write files"
Remote->>WinBin : "execute with mode flags"
Remote-->>Ext : "processing complete"
```

**Diagram sources**
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L22-L67)

**Section sources**
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L10-L190)

### **New** Enhanced AST-Based Compression System
Purpose
- Provide intelligent file compression using Tree-sitter AST parsing for improved LLM context quality.
- Support seven programming languages with dedicated language-specific parsing strategies.
- Enable selective retention of important code elements while compressing the rest.
- **Enhanced** Provide comprehensive metadata tracking for transparency and debugging.

**Enhanced** Multi-Language Support
- TypeScript/JavaScript: Uses `typescript.wasm` and `TypeScriptParseStrategy`.
- Dart: Uses `dart.wasm` and `DartParseStrategy`.
- Python: Uses `python.wasm` and `PythonParseStrategy` (handles decorators and indentation).
- C#: Uses `csharp.wasm` and `CsharpParseStrategy` (handles namespaces and properties).
- **New** Rust: Uses `rust.wasm` and `RustParseStrategy` (handles structs, impls, and traits).

**Enhanced** Metadata Tracking System
- ProcessedFile interface includes compressionLevel, tokens, and relevanceScore for detailed tracking.
- Compression results logged with success/failure status and fallback mechanisms.
- Token estimation provides real-time cost awareness for different compression strategies.
- Error handling with graceful fallback to full content when compression fails.

**Enhanced** Advanced Body Replacement Strategy
- Complete rewrite from chunk-based to body replacement approach.
- Processes AST captures in reverse order to preserve indices during replacement.
- Implements sophisticated body detection and replacement logic.
- Handles complex nested structures and maintains syntax validity.

Compression Workflow
- Language detection based on file extensions (.ts, .tsx, .js, .jsx, .dart, .py, .cs, .rs).
- AST parsing using Tree-sitter with language-specific queries.
- Strategy-based extraction of meaningful code constructs with body replacement.
- Hierarchical chunk processing with deduplication and merging.
- Selective full-code retention via `keepNames` configuration.

**Enhanced** Language-Specific Strategies
- **TypeScript/JavaScript**: Optimized for modern JavaScript frameworks and TypeScript features.
- **Dart**: Handles Flutter and Dart-specific syntax patterns.
- **Python**: Manages decorators, indentation, and Pythonic constructs.
- **C#**: Supports namespaces, properties, and .NET framework patterns.
- **Rust**: Specialized for structs, enums, traits, and ownership patterns with advanced body replacement.

**Enhanced** Testing and Validation
- Comprehensive testCompression command for manual validation.
- Automated fallback mechanisms with detailed error logging.
- Support for selective retention testing with keepNames parameter.
- Diagnostic script for compression system health verification.

```mermaid
flowchart TD
Start(["compressFile(filePath, content)"]) --> Detect["detectLanguage() - 7 languages"]
Detect --> LP["LanguageParser.getInstance()"]
LP --> GetParser["getParserForLang()"]
GetParser --> Parse["parser.parse(content)"]
Parse --> Query["getQueryForLang()"]
Query --> Captures["captures(tree.rootNode)"]
Captures --> Sort["sort(reverse order)"]
Sort --> Strategy["getStrategyForLang()"]
Strategy --> Replace["getBodyReplacement() per strategy"]
Replace --> Validate["validate indices"]
Validate --> Slice["slice + replacement + slice"]
Slice --> Result["return compressed text"]
Result --> Meta["track metadata<br/>compressionLevel/tokens/relevance"]
```

**Diagram sources**
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L90-L122)
- [TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L12-L62)
- [DartParseStrategy.ts](file://src/core/compression/strategies/DartParseStrategy.ts#L12-L118)
- [PythonParseStrategy.ts](file://src/core/compression/strategies/PythonParseStrategy.ts#L12-L118)
- [CsharpParseStrategy.ts](file://src/core/compression/strategies/CsharpParseStrategy.ts#L12-L118)
- [RustParseStrategy.ts](file://src/core/compression/strategies/RustParseStrategy.ts#L12-L118)
- [queryTypescript.ts](file://src/core/compression/queries/queryTypescript.ts#L1-L18)
- [queryDart.ts](file://src/core/compression/queries/queryDart.ts#L1-L118)
- [queryPython.ts](file://src/core/compression/queries/queryPython.ts#L1-L118)
- [queryCsharp.ts](file://src/core/compression/queries/queryCsharp.ts#L1-L118)
- [queryRust.ts](file://src/core/compression/queries/queryRust.ts#L1-L22)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)

**Section sources**
- [compressFile.ts](file://src/core/compression/compressFile.ts#L6-L25)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L37-L64)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L90-L122)
- [BaseParseStrategy.ts](file://src/core/compression/strategies/BaseParseStrategy.ts#L10-L68)
- [TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L11-L62)
- [DartParseStrategy.ts](file://src/core/compression/strategies/DartParseStrategy.ts#L11-L118)
- [PythonParseStrategy.ts](file://src/core/compression/strategies/PythonParseStrategy.ts#L11-L118)
- [CsharpParseStrategy.ts](file://src/core/compression/strategies/CsharpParseStrategy.ts#L11-L118)
- [RustParseStrategy.ts](file://src/core/compression/strategies/RustParseStrategy.ts#L11-L118)
- [queryTypescript.ts](file://src/core/compression/queries/queryTypescript.ts#L1-L18)
- [queryDart.ts](file://src/core/compression/queries/queryDart.ts#L1-L118)
- [queryPython.ts](file://src/core/compression/queries/queryPython.ts#L1-L118)
- [queryCsharp.ts](file://src/core/compression/queries/queryCsharp.ts#L1-L118)
- [queryRust.ts](file://src/core/compression/queries/queryRust.ts#L1-L22)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)
- [AGENTS.md](file://src/core/compression/AGENTS.md#L1-L83)
- [COMPRESSION_TESTING.md](file://COMPRESSION_TESTING.md#L1-L68)
- [diagnose-compression.js](file://scripts/diagnose-compression.js#L1-L62)

### **New** Branch-Aware Indexing Architecture
Purpose
- Enable accurate semantic search across multiple repository branches.
- Maintain separate indexing progress and vector data per branch.
- Automatically clean up stale branch data to prevent index bloat.

**Enhanced** Indexing Infrastructure
- DatabaseService maintains branch-aware unique indexes for repository indexing progress.
- BranchMaintenanceService compares tracked branches with actual Git branches.
- Automatic cleanup of stale branches across vector databases and local storage.
- Unique indexing progress tracking per repository and branch combination.
- Schema-aware branch detection with timestamped legacy table naming for database reliability.

Branch Maintenance Workflow
- Retrieve tracked branches from database using schema-aware detection.
- Compare with actual Git branches.
- Delete vectors for stale branches via vector database adapter.
- Clear branch data from local storage.
- Log and handle cleanup errors gracefully.
- Legacy tables migrated with timestamped naming for backward compatibility.

```mermaid
flowchart TD
Start(["cleanupStaleBranches(repoId, repoRoot)"]) --> GetTracked["getTrackedBranches(repoId)<br/>schema-aware detection"]
GetTracked --> GetGit["getAllBranches(repoRoot)"]
GetGit --> Compare["compare tracked vs git branches"]
Compare --> Stale["filter stale branches"]
Stale --> Loop["for each stale branch"]
Loop --> DeleteVec["adapter.deleteVectorsForBranch()"]
DeleteVec --> ClearDB["clearBranchData(repoId, branchName)"]
ClearDB --> Log["log cleanup result"]
Log --> Next["next stale branch"]
Next --> Done(["cleanup complete"])
```

**Diagram sources**
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [databaseService.ts](file://src/core/storage/databaseService.ts#L334-L363)

**Section sources**
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L6-L33)
- [databaseService.ts](file://src/core/storage/databaseService.ts#L334-L363)
- [databaseService.ts](file://src/core/storage/databaseService.ts#L929-L941)
- [repoIndexer.ts](file://src/core/indexing/repoIndexer.ts#L28-L121)

### **New** Persistent Chat Threads with Plan Execution
Purpose
- Provide long-term conversation management with thread persistence.
- Enable plan-based execution with surgical text replacement capabilities.
- Support token usage tracking and conversation history management.

**Enhanced** Chat Infrastructure
- ConversationService manages thread lifecycle with JSON persistence.
- Thread-based conversation storage with automatic ordering by update time.
- PlanService enables plan execution with markdown file storage.
- ChatController orchestrates chat graph execution with thread management.

Chat Thread Management
- Thread creation with UUID generation and timestamp tracking.
- Automatic thread ordering by last update time.
- Conversation persistence with separate JSON files per thread.
- Token usage tracking and preview generation for thread lists.

Plan Execution Workflow
- PlanService stores plans in `.repomix/plans` directory.
- Surgical text replacement with exact whitespace matching.
- Ambiguity detection and error handling for plan edits.
- Integration with chat graph for plan & execute loops.

```mermaid
flowchart TD
Start(["ChatController.handleMessage()"]) --> Load["conversationService.getThreads()"]
Load --> Create["conversationService.createThread()"]
Create --> GetConv["conversationService.getConversation(threadId)"]
GetConv --> RunGraph["createChatGraph().invoke()"]
RunGraph --> SaveMsg["conversationService.saveMessage()"]
SaveMsg --> UpdateThread["updateThreadAfterMessage()"]
UpdateThread --> PostThreads["postThreads()"]
PostThreads --> Response["post chatResponse"]
Response --> End(["Chat Complete"])
```

**Diagram sources**
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L38-L302)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [graph.ts](file://src/chat/graph.ts#L11-L67)

**Section sources**
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [chat.ts](file://src/types/chat.ts#L1-L35)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [graph.ts](file://src/chat/graph.ts#L11-L67)

## Dependency Analysis
- Bundle Management
  - Depends on VS Code workspace and file system APIs.
  - Used by creation command and execution queue manager.
- Agent
  - Depends on EmbeddingService and VectorDB adapter factory.
  - Uses structured LLM clients and caches.
  - Persists run history via DatabaseService.
  - **Enhanced** Integrates with enhanced AST compression system for improved context across seven programming languages with comprehensive metadata tracking.
  - **New** Utilizes BranchMaintenanceService for branch-aware cleanup.
- **New** Enhanced Compression System
  - Depends on Tree-sitter WASM parsers and language-specific strategies.
  - Integrates with LanguageParser for unified access to parsers.
  - Supports seven programming languages with shared infrastructure.
  - Dedicated strategies for TypeScript, JavaScript, Dart, Python, C#, and Rust.
  - **Enhanced** Provides ProcessedFile metadata for transparent compression tracking.
  - Includes comprehensive error handling and fallback mechanisms.
- **New** Chat System
  - Depends on ConversationService for thread persistence.
  - Integrates with PlanService for plan execution capabilities.
  - Uses ChatController for UI integration and message handling.
  - Leverages DatabaseService for agent run history storage.
- Clipboard
  - Uses OS-specific commands and a Windows helper binary.
  - Integrates with temp directory manager and VS Code clipboard API.
- Commands and Webview
  - runRepomix orchestrates CLI flags, execution, and post-processing.
  - ExecutionQueueManager coordinates runs and cancellation.

```mermaid
graph LR
BM["BundleManager"] --> CB["createBundle"]
CB --> RR["runRepomix"]
RR --> CT["copyToClipboard"]
AC["AgentController"] --> GR["createSmartRepomixGraph"]
GR --> ND["Agent Nodes"]
ND --> PF["ProcessedFile Metadata"]
ND --> EMB["EmbeddingService"]
ND --> VDF["VectorDB Factory"]
ND --> COMP["Enhanced AST Compression"]
COMP --> LP["LanguageParser"]
LP --> TPS["TypeScriptParseStrategy"]
LP --> DPS["DartParseStrategy"]
LP --> PPS["PythonParseStrategy"]
LP --> CSP["CsharpParseStrategy"]
LP --> RPS["RustParseStrategy"]
CT --> RCH["RemoteClipboardHandler"]
EQM["ExecutionQueueManager"] --> RR
BMS["BranchMaintenanceService"] --> RI["RepoIndexer"]
CS["ConversationService"] --> PC["PlanService"]
PC --> CC["ChatController"]
CC --> CG["ChatGraph"]
TC["testCompression"] --> COMP
```

**Diagram sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)
- [runRepomix.ts](file://src/commands/runRepomix.ts#L48-L154)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L44-L178)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L26-L88)
- [TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L11-L62)
- [DartParseStrategy.ts](file://src/core/compression/strategies/DartParseStrategy.ts#L11-L118)
- [PythonParseStrategy.ts](file://src/core/compression/strategies/PythonParseStrategy.ts#L11-L118)
- [CsharpParseStrategy.ts](file://src/core/compression/strategies/CsharpParseStrategy.ts#L11-L118)
- [RustParseStrategy.ts](file://src/core/compression/strategies/RustParseStrategy.ts#L11-L118)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L10-L190)
- [ExecutionQueueManager.ts](file://src/webview/services/ExecutionQueueManager.ts#L15-L133)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [graph.ts](file://src/chat/graph.ts#L11-L67)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)
- [state.ts](file://src/agent/state.ts#L3-L12)

**Section sources**
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L6-L117)
- [createBundle.ts](file://src/commands/createBundle.ts#L7-L31)
- [runRepomix.ts](file://src/commands/runRepomix.ts#L48-L154)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L52-L160)
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L44-L178)
- [graph.ts](file://src/agent/graph.ts#L8-L67)
- [nodes.ts](file://src/agent/nodes.ts#L129-L742)
- [embeddingService.ts](file://src/core/indexing/embeddingService.ts#L17-L68)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L17-L62)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L74-L132)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L26-L88)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L12-L32)
- [conversationService.ts](file://src/services/conversationService.ts#L39-L157)
- [ChatController.ts](file://src/webview/controllers/ChatController.ts#L14-L303)
- [planService.ts](file://src/services/planService.ts#L10-L96)
- [testCompression.ts](file://src/commands/testCompression.ts#L1-L38)
- [state.ts](file://src/agent/state.ts#L3-L12)

## Performance Considerations
- Agent
  - Parallel batching with controlled concurrency reduces LLM calls while maintaining rate limits.
  - Response caching minimizes repeated computations for identical queries.
  - Fallbacks prevent stalls when vector DB or network calls fail.
  - **Enhanced** AST compression reduces context size while preserving semantic meaning across seven programming languages with comprehensive metadata tracking.
  - **Enhanced** ProcessedFile metadata enables better context optimization decisions with compressionLevel and token tracking.
- **New** Enhanced Compression System
  - Tree-sitter parser initialization and caching minimize overhead.
  - Language-specific strategies optimize parsing for different code constructs.
  - Advanced body replacement strategy with reverse-order processing preserves indices efficiently.
  - Deduplication and chunk merging reduce memory usage and processing time.
  - Support for seven programming languages with efficient resource sharing.
  - **Enhanced** Comprehensive error handling with fallback mechanisms prevents performance degradation from compression failures.
  - **Enhanced** Metadata tracking adds minimal overhead while providing valuable insights for optimization.
- **New** Branch Maintenance
  - Batch processing of stale branches prevents performance degradation.
  - Graceful error handling ensures cleanup doesn't block main operations.
  - Efficient branch comparison using Set data structures.
  - Schema-aware detection with timestamped legacy table migration ensures database reliability.
- Indexing
  - Chunked saves and deterministic sorting improve reliability for large repositories.
  - Binary pattern exclusions reduce noise and speed up scans.
  - **Enhanced** Branch-aware indexing prevents redundant processing across branches.
- Clipboard
  - Content mode avoids disk I/O and is instant.
  - File mode leverages native OS mechanisms or a lightweight helper binary.

## Troubleshooting Guide
Common Issues and Resolutions
- Missing API Keys
  - Agent requires a valid API key; without it, runs fail early with a clear message. Save the key in settings or secrets.
- Vector DB Adapter Not Available
  - If the adapter cannot be acquired, the agent falls back to basic file listing. Verify provider configuration and credentials.
- Clipboard Failures
  - On Linux, ensure the required tool is installed; on Windows, confirm the helper binary is present and executable.
  - Remote clipboard sessions require the Windows helper binary; verify its presence and permissions.
- Bundle Persistence Errors
  - Initialization and save operations log and surface errors; check workspace permissions and disk availability.
- **New** Enhanced Compression Issues
  - Tree-sitter WASM parser loading failures indicate missing language support files.
  - AST parsing errors often result from unsupported language features or corrupted source code.
  - Verify language detection matches expected file extensions (.ts, .tsx, .js, .jsx, .dart, .py, .cs, .rs).
  - Check that the corresponding `.wasm` files are present in `assets/tree-sitter-wasm/`.
  - **Enhanced** Compression failures trigger fallback to full content with detailed logging for debugging.
  - **Enhanced** ProcessedFile metadata helps identify which files failed compression and why.
  - **Enhanced** Advanced body replacement strategy requires proper body detection and replacement logic.
- **New** Branch Maintenance Failures
  - Stale branch cleanup may fail due to permission issues with vector database adapters.
  - Git branch detection failures require proper Git installation and repository access.
  - Database connection issues prevent branch tracking and cleanup operations.
  - Schema migration failures with timestamped legacy tables require manual intervention.
- **New** Chat Thread Persistence
  - Thread creation failures indicate workspace permission issues or disk space constraints.
  - Plan file corruption requires manual recovery or regeneration of plan content.
  - Conversation loading errors suggest JSON format issues in thread files.

**Section sources**
- [AgentController.ts](file://src/webview/controllers/AgentController.ts#L51-L55)
- [nodes.ts](file://src/agent/nodes.ts#L216-L229)
- [copyToClipboard.ts](file://src/core/files/copyToClipboard.ts#L112-L118)
- [remoteClipboardHandler.ts](file://src/webview/handlers/remoteClipboardHandler.ts#L107-L132)
- [bundleManager.ts](file://src/core/bundles/bundleManager.ts#L26-L29)
- [compressFile.ts](file://src/core/compression/compressFile.ts#L128-L131)
- [BranchMaintenanceService.ts](file://src/core/indexing/BranchMaintenanceService.ts#L28-L31)
- [conversationService.ts](file://src/services/conversationService.ts#L46-L49)
- [planService.ts](file://src/services/planService.ts#L66-L94)
- [state.ts](file://src/agent/state.ts#L3-L12)

## Conclusion
Repomix Runner Plus delivers a comprehensive toolkit with enhanced capabilities:
- Bundle Management enables persistent, reusable configurations.
- AI-Powered File Selection automates discovery and packaging with semantic search, LLM-based filtering, and **enhanced** AST-based compression across seven programming languages with comprehensive metadata tracking.
- Enhanced Clipboard Operations provide flexible, cross-platform output delivery, including remote environments.
- **New** Enhanced AST-Based Compression System improves context quality through intelligent file compression across TypeScript, JavaScript, Dart, Python, C#, Rust, and enhanced language strategies, plus comprehensive metadata tracking for transparency and debugging.
- **New** Branch-Aware Indexing Architecture ensures accurate search results across repository branches with automatic maintenance and schema-aware database reliability.
- **New** Persistent Chat Threads with Plan Execution enable long-term conversation management and plan-based task execution.

These features integrate cleanly through commands, webview controllers, and shared services, offering robust workflows for developers who want reliable, repeatable, and intelligent file packaging with enhanced semantic understanding, comprehensive compression tracking, and conversation management capabilities across multiple programming languages.