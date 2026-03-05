## Repomix Runner Roadmap (Index → Search → Copy & Chat)

This roadmap lists concrete tasks to ship a marketplace-ready version of the extension, with a reliable path to index a repo, run semantic search, copy results, and (optionally) use the HITL chat.

### Priority Legend
- **P0** – Blocker for “index/search/copy” v1
- **P1** – Important soon after v1
- **P2** – Nice-to-have / future

### 1. Indexing & Vector Store
- [ ] **P0** Verify end‑to‑end manual indexing flow (webview → IndexingController → IndexingService → repoIndexer → RepoEmbeddingOrchestrator → vector DB) on large repos; add an integration test that asserts:
  - index counts in SQLite match filesystem file count (respecting .gitignore/binary filters).
  - vector counts in Pinecone/Qdrant are non‑zero and roughly proportional to file size.
- [ ] **P0** Harden background indexing watcher (extension.ts + RepoIndexMonitor + embedPendingFiles):
  - ensure file events on large repos are debounced correctly and do not starve the UI.
  - verify delete‑then‑upsert semantics actually remove “ghost” vectors after file deletes.
  - add regression tests for branch switches (BranchMaintenanceService cleanup).
- [ ] **P0** Make “Delete repo index” a full reset: confirm that DatabaseService.clearRepoFiles + adapter.deleteIndex(...) are both invoked (or explicitly document that vector DB cleanup is done elsewhere).
- [ ] **P1** Document the two indexing modes (manual “Index Repo” vs background indexing) and how they interact, including recommended settings for monorepos vs small projects.

### 2. Embedding Providers & Compatibility
- [ ] **P0** Ensure dimension‐compatibility gating is fully wired:
  - ConfigController.handleCheckCompatibility should call getVectorDbAdapterForRepo(...).getIndexMetadata and compare against embeddingService.getDimensions().
  - When mismatched, webview receives CompatibilityStatusSchema with blocked=true and IndexingService refuses to start; add tests for Pinecone & Qdrant.
- [ ] **P0** Add explicit search‑time support for the OpenRouter embedding provider in IndexingController.handleSearchRepo (mirroring the LM Studio/Ollama branches) so that search works when provider === 'openrouter'.
- [ ] **P1** Clarify configuration UX in Settings: for each embedding provider surface which fields are required, typical models/dimensions, and how they relate to vector DB dimensions (linking to the “Test dimension” helpers).
- [ ] **P1** Add unit tests for ConfigController.handleSetEmbeddingConfig to cover:
  - dimension change prompting + local index reset;
  - secret storage for OpenRouter keys;
  - re‑initialization of embeddingService for all four providers.

### 3. Search Workflow & Copy UX
- [ ] **P0** Relax Google API key requirement in validateInputsNode:
  - allow a “vector‑only” path when smartFilterEnabled is false (no query expansion or LLM rerank).
  - only require googleApiKey when smartFilterEnabled is true or when reranking is enabled.
  - add tests for both modes.
- [ ] **P0** When search runs with an empty or missing index, surface a clear repoSearchError instructing the user to run “Index Repo” or enable background indexing, instead of silently returning zero hits.
- [ ] **P0** Add an integration test that drives IndexingController.handleSearchRepo end‑to‑end (with an in‑memory or stub vector DB) and asserts:
  - correct branching between vector‑only vs LLM‑filtered search;
  - grouping toggle (repomix.search.enableGrouping) produces one hit per file when enabled.
- [ ] **P0** Verify the three copy flows from search results work on large selections and with compression enabled:
  - Copy search output (single summary file).
  - Copy search results as Markdown (runRepomixClipboardGenerateMarkdown + compression).
  - Copy file paths as @relative/path tokens.
  Add tests around error cases (missing files, clipboard failures) and ensure repoSearchError/copyError messages are shown in the webview.
- [ ] **P1** Provide small in‑UI hints or a “How search works” link explaining the role of embeddings, vector DB, and optional smart filter/rerank.

### 4. Compression (AST Skeletons)
- [ ] **P0** Add targeted unit tests for compressFile/compressFileWithTokens for all supported languages (TS/JS, Dart, Python, C#, Rust), asserting:
  - bodies are replaced while signatures/imports remain;
  - keepNames behaves as documented;
  - unsupported extensions return null and callers fall back gracefully.
- [ ] **P0** Verify tree‑sitter WASM packaging on all platforms (dist/tree-sitter-wasm and assets fallback) and add a smoke test that exercises LanguageParser.resolveWasmPath in the built extension.
- [ ] **P2** Implement optional enrichment injection in compression (based on src/test-enrichment-retrieval.ts):
  - extend CompressionOptions with enableEnrichment and repoId/filePath metadata.
  - add a small enrichment loader that queries the code_enrichments table and decorates compressed output.
  - convert src/test-enrichment-retrieval.ts from an ad‑hoc script into Mocha tests under src/test/**.

### 5. Chat / HITL Workflow
- [ ] **P1** Treat PostgreSQL as optional but first‑class:
  - keep the existing “chatDisabled” message flow when initError is set, but document the requirement for repomix.chat.postgresConnectionString and migrations.
  - add a minimal happy‑path integration test that spins up a test DB, runs migrations, and exercises a short chat run through gatherContext → compressContext → prepareGoal → humanReviewGoal.
- [ ] **P1** Implement durable queue persistence for MessageQueue (PRD 007):
  - move saveQueueState/restoreQueueState from workspaceState into Postgres so queue survives VS Code restarts and remote workspaces.
  - add tests for “queued while offline, resumes on reopen”.
- [ ] **P2** Expand package manager/batch tests (BatchManager + BatchPoller + ChatController) to cover retry, cancel, and multi‑package flows, ensuring webview state stays in sync with batchStatus events.

### 6. Index History & Observability
- [ ] **P1** Ensure index history events (queued, flush, embedding_complete, embedding_failed) are emitted consistently from RepoEmbeddingOrchestrator and background watcher paths, and surfaced in the webview via IndexHistoryController.
- [ ] **P1** Add a compact “Indexing status” section in the Settings or Indexing tab that shows:
  - last full index time;
  - number of files indexed vs pending;
  - vector count per repo (using describeRepoStats/RepoIndexCount).

### 7. Testing & Release Checklist
- [ ] **P0** Flesh out automated tests following src/test/AGENTS.md:
  - unit tests for embeddingService queueing, IndexingService, ConfigController, search nodes, and compression.
  - integration tests for extension activation, manual indexing, search + copy results, and minimal chat flow.
- [ ] **P0** Add a CI job that runs npm run check-types && npm run lint && npm run test on every push and PR.
- [ ] **P0** Update README / marketplace description to document:
  - how to configure embeddings and vector DB (with provider‑specific examples).
  - how to run “Index Repo”, background indexing expectations, and how to run search + copy flows.
  - optional chat setup (Postgres + Anthropic/OpenRouter keys).
- [ ] **P0** Run a manual smoke‑test matrix before publishing:
  - macOS, Linux, and Windows;
  - Pinecone and Qdrant;
  - Gemini vs at least one local provider (Ollama or LM Studio);
  - repos of varying size (small library, medium app, large monorepo).

