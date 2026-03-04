# Vector Database Adapters

<cite>
**Referenced Files in This Document**
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts)
- [types.ts](file://src/core/indexing/vectorDb/types.ts)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts)
- [retryService.ts](file://src/core/indexing/retryService.ts)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx)
- [migrationService.ts](file://src/core/indexing/migrationService.ts)
</cite>

## Update Summary
**Changes Made**
- Enhanced Qdrant adapter with pre-flight dimension validation and vector value validation
- Improved error handling for dimension mismatches with specific error messages
- Added comprehensive vector validation including NaN and Infinity checks
- Enhanced error reporting with detailed debugging information
- Updated factory pattern with collection existence verification

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Enhanced Qdrant Adapter Validation](#enhanced-qdrant-adapter-validation)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)
11. [Appendices](#appendices)

## Introduction
This document explains the Vector Database Adapters system that enables pluggable backends for vector storage and retrieval. It covers the adapter pattern implementation, Pinecone and Qdrant adapters, the factory that selects adapters based on configuration, connection and credential management, retry and error handling, and operational guidance for scaling, cost control, and monitoring.

**Updated** Enhanced with comprehensive validation mechanisms for Qdrant adapter to prevent dimension mismatches and ensure data integrity.

## Project Structure
The vector database subsystem is organized around a small set of cohesive modules:
- An adapter interface and types define the contract for pluggable backends.
- Two concrete adapters implement the interface for Pinecone and Qdrant.
- A factory resolves the appropriate adapter per repository based on persisted settings and secrets.
- A shared service encapsulates Pinecone client reuse and advanced deletion semantics.
- A retry utility provides exponential backoff for transient failures.
- The embedding pipeline integrates adapters with batching, concurrency, and retries.
- The UI controller and settings manage provider selection, credentials, and connectivity testing.

```mermaid
graph TB
subgraph "Vector DB Layer"
Types["types.ts<br/>Adapter interface + types"]
Factory["factory.ts<br/>Adapter factory"]
PineconeAdapter["pineconeAdapter.ts<br/>Pinecone adapter"]
QdrantAdapter["qdrantAdapter.ts<br/>Qdrant adapter<br/>Enhanced Validation"]
PineconeService["pineconeService.ts<br/>Client reuse + delete-by-metadata"]
Retry["retryService.ts<br/>Exponential backoff"]
end
subgraph "Indexing Pipeline"
Pipeline["fileEmbeddingPipeline.ts<br/>Embed + upsert with retries/batching"]
end
subgraph "UI & Config"
Ctl["ConfigController.ts<br/>Provider switch + connectivity tests"]
UI["SettingsTab.tsx<br/>Credential inputs + actions"]
end
Types --> PineconeAdapter
Types --> QdrantAdapter
Factory --> PineconeAdapter
Factory --> QdrantAdapter
Pipeline --> Factory
Pipeline --> Retry
PineconeAdapter --> PineconeService
Ctl --> Factory
UI --> Ctl
```

**Diagram sources**
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L1-L200)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L1-L1791)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)

**Section sources**
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L1-L200)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L1-L1791)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)

## Core Components
- Adapter interface and types: Defines the contract for upsert, query, delete, and metadata operations, plus shared types for vectors and results.
- Pinecone adapter: Wraps a service that manages a Pinecone client instance and implements namespace-scoped upsert, query, and deletions.
- Qdrant adapter: Implements deterministic vector IDs, payload-based filtering, and collection metadata extraction with enhanced validation.
- Factory: Selects provider and constructs the adapter using persisted settings and secrets.
- Retry utility: Provides exponential backoff with configurable parameters.
- Embedding pipeline: Orchestrates chunking, embedding, batching, and upsert with retries and concurrency controls.

**Section sources**
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L1-L200)

## Architecture Overview
The system separates concerns across layers:
- UI layer persists provider and credentials and triggers connectivity checks.
- Factory layer resolves the adapter based on current configuration.
- Adapter layer abstracts backend-specific operations.
- Shared services encapsulate provider-specific logic (e.g., Pinecone client reuse and advanced deletion).
- Pipeline layer coordinates embedding and upsert with retries and concurrency.

```mermaid
sequenceDiagram
participant UI as "SettingsTab.tsx"
participant Ctl as "ConfigController.ts"
participant GS as "GlobalState/Secrets"
participant Fac as "factory.ts"
participant Ad as "Adapter (Pinecone/Qdrant)"
participant DB as "Vector DB"
UI->>Ctl : "setVectorDbProvider(provider)"
Ctl->>GS : "store provider + validate creds"
Ctl-->>UI : "provider updated"
UI->>Ctl : "testQdrantConnection(url,collection,apiKey?)"
Ctl->>Ad : "construct adapter (Qdrant)"
Ad->>DB : "getCollections()"
DB-->>Ad : "collections list"
Ad-->>Ctl : "success/failure"
Ctl-->>UI : "qdrantConnectionResult"
UI->>Ctl : "getVectorDbProvider()"
Ctl->>Fac : "getVectorDbAdapterForRepo(ctx, repoId)"
Fac->>GS : "read provider + secrets"
Fac-->>Ctl : "{provider, adapter}"
Ctl-->>UI : "vectorDbProvider"
```

**Diagram sources**
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L1-L1791)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)

## Detailed Component Analysis

### Adapter Pattern and Types
- The adapter interface defines the operations that all backends must implement: upsert, query, deleteRepo, deleteVectorsForFile, describeRepoStats (optional), getIndexMetadata (optional), and deleteIndex.
- Vectors carry id, numeric values, and arbitrary metadata; query results include id, score, and optional metadata.
- IndexMetadata exposes dimension, count, and metric.

```mermaid
classDiagram
class VectorDbAdapter {
+provider
+upsertVectors(args)
+queryVectors(args)
+deleteRepo(args)
+deleteVectorsForFile(args)
+describeRepoStats(args)
+getIndexMetadata(args)
+deleteIndex(args)
}
class PineconeAdapter {
+provider
+constructor(cfg, svc?)
+upsertVectors(...)
+queryVectors(...)
+deleteRepo(...)
+deleteVectorsForFile(...)
+describeRepoStats(...)
+getIndexMetadata(...)
+deleteIndex(...)
}
class QdrantAdapter {
+provider
+constructor(baseUrl, apiKey?, collection)
+upsertVectors(...)
+queryVectors(...)
+deleteRepo(...)
+deleteVectorsForFile(...)
+describeRepoStats(...)
+getIndexMetadata(...)
+deleteIndex(...)
}
VectorDbAdapter <|.. PineconeAdapter
VectorDbAdapter <|.. QdrantAdapter
```

**Diagram sources**
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)

**Section sources**
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)

### Pinecone Adapter
- Constructor accepts API key, index name, and optional host; uses a shared service for client reuse and namespace-scoped operations.
- Upsert enforces repoId in metadata and writes under a namespace equal to repoId.
- Query scopes by namespace and returns matches with id, score, and metadata.
- Deletion supports two strategies:
  - Metadata-based deletion by filePath when supported.
  - Fallback to ID prefix listing and batch deletion when metadata filtering is unavailable.
- Stats and metadata extraction rely on index stats and describeIndex.

```mermaid
flowchart TD
Start(["deleteVectorsForFile"]) --> TryMeta["Try metadata filter by filePath"]
TryMeta --> MetaOK{"Success?"}
MetaOK --> |Yes| Done["Return"]
MetaOK --> |No| Fallback["List by ID prefix<br/>Batch delete"]
Fallback --> Done
```

**Diagram sources**
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)

**Section sources**
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)

### Qdrant Adapter
- Validates base URL and collection presence; for hosted instances, requires an API key.
- Generates deterministic vector IDs using a fixed namespace and a hash of identifying parts.
- Upserts vectors with payload containing repoId and metadata; waits for write completion.
- Query filters by repoId and returns matches with scores and payloads.
- Deletions use filter expressions for repoId and optionally filePath.
- Metadata extraction reads collection config for dimension and distance metric.

**Updated** Enhanced with comprehensive pre-flight validation including dimension checking and vector value validation.

```mermaid
sequenceDiagram
participant P as "Pipeline"
participant A as "QdrantAdapter"
participant Q as "QdrantClient"
P->>A : "upsertVectors({repoId, vectors})"
A->>A : "Pre-flight validation"
A->>Q : "getCollection()"
Q-->>A : "collection info"
A->>A : "validate dimensions & values"
A->>Q : "upsert(collection, points)"
Q-->>A : "ack"
A-->>P : "done"
```

**Diagram sources**
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L70-L125)

**Section sources**
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)

### Factory Pattern
- Reads provider from global state and selects Pinecone or Qdrant.
- Pinecone:
  - Retrieves API key from secrets.
  - Resolves index name and optional host per repo from a map stored in global state.
- Qdrant:
  - Reads base URL and collection from global state.
  - Validates API key presence for hosted instances.
  - Verifies collection existence before returning adapter.
- Throws descriptive errors when required configuration is missing.

```mermaid
flowchart TD
A["getVectorDbAdapterForRepo(ctx, repoId)"] --> ReadProv["Read provider from global state"]
ReadProv --> IsPinecone{"provider == 'pinecone'?"}
IsPinecone --> |Yes| PC["Load apiKey + repo index map"]
PC --> PCValid{"apiKey + indexName?"}
PCValid --> |Yes| MakePC["new PineconeAdapter(cfg)"]
PCValid --> |No| ErrPC["throw"]
IsPinecone --> |No| IsQdrant{"provider == 'qdrant'?"}
IsQdrant --> |Yes| QCfg["Load baseUrl + collection + apiKey"]
QCfg --> QValid{"baseUrl + collection?"}
QValid --> |Yes| VerifyColl["Verify collection exists"]
VerifyColl --> CollOK{"Collection exists?"}
CollOK --> |Yes| MakeQ["new QdrantAdapter(baseUrl, apiKey, collection)"]
CollOK --> |No| CollErr["throw collection error"]
QValid --> |No| ErrQ["throw"]
IsQdrant --> |No| ErrProv["throw unsupported provider"]
```

**Diagram sources**
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)

**Section sources**
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)

### Connection Pooling, Retry, and Error Handling
- Pinecone client reuse: The Pinecone service caches a client keyed by API key to avoid repeated initialization.
- Exponential backoff: The retry utility implements capped exponential backoff with configurable max retries, initial delay, max delay, and multiplier.
- Pipeline integration: The embedding pipeline applies retries around upsert batches and uses concurrency controls to balance throughput and stability.
- Adapter error handling: Adapters log structured context and rethrow with normalized messages; some stats calls return null to fail-safe when unavailable.

```mermaid
flowchart TD
S(["Embedding Pipeline"]) --> Batch["Split into batches"]
Batch --> Concurrency["Concurrent upserts"]
Concurrency --> Retry["retryWithBackoff(fn, ctx, cfg)"]
Retry --> OK{"Success?"}
OK --> |Yes| Next["Next batch"]
OK --> |No| Backoff["Wait with exponential backoff"]
Backoff --> Retry
```

**Diagram sources**
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L407-L438)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L51-L59)

**Section sources**
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L51-L59)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L407-L438)

### Configuration and UI Integration
- UI settings collect provider, credentials, and backend-specific parameters.
- Connectivity tests:
  - Pinecone: Lists indexes using the provided key.
  - Qdrant: Creates a client, lists collections, and optionally creates the configured collection with a default vector config.
- Provider switching:
  - Validates prerequisites, updates provider, resets local index state, and triggers compatibility checks.

```mermaid
sequenceDiagram
participant UI as "SettingsTab.tsx"
participant C as "ConfigController.ts"
participant S as "Secrets"
participant G as "GlobalState"
participant A as "Adapter"
UI->>C : "setVectorDbProvider('qdrant')"
C->>S : "validate creds"
C->>G : "update provider + clear local index state"
C-->>UI : "provider updated + compatibility status"
```

**Diagram sources**
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L251-L286)
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)

**Section sources**
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L251-L286)
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)

## Enhanced Qdrant Adapter Validation

**New Section** The Qdrant adapter now includes comprehensive validation mechanisms to prevent dimension mismatches and ensure data integrity before upsert operations.

### Pre-Flight Dimension Checking
The adapter performs validation checks before processing any upsert operation:

1. **Collection Existence Verification**: Checks if the target collection exists in Qdrant
2. **Dimension Extraction**: Reads the expected vector dimension from collection configuration
3. **Vector Dimension Validation**: Validates that all incoming vectors match the expected dimension
4. **Vector Value Validation**: Ensures all vector values are valid numbers (no NaN or Infinity)

### Vector Value Validation
The adapter includes robust validation for vector data integrity:

- **NaN Detection**: Validates that no vector contains NaN values
- **Infinity Detection**: Ensures vectors don't contain Infinity values
- **Type Validation**: Confirms all vector values are numbers
- **Finite Number Check**: Verifies all values are finite numbers

### Enhanced Error Handling
The adapter provides detailed error messages for different failure scenarios:

- **Dimension Mismatch Errors**: Specific error messages indicating expected vs actual dimensions
- **Invalid Vector Values**: Clear indication of problematic vector values
- **Collection Not Found**: Guidance for creating collections with correct dimensions
- **API Response Details**: Comprehensive logging with HTTP status codes and error responses

### Validation Flow
```mermaid
flowchart TD
Start(["upsertVectors"]) --> GetColl["getCollection()"]
GetColl --> CheckExists{"Collection exists?"}
CheckExists --> |No| CollErr["Throw collection error"]
CheckExists --> |Yes| ExtractDim["Extract expected dimension"]
ExtractDim --> ValidateVecs["Validate all vectors"]
ValidateVecs --> DimMatch{"Dimensions match?"}
DimMatch --> |No| DimErr["Throw dimension error"]
DimMatch --> |Yes| ValMatch{"Values valid?"}
ValMatch --> |No| ValErr["Throw validation error"]
ValMatch --> |Yes| Upsert["Perform upsert"]
```

**Diagram sources**
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L70-L125)

**Section sources**
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L70-L125)

## Dependency Analysis
- Cohesion: Each adapter encapsulates backend specifics; the factory centralizes selection logic; the service isolates Pinecone client reuse.
- Coupling: The pipeline depends on the adapter interface; adapters depend on third-party SDKs; the factory depends on secrets/global state.
- External dependencies: Pinecone SDK and Qdrant REST client.
- Potential circularities: None observed among the analyzed modules.

```mermaid
graph LR
Pipeline["fileEmbeddingPipeline.ts"] --> Types["types.ts"]
Pipeline --> Retry["retryService.ts"]
Pipeline --> Factory["factory.ts"]
Factory --> PineconeAdapter["pineconeAdapter.ts"]
Factory --> QdrantAdapter["qdrantAdapter.ts"]
PineconeAdapter --> PineconeService["pineconeService.ts"]
ConfigCtl["ConfigController.ts"] --> Factory
ConfigCtl --> Migration["migrationService.ts"]
UI["SettingsTab.tsx"] --> ConfigCtl
```

**Diagram sources**
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L1-L200)
- [types.ts](file://src/core/indexing/vectorDb/types.ts#L1-L55)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L1-L1791)
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)

**Section sources**
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [pineconeService.ts](file://src/core/indexing/pineconeService.ts#L1-L358)
- [retryService.ts](file://src/core/indexing/retryService.ts#L1-L71)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L1-L200)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L1-L1791)
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L1-L1668)

## Performance Considerations
- Batching and concurrency:
  - Use vectorDbBatchSize and maxConcurrentUpserts to tune throughput and reduce per-request overhead.
  - Keep embeddingBatchSize aligned with provider limits and latency targets.
- Retry strategy:
  - Increase maxRetries moderately; ensure backoff caps prevent thundering herds.
- Pinecone:
  - Prefer metadata-based deletion when supported to minimize round trips; fall back gracefully.
  - Use namespaces to isolate repositories and simplify cleanup.
- Qdrant:
  - Ensure collection vector config (size and distance) matches embedding dimensions.
  - Use filter expressions to constrain queries and reduce payload sizes.
  - **Updated** Leverage pre-flight validation to catch dimension mismatches early and avoid expensive failed operations.
- Monitoring:
  - Track upsert durations, query latencies, and error rates per provider.
  - Observe vector counts and growth trends to right-size clusters.
  - Monitor validation error rates to identify embedding provider issues.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Missing credentials:
  - Pinecone: Ensure API key is saved; provider selection requires a key.
  - Qdrant: For hosted instances, API key is mandatory; local instances may omit it.
- Provider switching:
  - Use the migration service to validate credentials and reset local index state.
  - After switching, compatibility checks will block indexing if dimensions mismatch.
- Connectivity tests:
  - Pinecone: Verify API key and index availability.
  - Qdrant: Confirm URL format, server accessibility, and collection existence.
- Error handling:
  - Adapters log structured context and rethrow with normalized messages.
  - Pipeline wraps concurrent failures as indexing errors for better diagnostics.
- **Updated** Dimension mismatch issues:
  - Check embedding provider configuration matches collection dimensions.
  - Use the Settings tab to verify collection configuration.
  - Review validation error messages for specific dimension requirements.
  - Ensure embedding provider outputs match collection vector size.

**Section sources**
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L251-L286)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L321-L445)
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)
- [pineconeAdapter.ts](file://src/core/indexing/vectorDb/providers/pineconeAdapter.ts#L1-L129)
- [qdrantAdapter.ts](file://src/core/indexing/vectorDb/providers/qdrantAdapter.ts#L1-L453)
- [fileEmbeddingPipeline.ts](file://src/core/indexing/fileEmbeddingPipeline.ts#L145-L184)

## Conclusion
The Vector Database Adapters system cleanly separates backend concerns behind a unified interface, enabling seamless switching between Pinecone and Qdrant. Robust configuration management, connectivity testing, and retry/backoff strategies improve reliability. The embedding pipeline integrates these components with batching and concurrency controls, while migration and compatibility checks support safe provider transitions.

**Updated** The enhanced Qdrant adapter validation significantly improves system reliability by catching dimension mismatches and invalid vector data before they cause failures, providing clear error messages and preventing wasted computational resources.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Configuration Examples
- Pinecone
  - Provider: pinecone
  - Credentials: stored as a secret
  - Selection: per-repo index/host mapping in global state
- Qdrant
  - Provider: qdrant
  - Credentials: stored as a secret (required for hosted)
  - Selection: global base URL and collection
  - **Updated** Collection must have matching vector dimensions for embedding provider

**Section sources**
- [factory.ts](file://src/core/indexing/vectorDb/factory.ts#L1-L87)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L288-L309)
- [SettingsTab.tsx](file://src/webview/components/SettingsTab.tsx#L120-L200)

### Migration Procedures
- Switch provider:
  - Validate credentials and update provider in global state.
  - Reset local index state for the current repository to trigger re-indexing.
  - Run compatibility checks to ensure embedding and index dimensions match.
  - **Updated** Verify collection dimensions match new embedding provider configuration.

**Section sources**
- [migrationService.ts](file://src/core/indexing/migrationService.ts#L1-L63)
- [ConfigController.ts](file://src/webview/controllers/ConfigController.ts#L251-L286)

### Scalability and Cost Optimization
- Horizontal scaling:
  - Use provider-native sharding or multiple collections/namespaces.
- Index sizing:
  - Match vector dimensions to embedding model outputs.
- Query optimization:
  - Filter early and narrow payloads.
- Cost control:
  - Monitor vector counts and query volume; adjust cluster sizes accordingly.
  - Prefer metadata filtering and targeted deletions to avoid unnecessary storage churn.
  - **Updated** Use pre-flight validation to prevent failed operations that waste resources.

[No sources needed since this section provides general guidance]

### Monitoring Approaches
- Metrics to track:
  - Upsert rate and latency
  - Query latency and recall
  - Vector counts and growth rate
  - Error rates and retry counts
  - **Updated** Validation error rates and dimension mismatch occurrences
- Alerts:
  - High error rates, timeouts, and dimension mismatches
  - **Updated** Collection configuration changes and validation failures

[No sources needed since this section provides general guidance]