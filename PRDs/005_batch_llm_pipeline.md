# PRD 005: Batch LLM Pipeline

## Goal

Implement the Anthropic Message Batches API integration that allows the extension to send packaged prompts to Claude Opus 4 (with extended thinking) as batch jobs, poll for completion, store responses, and notify the user. This is the core cost-saving mechanism: instead of real-time API calls at full price, we use the batch endpoint at ~50% discount with a 24-hour turnaround.

---

## Background

From the workflow diagram, the batch pipeline is used at three points:
1. **Plan generation**: User's goal + context → Opus generates a detailed implementation plan (10-20K token output)
2. **Code implementation**: Plan + context → Opus generates code changes / new files
3. **Code review**: Implementation + original plan → Opus reviews and suggests corrections

Each of these is a "package" — a self-contained prompt with goal, context files, and output instructions. Multiple packages can be queued and sent together in a single batch API call.

The Anthropic Message Batches API:
- `POST /v1/messages/batches` — submit up to 10,000 requests
- `GET /v1/messages/batches/{batch_id}` — check status
- `GET /v1/messages/batches/{batch_id}/results` — retrieve results (JSONL stream)
- Results available within 24 hours (often much faster)
- 50% cost reduction vs real-time API

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Official Anthropic TypeScript SDK (includes batch API support) |

---

## Package Structure

A "package" is the unit of work sent to the batch API:

```typescript
interface BatchPackage {
  id: string;                    // UUID
  threadId: string;              // originating chat thread
  type: 'plan' | 'code_change' | 'code_review';
  goal: string;                  // the user's approved goal text
  contextFiles: Array<{
    path: string;
    content: string;             // possibly compressed via PRD 003
    compressionLevel: number;
  }>;
  repoArchitecture: string;      // markdown tree from PRD 008
  dependencies: Record<string, string>;  // from package.json etc.
  outputInstruction: string;     // template from PRD 002
  existingPlan?: string;         // for code_change/code_review types
  previousResponse?: string;     // for review cycles
  createdAt: Date;
  status: 'draft' | 'approved' | 'submitted' | 'completed' | 'failed';
}
```

---

## Batch API Integration Flow

```
1. User approves package(s) in Packages tab
2. Extension groups approved packages into a batch request
3. Each package becomes a `requests[]` entry:
   {
     custom_id: package.id,
     params: {
       model: "claude-opus-4-20250514",
       max_tokens: 16384,
       thinking: { type: "enabled", budget_tokens: 10000 },
       messages: [{ role: "user", content: assembledPrompt }]
     }
   }
4. POST /v1/messages/batches → receive batch_id
5. Store batch_id + package IDs in batch_jobs table
6. Start polling timer (every 60 seconds)
7. When status === 'ended':
   a. Stream results from /v1/messages/batches/{batch_id}/results
   b. Match each result.custom_id to package.id
   c. Parse response content
   d. Store in batch_jobs table + .repomix/incoming/{batchId}/
   e. Notify user via VS Code notification + update UI
8. User reviews results in chat thread
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/batch/anthropicBatchClient.ts` | Wrapper around Anthropic SDK for batch operations |
| `src/chat/batch/batchManager.ts` | Orchestrates package lifecycle: create → approve → submit → poll → complete |
| `src/chat/batch/batchPoller.ts` | Background polling service with configurable interval |
| `src/chat/batch/packageAssembler.ts` | Assembles a `BatchPackage` into the final prompt string |
| `src/chat/batch/responseParser.ts` | Parses Opus response into structured file edits |
| `src/chat/batch/types.ts` | TypeScript interfaces for batch pipeline |
| `src/chat/batch/outputTemplates.ts` | Standard output instruction templates for plan/code/review |

## Files to Edit

| File | Change |
|------|--------|
| [`package.json`](package.json:671) | Add `@anthropic-ai/sdk` to dependencies |
| [`src/chat/db/batchRepository.ts`](src/chat/db/batchRepository.ts) | Already created in PRD 001 — verify API matches |
| [`src/chat/nodes/submitBatch.ts`](src/chat/nodes/submitBatch.ts) | Wire to `batchManager.submit()` |
| [`src/chat/nodes/awaitBatchResponse.ts`](src/chat/nodes/awaitBatchResponse.ts) | Wire to `batchPoller` status checks |
| [`src/chat/nodes/processBatchResponse.ts`](src/chat/nodes/processBatchResponse.ts) | Wire to `responseParser` |
| [`src/extension.ts`](src/extension.ts) | Initialize `batchPoller` on activation, register disposal |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts) | Handle batch-related messages |

---

## Output Instruction Templates

### Plan Generation
```
You are an expert software architect. Generate a detailed implementation plan.

OUTPUT FORMAT:
Respond with a markdown document containing:
1. ## Overview — 2-3 sentence summary
2. ## Files to Modify — table with columns: File Path | Action (create/edit/delete) | Description
3. ## Implementation Steps — numbered list with detailed instructions per file
4. ## Dependencies — any new packages needed
5. ## Testing Strategy — how to verify the changes
6. ## Risks — potential issues and mitigations

Be specific about file paths, function names, and code patterns.
```

### Code Change
```
You are an expert software engineer. Implement the following plan.

OUTPUT FORMAT:
For each file, output a block in this exact format:

<file_change>
<path>relative/path/to/file.ts</path>
<action>create|edit</action>
<description>Brief description of changes</description>
<content>
FULL FILE CONTENT HERE (for create or small files)
OR
SEARCH/REPLACE blocks for large existing files:
<<<<<<< SEARCH
exact content to find
=======
replacement content
>>>>>>> REPLACE
</content>
</file_change>

Rules:
- For new files: always provide full content
- For existing files < 300 lines: provide full content
- For existing files >= 300 lines: use SEARCH/REPLACE blocks
- Include ALL necessary imports
- Maintain existing code style
```

### Code Review
```
You are an expert code reviewer. Review the implementation against the original plan.

OUTPUT FORMAT:
1. ## Compliance Check — does the implementation match the plan?
2. ## Issues Found — list of problems with severity (critical/warning/info)
3. ## Suggested Fixes — for each issue, provide the fix as a <file_change> block (same format as code changes)
4. ## Overall Assessment — pass/fail with summary
```

---

## Polling Strategy

```typescript
class BatchPoller {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  startPolling(batchId: string, onComplete: (results) => void) {
    // Initial check after 30 seconds
    // Then every 60 seconds for first hour
    // Then every 5 minutes for next 23 hours
    // Give up after 25 hours
  }
  
  // On extension startup, resume polling for any 'submitted'/'processing' batches
  async resumeAllPending() {
    const pending = await batchRepository.getPendingBatches();
    for (const batch of pending) {
      this.startPolling(batch.batch_api_id, ...);
    }
  }
}
```

---

## Response Storage

When a batch completes:
1. Store full response JSON in `batch_jobs.response_payload`
2. Write individual file outputs to `.repomix/incoming/{batchId}/{filename}` for easy browsing
3. Parse into `fileEdits` array for the HITL review step

---

## Atomic Actions

1. **Install `@anthropic-ai/sdk`** — `npm install @anthropic-ai/sdk`
2. **Add VS Code settings**:
   - `repomix.chat.anthropicApiKey` — stored in `secrets` (not plaintext)
   - `repomix.chat.batchModel` — default `claude-opus-4-20250514`
   - `repomix.chat.batchMaxTokens` — default 16384
   - `repomix.chat.batchThinkingBudget` — default 10000
   - `repomix.chat.batchPollIntervalSeconds` — default 60
3. **Create `src/chat/batch/types.ts`** — define `BatchPackage`, `BatchSubmission`, `BatchResult`, `BatchStatus` interfaces
4. **Create `src/chat/batch/outputTemplates.ts`** — export `planTemplate`, `codeChangeTemplate`, `codeReviewTemplate` strings
5. **Create `src/chat/batch/packageAssembler.ts`** — `assemblePrompt(pkg: BatchPackage): string` — combines goal + context + architecture + deps + output instruction into a single prompt
6. **Create `src/chat/batch/anthropicBatchClient.ts`** — wraps `@anthropic-ai/sdk`:
   - `submitBatch(packages: BatchPackage[]): Promise<{ batchId: string }>`
   - `checkBatchStatus(batchId: string): Promise<BatchStatus>`
   - `getBatchResults(batchId: string): Promise<BatchResult[]>`
   - `cancelBatch(batchId: string): Promise<void>`
7. **Create `src/chat/batch/responseParser.ts`** — `parseResponse(content: string): FileEdit[]` — extracts `<file_change>` blocks into structured edits
8. **Create `src/chat/batch/batchPoller.ts`** — background service with adaptive polling intervals, persistence across restarts
9. **Create `src/chat/batch/batchManager.ts`** — orchestrates the full lifecycle:
   - `createPackage(threadId, type, goal, context, ...): BatchPackage`
   - `approvePackage(packageId): void`
   - `submitApproved(packageIds: string[]): Promise<string>` (returns batchId)
   - `handleCompletion(batchId, results): void`
10. **Update [`src/extension.ts`](src/extension.ts)** — on activation: read Anthropic API key from secrets, create `batchPoller`, call `resumeAllPending()`, register `batchPoller.dispose()` on deactivation
11. **Update [`src/chat/nodes/submitBatch.ts`](src/chat/nodes/submitBatch.ts)** — call `batchManager.submitApproved()`
12. **Update [`src/chat/nodes/processBatchResponse.ts`](src/chat/nodes/processBatchResponse.ts)** — call `responseParser.parseResponse()`
13. **Create `.repomix/incoming/` directory structure** — ensure it exists, add to `.gitignore` template
14. **Write tests** — `src/test/chat/batch/packageAssembler.test.ts`, `responseParser.test.ts`

---

## Acceptance Criteria

- [ ] User can configure Anthropic API key in VS Code secrets
- [ ] Packages are correctly assembled with goal + context + output instruction
- [ ] Multiple packages can be submitted in a single batch API call
- [ ] Polling resumes after extension restart for pending batches
- [ ] Completed batch results are stored in DB and `.repomix/incoming/`
- [ ] User receives VS Code notification when batch completes
- [ ] Response is correctly parsed into file edit structures
- [ ] Batch can be cancelled by the user
- [ ] Error handling for API failures, timeouts, and malformed responses

---

## Draft Implementation Action Plan (Codebase-Aligned)

Date: 2026-02-23

### Current State Snapshot

- `submitBatch`, `awaitBatchResponse`, and `processBatchResponse` are present but stubbed (`src/chat/nodes/*.ts`).
- `batch_jobs` table and repository exist (`src/chat/db/batchRepository.ts`, `src/chat/db/postgresClient.ts`).
- No `src/chat/batch/` services exist yet.
- `@anthropic-ai/sdk` is not installed.
- Chat UI has interrupt schemas and controller wiring, but no real batch lifecycle UI yet.

### Scope for PRD 005 Implementation Pass

1. Build production-ready batch backend (`src/chat/batch/*`) and integrate it into existing graph nodes.
2. Add Anthropic credential/config plumbing (secrets + workspace settings).
3. Implement resilient poller that resumes pending work after restart and updates chat workflow state.
4. Persist raw responses and parsed artifacts for PRD 009 consumers.
5. Add tests for assembler, parser, manager, and poller behavior.

### Assumptions

- We keep using existing HITL interrupts in `ChatController` (no full Packages tab work in this PRD; PRD 006 handles major UX).
- First implementation uses one batch request per approved package group, mapped by `custom_id = batch_jobs.id`.
- Parsed output shape must support both current JSON response handling and the planned `<file_change>` format.

### Dependency-Ordered Tasks

#### Phase 0: Contracts and Configuration

1. Add `@anthropic-ai/sdk` dependency in `package.json`.
2. Add batch settings in `package.json` contributes section:
   - `repomix.chat.batchModel`
   - `repomix.chat.batchMaxTokens`
   - `repomix.chat.batchThinkingBudget`
   - `repomix.chat.batchPollIntervalSeconds`
3. Extend secret handling for Anthropic key:
   - add secret constant in `src/webview/controllers/ConfigController.ts`
   - extend message schema enums in `src/webview/messageSchemas.ts` if using shared secret save/check command path.

#### Phase 1: Batch Domain Layer (`src/chat/batch/`)

1. Create `src/chat/batch/types.ts` with:
   - package/request/result/status DTOs
   - parser result shape for PRD 009 (`FileEdit`-compatible).
2. Create `src/chat/batch/outputTemplates.ts` and keep templates centralized (plan/code/review).
3. Create `src/chat/batch/packageAssembler.ts`:
   - deterministic prompt assembly
   - optional token estimate helper for UI/status.

#### Phase 2: Anthropic Adapter and Parsing

1. Create `src/chat/batch/anthropicBatchClient.ts`:
   - `submitBatch`
   - `getBatch`
   - `getBatchResults`
   - `cancelBatch`
   - normalize API errors into typed internal errors.
2. Create `src/chat/batch/responseParser.ts`:
   - parse `<file_change>` blocks
   - keep JSON fallback parser (backward compatibility with current node expectations)
   - return structured parse diagnostics for malformed outputs.

#### Phase 3: Orchestration and Polling

1. Create `src/chat/batch/batchManager.ts`:
   - create/update `batch_jobs`
   - map local IDs to Anthropic `custom_id`
   - store raw result payload and parsed artifact metadata.
2. Create `src/chat/batch/batchPoller.ts`:
   - polling loop with backoff
   - `resumeAllPending()` on startup
   - completion callback that hands parsed result to workflow resume path.
3. Add incoming artifact persistence (`.repomix/incoming/{batchId}/`) in manager completion path.

#### Phase 4: Graph and Extension Integration

1. Update `src/chat/nodes/submitBatch.ts` to call `batchManager.submitApproved(...)` instead of stub DB write.
2. Update `src/chat/nodes/awaitBatchResponse.ts` to reflect real ETA/status info from poller state.
3. Update `src/chat/nodes/processBatchResponse.ts` to use `responseParser`.
4. Update `src/chat/graph.ts` injection path so nodes receive manager/poller dependencies cleanly.
5. Update `src/webview/controllers/ChatController.ts`:
   - handle async batch completion signal and resume graph with `BatchPendingResume`.
6. Update `src/webview/AiChatWebviewProvider.ts` and `src/extension.ts`:
   - initialize poller once
   - wire lifecycle/disposal
   - resume pending batches on activation.

#### Phase 5: Tests and Hardening

1. Add tests:
   - `src/test/chat/batch/packageAssembler.test.ts`
   - `src/test/chat/batch/responseParser.test.ts`
   - `src/test/chat/batch/batchManager.test.ts`
   - `src/test/chat/batch/batchPoller.test.ts`
2. Add integration-level test for node flow:
   - `submitBatch -> awaitBatchResponse -> processBatchResponse`.
3. Validate with:
   - `npm run check-types`
   - `npm run lint`
   - `npm run test`.

### File-Level Change Map

| File | Change | Reason |
|------|--------|--------|
| `package.json` | update | add Anthropic SDK + batch settings |
| `src/chat/batch/types.ts` | create | shared contracts for pipeline |
| `src/chat/batch/outputTemplates.ts` | create | canonical output instructions |
| `src/chat/batch/packageAssembler.ts` | create | deterministic prompt builder |
| `src/chat/batch/anthropicBatchClient.ts` | create | API wrapper and transport logic |
| `src/chat/batch/responseParser.ts` | create | parse model output into edits |
| `src/chat/batch/batchManager.ts` | create | job lifecycle orchestrator |
| `src/chat/batch/batchPoller.ts` | create | background polling + restart recovery |
| `src/chat/nodes/submitBatch.ts` | update | replace stub path |
| `src/chat/nodes/awaitBatchResponse.ts` | update | real pending/completion semantics |
| `src/chat/nodes/processBatchResponse.ts` | update | parser integration |
| `src/chat/graph.ts` | update | dependency injection for manager/poller |
| `src/webview/controllers/ChatController.ts` | update | resume graph on completion signal |
| `src/webview/controllers/ConfigController.ts` | update | Anthropic secret handling |
| `src/webview/messageSchemas.ts` | update | optional secret enum/config message support |
| `src/extension.ts` | update | initialize poller and resume pending jobs |
| `src/webview/AiChatWebviewProvider.ts` | update | provider-level wiring for batch callbacks |

### Risks and Mitigations

- Risk: Poller and graph resume can desync if webview is closed.
  Mitigation: persist completion payload in DB and allow idempotent resume by thread/job.
- Risk: Model output format drift breaks parser.
  Mitigation: dual parser strategy + diagnostics + fallback to raw artifact review.
- Risk: long-running polls on many jobs can leak timers.
  Mitigation: centralized poller registry + disposal hooks + max polling lifetime guard.

### Open Questions

1. Should Anthropic API key be handled only in secrets (recommended), or also through plaintext setting fallback?
2. For PRD 005 completion, do we require automatic graph resume while chat view is closed, or is resume-on-open acceptable for v1?
3. Should `processBatchResponse` treat non-parseable output as hard failure, or surface raw response to manual review step?

### Review Checkpoint

If this plan is approved, implementation can start immediately in the same phase order above.
