# PRD 007: Message Queue System

## Goal

Implement an in-extension message queue that allows users to queue multiple chat messages, send them in order, force-send a message to jump the queue, and stop/cancel the current workflow at any point. This provides control over the chat flow when the user wants to plan ahead or interrupt a running operation.

---

## Background

Currently, [`ChatController.runChatGraph()`](src/webview/controllers/ChatController.ts:206) processes one message at a time synchronously — the user sends a message, waits for the graph to complete, then sends the next. There's no way to:
- Queue up multiple messages while the graph is running
- Force-send an urgent message that bypasses the queue
- Cancel/stop a running graph execution
- See what messages are pending

The message queue adds a layer between the UI and the graph executor that manages ordering, priority, and cancellation.

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses existing `p-queue` for queue management, `AbortController` for cancellation |

---

## Queue Architecture

```
User sends message
       │
       ▼
  ┌─────────┐
  │  Queue   │ ← messages stored in order
  │  Manager │ ← force-send inserts at position 0
  └────┬─────┘
       │
       ▼ (dequeue next)
  ┌──────────┐
  │  Graph   │ ← runs one message at a time
  │ Executor │ ← supports AbortController for cancellation
  └────┬─────┘
       │
       ▼
  Response sent to UI
  Queue processes next message
```

### Queue Entry

```typescript
interface QueueEntry {
  id: string;
  threadId: string;
  text: string;
  priority: 'normal' | 'force';
  status: 'queued' | 'processing' | 'completed' | 'cancelled' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}
```

### Force Send

When the user "force sends" a message:
1. The message is inserted at position 0 in the queue
2. If a graph is currently running, it is **not** interrupted (the force message runs next)
3. If the user also clicks "Stop", the current execution is aborted and the force message runs immediately

### Stop/Cancel

The stop mechanism uses `AbortController`:
1. Each graph execution receives an `AbortSignal`
2. Long-running nodes (LLM calls, vector searches) check `signal.aborted` before proceeding
3. When the user clicks "Stop":
   - The current `AbortController` is aborted
   - The current queue entry is marked as `cancelled`
   - The queue continues with the next entry (or the force-sent message)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/queue/messageQueue.ts` | Core queue manager: enqueue, dequeue, force, cancel |
| `src/chat/queue/graphExecutor.ts` | Wraps graph invocation with AbortController support |
| `src/chat/queue/types.ts` | Queue entry types |
| `src/webview/components/ai-chat/MessageQueueIndicator.tsx` | UI: shows queue count badge and pending messages |
| `src/webview/components/ai-chat/QueuePanel.tsx` | UI: expandable panel showing queued messages with reorder/cancel |

## Files to Edit

| File | Change |
|------|--------|
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts:41) | Replace direct `runChatGraph()` with queue-based execution |
| [`src/chat/graph.ts`](src/chat/graph.ts) | Accept `AbortSignal` parameter, pass to nodes |
| [`src/chat/nodes/gatherContext.ts`](src/chat/nodes/gatherContext.ts) | Check `signal.aborted` before expensive operations |
| [`src/chat/nodes/prepareGoal.ts`](src/chat/nodes/prepareGoal.ts) | Check `signal.aborted` before LLM calls |
| [`src/webview/components/ai-chat/ChatInput.tsx`](src/webview/components/ai-chat/ChatInput.tsx) | Add "Force Send" button, "Stop" button, queue count badge |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for queue messages |

---

## Atomic Actions

1. **Create `src/chat/queue/types.ts`** — define `QueueEntry`, `QueueStatus`, `QueueConfig` interfaces
2. **Create `src/chat/queue/messageQueue.ts`** — class `MessageQueue`:
   - `enqueue(threadId: string, text: string, priority?: 'normal' | 'force'): QueueEntry` — adds to queue; force inserts at front
   - `dequeue(): QueueEntry | null` — removes and returns next entry
   - `peek(): QueueEntry[]` — returns all queued entries without removing
   - `cancel(entryId: string): void` — removes a specific entry from queue
   - `cancelAll(): void` — clears the queue
   - `getStatus(): { queueLength: number; currentlyProcessing: QueueEntry | null }`
   - Event emitter for `queueChanged`, `processingStarted`, `processingCompleted`
3. **Create `src/chat/queue/graphExecutor.ts`** — class `GraphExecutor`:
   - `execute(entry: QueueEntry, signal: AbortSignal): Promise<GraphResult>` — runs the chat graph with abort support
   - `stop(): void` — aborts the current execution via `AbortController.abort()`
   - Wraps the graph invocation, catches `AbortError`, marks entry as cancelled
4. **Create `src/webview/components/ai-chat/MessageQueueIndicator.tsx`** — small badge next to the send button showing queue count (e.g., "3 queued")
5. **Create `src/webview/components/ai-chat/QueuePanel.tsx`** — expandable panel above the chat input:
   - Lists queued messages with their position
   - Each entry has a "Cancel" button
   - "Clear Queue" button
   - Drag-to-reorder (stretch goal)
6. **Update [`ChatController`](src/webview/controllers/ChatController.ts:41)** — replace `handleMessage` for `chatSubmit`:
   - Instead of calling `runChatGraph()` directly, call `messageQueue.enqueue()`
   - Add a processing loop that dequeues and executes via `graphExecutor`
   - Handle new commands: `chatForceSubmit`, `chatStop`, `chatCancelQueued`, `chatClearQueue`, `getQueueStatus`
7. **Update [`src/chat/graph.ts`](src/chat/graph.ts)** — `createChatGraph()` accepts optional `AbortSignal`, passes to each node wrapper
8. **Update chat nodes** — each node that makes an LLM call or expensive operation checks `signal?.aborted` at the start and throws `AbortError` if true
9. **Update [`ChatInput.tsx`](src/webview/components/ai-chat/ChatInput.tsx)** — add:
   - "Force Send" button (⚡ icon) — sends with `priority: 'force'`
   - "Stop" button (⏹ icon) — visible only when graph is running
   - Queue count badge — visible when queue has entries
   - Toggle for queue panel
10. **Update [`messageSchemas.ts`](src/webview/messageSchemas.ts)** — add schemas for `chatForceSubmit`, `chatStop`, `chatCancelQueued`, `chatClearQueue`, `queueStatus`, `queueChanged`
11. **Persist queue across restarts** — on deactivation, save pending queue entries to PostgreSQL; on activation, restore them
12. **Write tests** — `src/test/chat/queue/messageQueue.test.ts`, `graphExecutor.test.ts`

---

## Acceptance Criteria

- [ ] User can send multiple messages while the graph is processing — they queue up
- [ ] Queue count is visible in the UI
- [ ] User can view and cancel individual queued messages
- [ ] "Force Send" inserts a message at the front of the queue
- [ ] "Stop" cancels the currently running graph execution
- [ ] After stopping, the queue continues with the next message
- [ ] Queue persists across extension restarts
- [ ] Cancelled graph executions clean up properly (no dangling promises)
- [ ] UI updates in real-time as queue status changes
