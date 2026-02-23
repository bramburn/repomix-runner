# PRD 002: LangGraph HITL Workflow

## Goal

Redesign the existing chat graph ([`src/chat/graph.ts`](src/chat/graph.ts)) to implement a Human-in-the-Loop (HITL) workflow using LangGraph's `interrupt()` / `Command` primitives. The graph must pause at defined checkpoints where the user can review, edit, approve, or reject before the workflow continues. This enables the core flow from the architecture diagram: gather context → prepare goal → user approves → send to batch → user reviews results → apply changes.

---

## Background

The current [`createChatGraph()`](src/chat/graph.ts:11) is a linear flow: `loadPlan → generateQueries → vectorSearch → evaluate → editPlan → generateResponse`. It has no pause points — once invoked, it runs to completion. The new workflow needs explicit human checkpoints where the graph yields control back to the UI and waits for user input before continuing.

LangGraph supports HITL via:
- **`interrupt()`** — pauses the graph and returns a value to the caller
- **`Command({ resume: ... })`** — resumes the graph with user-provided data
- **Checkpointer** — persists graph state so it survives extension restarts

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| `@langchain/langgraph-checkpoint-postgres` | PostgreSQL-backed checkpointer for LangGraph state persistence |

> Note: `@langchain/langgraph` is already installed at `^1.0.4`.

---

## New Graph Architecture

```
__start__
    │
    ▼
[gatherContext]  ← vector search + file loading + repo architecture
    │
    ▼
[prepareGoal]   ← Gemini 2.5 Flash: synthesize goal, filter context, identify deps
    │
    ▼
[humanReviewGoal] ← INTERRUPT: show goal + context card to user
    │                user can edit goal text, add/remove context files
    │                user clicks "Approve" or "Edit & Resubmit"
    ▼
[packagePrompt]  ← assemble final prompt (goal + context + output instruction)
    │
    ▼
[humanApproveSend] ← INTERRUPT: show package card, user approves sending to batch
    │                 (or queues it in the Packages tab for later bulk send)
    ▼
[submitBatch]    ← send to Anthropic Batch API, store batch_id
    │
    ▼
[awaitBatchResponse] ← INTERRUPT: poll loop with periodic check
    │                   graph pauses, external poller updates DB
    │                   when response arrives, graph is resumed
    ▼
[processBatchResponse] ← parse response, extract file edits/new files
    │
    ▼
[humanReviewEdits] ← INTERRUPT: show file changes card
    │                 user approves all, approves individually, or requests changes
    ▼
[applyEdits]     ← write files to workspace
    │
    ▼
[humanReviewCode] ← INTERRUPT: optional code review cycle
    │                user can request another batch review pass
    │                or mark as complete
    ▼
[generateSummary] ← summarize what was done
    │
    ▼
__end__
```

---

## State Additions

New fields to add to [`ChatState`](src/chat/state.ts:6):

```typescript
// HITL workflow phase tracking
workflowPhase: Annotation<
  'idle' | 'gathering' | 'goal_review' | 'packaging' | 
  'send_review' | 'batch_pending' | 'response_review' | 
  'applying' | 'code_review' | 'complete'
>({
  reducer: (_, y) => y,
  default: () => 'idle',
}),

// Assembled goal text (editable by user)
goalText: Annotation<string>({
  reducer: (_, y) => y,
  default: () => '',
}),

// Package payload ready for batch
packagePayload: Annotation<{
  goal: string;
  contextFiles: Array<{ path: string; content: string }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: 'plan' | 'code_change' | 'code_review';
} | null>({
  reducer: (_, y) => y,
  default: () => null,
}),

// Batch job reference
batchJobId: Annotation<string | null>({
  reducer: (_, y) => y,
  default: () => null,
}),

// Parsed file edits from batch response
fileEdits: Annotation<Array<{
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  content: string;
  searchReplace?: { search: string; replace: string }[];
  approved: boolean;
}>>({
  reducer: (_, y) => y,
  default: () => [],
}),

// Whether user wants another review cycle
requestReviewCycle: Annotation<boolean>({
  reducer: (_, y) => y,
  default: () => false,
}),
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/checkpointer.ts` | Factory for PostgreSQL-backed LangGraph checkpointer |
| `src/chat/nodes/gatherContext.ts` | Node: vector search + file loading + architecture retrieval |
| `src/chat/nodes/prepareGoal.ts` | Node: Gemini Flash synthesizes goal from user query + context |
| `src/chat/nodes/humanReviewGoal.ts` | Node: `interrupt()` — yields goal card to UI |
| `src/chat/nodes/packagePrompt.ts` | Node: assembles final prompt payload |
| `src/chat/nodes/humanApproveSend.ts` | Node: `interrupt()` — yields package for approval |
| `src/chat/nodes/submitBatch.ts` | Node: sends to Anthropic Batch API |
| `src/chat/nodes/awaitBatchResponse.ts` | Node: `interrupt()` — waits for batch completion |
| `src/chat/nodes/processBatchResponse.ts` | Node: parses Opus response into file edits |
| `src/chat/nodes/humanReviewEdits.ts` | Node: `interrupt()` — yields edit cards to UI |
| `src/chat/nodes/applyEdits.ts` | Node: writes approved edits to workspace |
| `src/chat/nodes/humanReviewCode.ts` | Node: `interrupt()` — optional review cycle |
| `src/chat/nodes/generateSummary.ts` | Node: final summary of changes |
| `src/chat/prompts/goalPrompt.ts` | Prompt template for goal synthesis |
| `src/chat/prompts/outputInstructions.ts` | Standard output instruction templates (plan/code/review) |

## Files to Edit

| File | Change |
|------|--------|
| [`src/chat/graph.ts`](src/chat/graph.ts:1) | Complete rewrite with new HITL graph topology |
| [`src/chat/state.ts`](src/chat/state.ts:1) | Add new state fields listed above |
| [`src/chat/nodes.ts`](src/chat/nodes.ts:1) | Refactor: split into individual node files under `src/chat/nodes/` |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts:206) | Handle `interrupt()` responses, `Command({ resume })` calls, phase tracking |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for HITL message types (goalReview, packageReview, editReview) |

---

## Atomic Actions

1. **Install `@langchain/langgraph-checkpoint-postgres`** — `npm install @langchain/langgraph-checkpoint-postgres`
2. **Create `src/chat/checkpointer.ts`** — factory that creates a `PostgresSaver` from the PG pool (from PRD 001), with `setup()` call on init
3. **Create `src/chat/prompts/goalPrompt.ts`** — template: takes user query, retrieved context snippets, repo architecture markdown, dependencies → produces structured goal
4. **Create `src/chat/prompts/outputInstructions.ts`** — three templates: `planInstruction`, `codeChangeInstruction`, `codeReviewInstruction` — each tells the LLM exactly how to format output
5. **Create `src/chat/nodes/gatherContext.ts`** — reuses existing vector search logic from [`vectorSearchNode`](src/chat/nodes.ts:187), adds repo architecture loading from DB
6. **Create `src/chat/nodes/prepareGoal.ts`** — calls Gemini 2.5 Flash with goal prompt, returns structured `goalText` + filtered `contextFiles`
7. **Create `src/chat/nodes/humanReviewGoal.ts`** — calls `interrupt({ type: 'goal_review', goal: state.goalText, contextFiles: state.retrievedContext })`, sets `workflowPhase: 'goal_review'`
8. **Create `src/chat/nodes/packagePrompt.ts`** — assembles `packagePayload` from approved goal + context + output instruction
9. **Create `src/chat/nodes/humanApproveSend.ts`** — calls `interrupt({ type: 'send_review', package: state.packagePayload })`, sets `workflowPhase: 'send_review'`
10. **Create `src/chat/nodes/submitBatch.ts`** — calls Anthropic Batch API, stores `batchJobId` in state and DB
11. **Create `src/chat/nodes/awaitBatchResponse.ts`** — calls `interrupt({ type: 'batch_pending', batchJobId: state.batchJobId })`, external poller resumes when done
12. **Create `src/chat/nodes/processBatchResponse.ts`** — loads batch response from DB, parses into `fileEdits` array
13. **Create `src/chat/nodes/humanReviewEdits.ts`** — calls `interrupt({ type: 'edit_review', edits: state.fileEdits })`
14. **Create `src/chat/nodes/applyEdits.ts`** — writes approved files to workspace using VS Code `WorkspaceEdit` API
15. **Create `src/chat/nodes/humanReviewCode.ts`** — calls `interrupt({ type: 'code_review' })`, user can trigger another batch cycle
16. **Create `src/chat/nodes/generateSummary.ts`** — Gemini Flash summarizes all changes made
17. **Rewrite [`src/chat/graph.ts`](src/chat/graph.ts:1)** — wire all nodes with edges and conditional edges, pass checkpointer to `workflow.compile({ checkpointer })`
18. **Update [`src/chat/state.ts`](src/chat/state.ts:1)** — add all new Annotation fields
19. **Update [`ChatController`](src/webview/controllers/ChatController.ts:206)** — handle `interrupt()` return values, dispatch UI cards, handle `resume` messages from webview with `Command({ resume: userInput })`
20. **Update [`messageSchemas.ts`](src/webview/messageSchemas.ts)** — add Zod schemas for `goalReview`, `packageReview`, `editReview`, `batchStatus` message types

---

## Acceptance Criteria

- [ ] Graph pauses at each HITL checkpoint and yields structured data to the UI
- [ ] User can edit the goal text before approving
- [ ] User can add/remove context files before approving
- [ ] Graph state persists across extension restarts via PostgreSQL checkpointer
- [ ] Resuming a thread picks up exactly where the workflow left off
- [ ] The workflow supports the full cycle: gather → goal → package → batch → review → apply
- [ ] Conditional edge allows looping back for additional review cycles
