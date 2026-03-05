# Dimension Compatibility Gating Implementation Plan

## Current Status Analysis

Looking at the existing code:

1. **ConfigController.handleCheckCompatibility** already exists and:
   - Gets embedding dimension from configuration
   - Calls `getVectorDbAdapterForRepo(...).getIndexMetadata({ repoId })`
   - Compares dimensions and sets `repomix.indexingBlocked` flag
   - Sends `compatibilityStatus` and `indexingBlocked` messages to webview

2. **IndexingService.start()** already checks `repomix.indexingBlocked` and emits error if blocked

3. **Webview components** already handle:
   - `compatibilityStatus` message with blocked flag
   - `indexingBlocked` message to disable indexing button
   - Display warning banner when blocked

4. **Message schemas** already defined:
   - `CompatibilityStatusSchema` with all required fields
   - `IndexingBlockedSchema` 

## What Needs Implementation

### 1. Enhance ConfigController.handleCheckCompatibility [MODIFY]
File: `src/webview/controllers/ConfigController.ts`

Current implementation calls `getIndexMetadata()` but doesn't call `embeddingService.getDimensions()`. Need to:
- Import embeddingService
- Call `embeddingService.getDimensions()` instead of manually calculating from config
- This ensures we get the actual runtime dimension from the active provider

### 2. Add Tests for Vector DB Adapters [NEW]
Files to create:
- `src/test/core/indexing/vectorDb/pineconeAdapter.test.ts`
- `src/test/core/indexing/vectorDb/qdrantAdapter.test.ts`

Tests should cover:
- `getIndexMetadata()` method with various scenarios
- Dimension mismatch detection
- Error handling when connection fails
- Null return cases

### 3. Verify IndexingService Blocking Works [VERIFY]
File: `src/core/services/IndexingService.ts`

Already implemented - just need to verify it works correctly with tests.

## Implementation Steps

### Step 1: Modify ConfigController.ts
- Add import for embeddingService
- Replace manual dimension calculation with `embeddingService.getDimensions()`
- Ensure proper error handling

### Step 2: Create Pinecone Adapter Tests
- Test successful metadata retrieval
- Test dimension mismatch scenarios
- Test connection errors
- Test null/undefined responses

### Step 3: Create Qdrant Adapter Tests
- Test successful metadata retrieval
- Test dimension mismatch scenarios
- Test connection errors
- Test null/undefined responses

### Step 4: Add Integration Tests
- Test complete compatibility check flow
- Test blocking behavior in IndexingService
- Test webview message propagation

## Files to Modify/Create

**Modify:**
- `src/webview/controllers/ConfigController.ts` - Use embeddingService.getDimensions()

**Create:**
- `src/test/core/indexing/vectorDb/pineconeAdapter.test.ts`
- `src/test/core/indexing/vectorDb/qdrantAdapter.test.ts`
- `src/test/core/indexing/compatibility.test.ts` (integration tests)

## Verification Points

1. Dimension compatibility check works for both Pinecone and Qdrant
2. IndexingService properly blocks when dimensions mismatch
3. Webview displays appropriate status messages
4. Reset functionality clears the blocking flag
5. All new tests pass