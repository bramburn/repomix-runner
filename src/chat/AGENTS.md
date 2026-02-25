# Chat Graph Guide

This folder contains the HITL chat workflow used by the AI Chat webview.

## Structure

- `src/chat/graph.ts`
  - Main `createHitlChatGraph(...)` workflow.
  - Includes interrupt-driven review/approval steps and optional review loop.
- `src/chat/state.ts`
  - `ChatState` shared schema for graph execution, UI phase sync, compression metadata, batch/edit data, and memory extraction.
- `src/chat/nodes/`
  - HITL node implementations (gather/compress/prepare/review/package/submit/poll/process/apply/summary/memory).
- `src/chat/nodes.ts`
  - Legacy node file kept for older flows; prefer adding new behavior under `src/chat/nodes/`.
- `src/chat/compression/`
  - Context compression system (token budget, history summarization, file compression, targeted extraction).
- `src/chat/batch/`
  - Anthropic batch integration, package assembly, polling, and response parsing.
- `src/chat/queue/`
  - Queue + graph executor for serialized processing/cancellation.
- `src/chat/db/`
  - PostgreSQL repositories, migrations, and connection/bootstrap utilities.
- `src/chat/architecture/`
  - Repository architecture generation workflow and storage integration.

## Current HITL Flow

1. `gatherContext`
2. `compressContext`
3. `prepareGoal`
4. `humanReviewGoal` (interrupt)
5. `packagePrompt`
6. `humanApproveSend` (interrupt)
7. `submitBatch`
8. `awaitBatchResponse` (interrupt)
9. `processBatchResponse`
10. `humanReviewEdits` (interrupt)
11. `applyEdits`
12. `humanReviewCode` (interrupt + optional loop back to `packagePrompt`)
13. `generateSummary`
14. `extractMemory`

## Webview Communication

Primary controller: `src/webview/controllers/ChatController.ts`.

Key inbound commands include:
- `chatSubmit`, `chatForceSubmit`, `chatStop`
- `chatCancelQueued`, `chatClearQueue`, `getQueueStatus`
- thread/memory/settings/batch management commands defined in `src/webview/messageSchemas.ts`

If you add state or node outputs needed in UI:
- update `ChatController` payload mapping,
- update `src/webview/messageSchemas.ts`,
- update relevant UI components in `src/webview/components/ai-chat/`.

## State Change Rules

- Add new cross-node fields in `state.ts` with explicit reducers/defaults.
- Use replace reducers for mutable collections that user review steps can modify.
- Keep workflow phase transitions (`workflowPhase`) accurate for UI synchronization.

## Compression Integration

- Compression is threshold-based and model-budget aware (`src/chat/compression/tokenBudget.ts`).
- File compression levels are progressive (full -> AST skeleton -> targeted extraction -> LLM summary/truncation fallback).
- Keep compression metadata fields in sync with prompt packaging and telemetry fields.

## Batch, Queue, and Persistence

- Batch operations are owned by `BatchManager` and `BatchPoller`.
- Queue execution and cancellation semantics are handled in `src/chat/queue/`.
- Threads/messages/memory/packages/architecture persist in PostgreSQL via `src/chat/db/`.
- Changes to SQL schema require corresponding migration and repository updates.

## Testing Checklist

Before merging chat changes, run:
- `npm run check-types`
- `npm run lint`
- `npm run test`

Recommended targeted tests:
- `src/test/chat/compression/*.test.ts`
- `src/test/chat/batch/*.test.ts`
- `src/test/chat/architecture/*.test.ts`
- `src/test/webview/messageSchemas.test.ts`
