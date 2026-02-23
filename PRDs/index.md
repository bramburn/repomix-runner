# Chat System Implementation Plan

## Vision

Transform the existing chat feature into a full HITL (Human-in-the-Loop) development workflow powered by LangGraph. The system uses **Gemini 2.5 Flash** for fast planning/orchestration and **Claude Opus 4** (via batch API at 50% discount) for heavy code generation. Users can queue messages, manage context intelligently, maintain persistent memory, and review/apply code changes — all within VS Code.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension                         │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Chat Tab  │  │ Packages │  │ Memory   │  │ History/     │    │
│  │ (HITL UI) │  │ Tab      │  │ Tab      │  │ Settings Tab │    │
│  └─────┬─────┘  └─────┬────┘  └─────┬────┘  └──────┬───────┘    │
│        │               │             │              │             │
│  ┌─────▼───────────────▼─────────────▼──────────────▼──────┐    │
│  │              ChatController + Message Queue               │    │
│  └─────────────────────────┬─────────────────────────────────┘    │
│                            │                                      │
│  ┌─────────────────────────▼─────────────────────────────────┐    │
│  │              LangGraph HITL Workflow                        │    │
│  │  gather → goal → [PAUSE] → package → [PAUSE] → batch →   │    │
│  │  [PAUSE] → parse → [PAUSE] → apply → [PAUSE] → summary   │    │
│  └──────┬──────────────┬──────────────────────┬──────────────┘    │
│         │              │                      │                   │
│  ┌──────▼──────┐ ┌─────▼──────┐  ┌───────────▼──────────┐       │
│  │ Gemini Flash│ │ Batch LLM  │  │ File Edit Applier    │       │
│  │ (planning)  │ │ Pipeline   │  │ (full/SEARCH/hybrid) │       │
│  └─────────────┘ └─────┬──────┘  └──────────────────────┘       │
│                         │                                         │
│  ┌──────────────────────▼────────────────────────────────────┐   │
│  │                    PostgreSQL                              │   │
│  │  threads │ messages │ memory │ batch_jobs │ architecture   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              Qdrant (existing repo vector DB)              │   │
│  │              Used for context gathering via RAG            │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## PRD Index

| # | PRD | Description | Priority | Depends On |
|---|-----|-------------|----------|------------|
| 001 | [PostgreSQL Chat Storage](001_postgresql_chat_storage.md) | Replace file-based storage with PostgreSQL for all chat data | 🔴 Critical | — |
| 002 | [LangGraph HITL Workflow](002_langgraph_hitl_workflow.md) | Redesign chat graph with interrupt/resume checkpoints | 🔴 Critical | 001 |
| 003 | [Context Compression Strategy](003_context_compression_strategy.md) | Token-aware context management with multi-level compression | 🟡 High | 001 |
| 004 | [Memory Manager CRUD](004_memory_manager_crud.md) | Persistent memory system with session and repo scopes | 🟡 High | 001 |
| 005 | [Batch LLM Pipeline](005_batch_llm_pipeline.md) | Anthropic Batch API integration for cost-effective code generation | 🔴 Critical | 001, 002 |
| 006 | [Package Manager UI](006_package_manager_ui.md) | Packages tab for managing batch job packages | 🟡 High | 005 |
| 007 | [Message Queue System](007_message_queue_system.md) | Message queuing, force-send, and stop/cancel controls | 🟢 Medium | 002 |
| 008 | [Repo Architecture Generator](008_repo_architecture_generator.md) | Auto-generated markdown architecture document for LLM context | 🟡 High | 001 |
| 009 | [File Edit Applier](009_file_edit_applier.md) | Apply batch LLM responses as workspace file changes | 🔴 Critical | 005 |
| 010 | [Chat Settings & History UI](010_chat_settings_ui.md) | Settings configuration and thread history management | 🟡 High | 001 |

---

## Implementation Phases

### Phase 1: Foundation (PRDs 001, 010)
**Goal**: Establish the data layer and configuration UI.

| Step | Action | Files | PRD |
|------|--------|-------|-----|
| 1.1 | Install `pg`, `@types/pg` | [`package.json`](../package.json) | 001 |
| 1.2 | Add `repomix.chat.*` VS Code settings | [`package.json`](../package.json) | 010 |
| 1.3 | Create PostgreSQL client + migration runner | `src/chat/db/postgresClient.ts` | 001 |
| 1.4 | Create initial migration SQL | `src/chat/db/migrations/001_initial_schema.sql` | 001 |
| 1.5 | Create thread repository | `src/chat/db/threadRepository.ts` | 001 |
| 1.6 | Create message repository | `src/chat/db/messageRepository.ts` | 001 |
| 1.7 | Create memory repository | `src/chat/db/memoryRepository.ts` | 001 |
| 1.8 | Create batch repository | `src/chat/db/batchRepository.ts` | 001 |
| 1.9 | Create architecture repository | `src/chat/db/architectureRepository.ts` | 001 |
| 1.10 | Update [`extension.ts`](../src/extension.ts) — init PG pool on activation | [`src/extension.ts`](../src/extension.ts) | 001 |
| 1.11 | Update [`ChatController`](../src/webview/controllers/ChatController.ts) — swap to PG repositories | [`src/webview/controllers/ChatController.ts`](../src/webview/controllers/ChatController.ts) | 001 |
| 1.12 | Build `ChatSettingsTab.tsx` | `src/webview/components/ai-chat/ChatSettingsTab.tsx` | 010 |
| 1.13 | Build `ChatHistoryTab.tsx` | `src/webview/components/ai-chat/ChatHistoryTab.tsx` | 010 |
| 1.14 | Update [`AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) — wire Settings/History tabs | [`src/webview/AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) | 010 |
| 1.15 | Write tests for repositories | `src/test/chat/db/*.test.ts` | 001 |

**Deliverable**: Chat works identically to before but backed by PostgreSQL. Settings and History tabs are functional.

---

### Phase 2: HITL Workflow Core (PRDs 002, 008)
**Goal**: Rebuild the chat graph with human checkpoints and architecture context.

| Step | Action | Files | PRD |
|------|--------|-------|-----|
| 2.1 | Install `@langchain/langgraph-checkpoint-postgres` | [`package.json`](../package.json) | 002 |
| 2.2 | Create PostgreSQL checkpointer factory | `src/chat/checkpointer.ts` | 002 |
| 2.3 | Build architecture sub-graph (all nodes) | `src/chat/architecture/*.ts` | 008 |
| 2.4 | Create prompt templates (goal, output instructions) | `src/chat/prompts/*.ts` | 002 |
| 2.5 | Split [`nodes.ts`](../src/chat/nodes.ts) into individual node files | `src/chat/nodes/*.ts` | 002 |
| 2.6 | Create `gatherContext` node (vector search + architecture) | `src/chat/nodes/gatherContext.ts` | 002 |
| 2.7 | Create `prepareGoal` node (Gemini Flash) | `src/chat/nodes/prepareGoal.ts` | 002 |
| 2.8 | Create `humanReviewGoal` node (interrupt) | `src/chat/nodes/humanReviewGoal.ts` | 002 |
| 2.9 | Create `packagePrompt` node | `src/chat/nodes/packagePrompt.ts` | 002 |
| 2.10 | Create `humanApproveSend` node (interrupt) | `src/chat/nodes/humanApproveSend.ts` | 002 |
| 2.11 | Create remaining HITL nodes (submit, await, process, review, apply, summary) | `src/chat/nodes/*.ts` | 002 |
| 2.12 | Rewrite [`graph.ts`](../src/chat/graph.ts) with full HITL topology | [`src/chat/graph.ts`](../src/chat/graph.ts) | 002 |
| 2.13 | Update [`state.ts`](../src/chat/state.ts) with new fields | [`src/chat/state.ts`](../src/chat/state.ts) | 002 |
| 2.14 | Update [`ChatController`](../src/webview/controllers/ChatController.ts) — handle interrupt/resume | [`src/webview/controllers/ChatController.ts`](../src/webview/controllers/ChatController.ts) | 002 |
| 2.15 | Update [`messageSchemas.ts`](../src/webview/messageSchemas.ts) — HITL message types | [`src/webview/messageSchemas.ts`](../src/webview/messageSchemas.ts) | 002 |
| 2.16 | Write tests for architecture graph and HITL nodes | `src/test/chat/*.test.ts` | 002, 008 |

**Deliverable**: Chat graph pauses at human checkpoints. Architecture document auto-generates. Graph state persists across restarts.

---

### Phase 3: Batch Pipeline (PRDs 005, 006, 009)
**Goal**: Connect to Anthropic Batch API, manage packages, apply results.

| Step | Action | Files | PRD |
|------|--------|-------|-----|
| 3.1 | Install `@anthropic-ai/sdk` | [`package.json`](../package.json) | 005 |
| 3.2 | Create batch types and output templates | `src/chat/batch/types.ts`, `outputTemplates.ts` | 005 |
| 3.3 | Create package assembler | `src/chat/batch/packageAssembler.ts` | 005 |
| 3.4 | Create Anthropic batch client | `src/chat/batch/anthropicBatchClient.ts` | 005 |
| 3.5 | Create response parser | `src/chat/batch/responseParser.ts` | 005 |
| 3.6 | Create batch poller | `src/chat/batch/batchPoller.ts` | 005 |
| 3.7 | Create batch manager | `src/chat/batch/batchManager.ts` | 005 |
| 3.8 | Create file edit types and mode selector | `src/chat/apply/types.ts`, `editModeSelector.ts` | 009 |
| 3.9 | Create full file writer | `src/chat/apply/fullFileWriter.ts` | 009 |
| 3.10 | Create SEARCH/REPLACE applier | `src/chat/apply/searchReplaceApplier.ts` | 009 |
| 3.11 | Create file edit applier orchestrator | `src/chat/apply/fileEditApplier.ts` | 009 |
| 3.12 | Build Packages tab UI | `src/webview/components/ai-chat/PackagesTab.tsx` + sub-components | 006 |
| 3.13 | Build edit review UI | `src/webview/components/ai-chat/EditReviewPanel.tsx` + sub-components | 009 |
| 3.14 | Wire batch nodes to batch manager | `src/chat/nodes/submitBatch.ts`, `processBatchResponse.ts` | 005 |
| 3.15 | Update [`extension.ts`](../src/extension.ts) — init batch poller | [`src/extension.ts`](../src/extension.ts) | 005 |
| 3.16 | Update [`AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) — add Packages tab | [`src/webview/AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) | 006 |
| 3.17 | Refactor [`codePatcher.ts`](../src/core/patching/codePatcher.ts) — extract reusable functions | [`src/core/patching/codePatcher.ts`](../src/core/patching/codePatcher.ts) | 009 |
| 3.18 | Write tests for batch pipeline and file applier | `src/test/chat/batch/*.test.ts`, `apply/*.test.ts` | 005, 009 |

**Deliverable**: Full batch workflow works end-to-end. Packages can be managed, sent, and results applied to workspace.

---

### Phase 4: Intelligence Layer (PRDs 003, 004)
**Goal**: Add context compression and persistent memory.

| Step | Action | Files | PRD |
|------|--------|-------|-----|
| 4.1 | Create compression types and token budget calculator | `src/chat/compression/types.ts`, `tokenBudget.ts` | 003 |
| 4.2 | Create history summarizer | `src/chat/compression/historySummarizer.ts` | 003 |
| 4.3 | Create file compressor (multi-level) | `src/chat/compression/fileCompressor.ts` | 003 |
| 4.4 | Create context manager orchestrator | `src/chat/compression/contextManager.ts` | 003 |
| 4.5 | Integrate compression into gather/package nodes | `src/chat/nodes/gatherContext.ts`, `packagePrompt.ts` | 003 |
| 4.6 | Create memory types and manager | `src/chat/memory/types.ts`, `memoryManager.ts` | 004 |
| 4.7 | Create memory extractor (LLM-based) | `src/chat/memory/memoryExtractor.ts` | 004 |
| 4.8 | Create memory injector | `src/chat/memory/memoryInjector.ts` | 004 |
| 4.9 | Create `extractMemory` graph node | `src/chat/nodes/extractMemory.ts` | 004 |
| 4.10 | Build Memory tab UI | `src/webview/components/ai-chat/MemoryPanel.tsx` + sub-components | 004 |
| 4.11 | Update [`AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) — add Memory tab | [`src/webview/AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) | 004 |
| 4.12 | Update graph to include memory extraction node | [`src/chat/graph.ts`](../src/chat/graph.ts) | 004 |
| 4.13 | Write tests for compression and memory | `src/test/chat/compression/*.test.ts`, `memory/*.test.ts` | 003, 004 |

**Deliverable**: Long conversations auto-compress. Memory persists across sessions. LLM has project knowledge.

---

### Phase 5: Queue & Polish (PRD 007)
**Goal**: Add message queuing, force-send, stop controls.

| Step | Action | Files | PRD |
|------|--------|-------|-----|
| 5.1 | Create queue types and message queue | `src/chat/queue/types.ts`, `messageQueue.ts` | 007 |
| 5.2 | Create graph executor with abort support | `src/chat/queue/graphExecutor.ts` | 007 |
| 5.3 | Build queue indicator and panel UI | `src/webview/components/ai-chat/MessageQueueIndicator.tsx`, `QueuePanel.tsx` | 007 |
| 5.4 | Update [`ChatInput.tsx`](../src/webview/components/ai-chat/ChatInput.tsx) — add force/stop buttons | [`src/webview/components/ai-chat/ChatInput.tsx`](../src/webview/components/ai-chat/ChatInput.tsx) | 007 |
| 5.5 | Update [`ChatController`](../src/webview/controllers/ChatController.ts) — queue-based execution | [`src/webview/controllers/ChatController.ts`](../src/webview/controllers/ChatController.ts) | 007 |
| 5.6 | Add abort signal support to graph and nodes | [`src/chat/graph.ts`](../src/chat/graph.ts), `src/chat/nodes/*.ts` | 007 |
| 5.7 | Write tests for queue system | `src/test/chat/queue/*.test.ts` | 007 |

**Deliverable**: Users can queue messages, force-send, and stop running operations.

---

## New Dependencies Summary

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `pg` | `^8.x` | PostgreSQL client | 1 |
| `@types/pg` | `^8.x` (dev) | TypeScript types | 1 |
| `@langchain/langgraph-checkpoint-postgres` | `^0.x` | LangGraph state persistence | 2 |
| `@anthropic-ai/sdk` | `^0.x` | Anthropic Batch API | 3 |

---

## New Files Summary (by directory)

```
src/chat/
├── checkpointer.ts                    # PRD 002
├── db/
│   ├── postgresClient.ts              # PRD 001
│   ├── migrations/
│   │   └── 001_initial_schema.sql     # PRD 001
│   ├── threadRepository.ts            # PRD 001
│   ├── messageRepository.ts           # PRD 001
│   ├── memoryRepository.ts            # PRD 001
│   ├── batchRepository.ts             # PRD 001
│   └── architectureRepository.ts      # PRD 001
├── nodes/
│   ├── gatherContext.ts               # PRD 002
│   ├── prepareGoal.ts                 # PRD 002
│   ├── humanReviewGoal.ts             # PRD 002
│   ├── packagePrompt.ts              # PRD 002
│   ├── humanApproveSend.ts            # PRD 002
│   ├── submitBatch.ts                 # PRD 002
│   ├── awaitBatchResponse.ts          # PRD 002
│   ├── processBatchResponse.ts        # PRD 002
│   ├── humanReviewEdits.ts            # PRD 002
│   ├── applyEdits.ts                  # PRD 002
│   ├── humanReviewCode.ts             # PRD 002
│   ├── generateSummary.ts             # PRD 002
│   └── extractMemory.ts              # PRD 004
├── prompts/
│   ├── goalPrompt.ts                  # PRD 002
│   └── outputInstructions.ts          # PRD 002
├── compression/
│   ├── types.ts                       # PRD 003
│   ├── tokenBudget.ts                # PRD 003
│   ├── historySummarizer.ts           # PRD 003
│   ├── fileCompressor.ts             # PRD 003
│   └── contextManager.ts             # PRD 003
├── memory/
│   ├── types.ts                       # PRD 004
│   ├── memoryManager.ts              # PRD 004
│   ├── memoryExtractor.ts            # PRD 004
│   └── memoryInjector.ts             # PRD 004
├── batch/
│   ├── types.ts                       # PRD 005
│   ├── anthropicBatchClient.ts        # PRD 005
│   ├── batchManager.ts               # PRD 005
│   ├── batchPoller.ts                # PRD 005
│   ├── packageAssembler.ts           # PRD 005
│   ├── responseParser.ts             # PRD 005
│   └── outputTemplates.ts            # PRD 005
├── apply/
│   ├── types.ts                       # PRD 009
│   ├── fileEditApplier.ts            # PRD 009
│   ├── fullFileWriter.ts             # PRD 009
│   ├── searchReplaceApplier.ts       # PRD 009
│   └── editModeSelector.ts           # PRD 009
├── queue/
│   ├── types.ts                       # PRD 007
│   ├── messageQueue.ts               # PRD 007
│   └── graphExecutor.ts              # PRD 007
└── architecture/
    ├── architectureGraph.ts           # PRD 008
    ├── architectureState.ts           # PRD 008
    ├── prompts.ts                     # PRD 008
    └── nodes/
        ├── checkFreshness.ts          # PRD 008
        ├── scanDirectory.ts           # PRD 008
        ├── analyzeKeyFiles.ts         # PRD 008
        ├── gatherDependencies.ts      # PRD 008
        ├── generateDocument.ts        # PRD 008
        └── storeDocument.ts           # PRD 008

src/webview/components/ai-chat/
├── ChatSettingsTab.tsx                # PRD 010
├── ChatHistoryTab.tsx                 # PRD 010
├── ThreadCard.tsx                     # PRD 010
├── ConnectionStatus.tsx               # PRD 010
├── SecretInput.tsx                    # PRD 010
├── PackagesTab.tsx                    # PRD 006
├── PackageCard.tsx                    # PRD 006
├── PackagePreview.tsx                 # PRD 006
├── PackageInlineCard.tsx              # PRD 006
├── BatchStatusBadge.tsx               # PRD 006
├── CostEstimator.tsx                  # PRD 006
├── MemoryPanel.tsx                    # PRD 004
├── MemoryEntryCard.tsx                # PRD 004
├── FileEditCard.tsx                   # PRD 009
├── EditReviewPanel.tsx                # PRD 009
├── MessageQueueIndicator.tsx          # PRD 007
└── QueuePanel.tsx                     # PRD 007
```

---

## Files to Edit Summary

| File | PRDs | Changes |
|------|------|---------|
| [`package.json`](../package.json) | 001, 002, 005, 010 | Dependencies + VS Code settings |
| [`src/extension.ts`](../src/extension.ts) | 001, 005, 008 | PG init, batch poller, architecture command |
| [`src/chat/graph.ts`](../src/chat/graph.ts) | 002, 004, 007 | Complete rewrite with HITL topology |
| [`src/chat/state.ts`](../src/chat/state.ts) | 002, 003, 004 | New state fields |
| [`src/chat/nodes.ts`](../src/chat/nodes.ts) | 002 | Split into individual files |
| [`src/webview/controllers/ChatController.ts`](../src/webview/controllers/ChatController.ts) | 001, 002, 004, 005, 006, 007, 010 | Major expansion |
| [`src/webview/AiChatRoot.tsx`](../src/webview/AiChatRoot.tsx) | 004, 006, 010 | Add Memory, Packages, Settings, History tabs |
| [`src/webview/messageSchemas.ts`](../src/webview/messageSchemas.ts) | 002, 004, 006, 007, 009, 010 | New message schemas |
| [`src/core/patching/codePatcher.ts`](../src/core/patching/codePatcher.ts) | 009 | Extract reusable functions |
| [`src/core/patching/contentAnalyst.ts`](../src/core/patching/contentAnalyst.ts) | 009 | Improve fuzzy matching |
| [`src/core/compression/compressFile.ts`](../src/core/compression/compressFile.ts) | 003 | Return token count |
| [`src/services/conversationService.ts`](../src/services/conversationService.ts) | 001 | Deprecate (keep as fallback) |

---

## Estimated Effort

| Phase | PRDs | Estimated Days | Complexity |
|-------|------|---------------|------------|
| Phase 1: Foundation | 001, 010 | 5-7 days | Medium |
| Phase 2: HITL Workflow | 002, 008 | 8-10 days | High |
| Phase 3: Batch Pipeline | 005, 006, 009 | 8-10 days | High |
| Phase 4: Intelligence | 003, 004 | 5-7 days | Medium |
| Phase 5: Queue & Polish | 007 | 3-4 days | Medium |
| **Total** | **10 PRDs** | **29-38 days** | |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| PostgreSQL dependency adds setup friction | Users may not have PG available | Clear setup docs, consider Supabase/Neon free tier recommendation |
| Anthropic Batch API changes or rate limits | Batch pipeline breaks | Abstract behind interface, version-pin SDK |
| LangGraph checkpoint-postgres compatibility | State persistence fails | Pin versions, test thoroughly, fallback to in-memory |
| Context compression loses critical info | LLM produces poor results | Keep originals in DB, allow user to expand summaries |
| SEARCH/REPLACE fuzzy matching fails | File edits don't apply | Hybrid mode defaults to full file for safety |
| 24-hour batch turnaround too slow | User frustration | Clear UX expectations, allow multiple concurrent batches |

---

## Success Metrics

- [ ] End-to-end workflow: user query → context gathering → goal review → batch send → response → file edits applied
- [ ] Batch API cost savings: ≥40% reduction vs real-time API for equivalent work
- [ ] Context compression: 60%+ token reduction while maintaining response quality
- [ ] Memory persistence: facts from session N available in session N+1
- [ ] Resume capability: extension restart doesn't lose workflow state
- [ ] Queue system: 0 lost messages during concurrent operations
