# PRD 006: Package Manager UI

## Goal

Build a "Packages" tab in the AI Chat webview that displays all batch packages across threads, allows the user to review package contents, approve/reject individual packages, and send approved packages to the Anthropic Batch API individually or in bulk. This is the central control panel for managing the batch workflow.

---

## Background

From the user's clarification: "when we are in a chat thread we have reached the part where we've gathered all the context, it will show a card that says we've completed the package, and there should be a package tab where we can see multiple thread's packages."

The Packages tab serves as a queue/dashboard for all pending batch work:
- **Draft packages**: assembled but not yet approved
- **Approved packages**: ready to send
- **Submitted packages**: sent to batch API, awaiting response
- **Completed packages**: response received, ready for review
- **Failed packages**: batch API returned an error

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses existing Fluent UI components |

---

## UI Design

### Packages Tab Layout

```
┌─────────────────────────────────────────────┐
│  📦 Packages                    [Send All ▶] │
│                                              │
│  Filter: [All ▼] [Plan|Code|Review]          │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 🟡 Draft — "Implement auth module"   │    │
│  │ Thread: Auth Refactor | Type: Plan   │    │
│  │ Files: 12 | Est. tokens: 45K        │    │
│  │ [Preview] [Approve ✓] [Delete ✕]    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 🟢 Approved — "Add API endpoints"    │    │
│  │ Thread: API Work | Type: Code Change │    │
│  │ Files: 8 | Est. tokens: 32K         │    │
│  │ [Preview] [Send ▶] [Unapprove ↩]    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 🔵 Submitted — "Database migration"  │    │
│  │ Batch: batch_abc123 | Submitted 2h   │    │
│  │ [View Status] [Cancel ✕]            │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ ✅ Completed — "Fix auth bugs"       │    │
│  │ Completed 30m ago | 8 file changes   │    │
│  │ [View Response] [Apply to Thread]    │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Package Preview Modal

When user clicks "Preview", show:
- Full goal text (editable in draft state)
- List of context files with token counts
- Output instruction type
- Estimated total tokens
- Estimated cost (based on Opus pricing)
- Raw prompt preview (collapsible)

### In-Chat Package Card

When the HITL workflow reaches the packaging step, show an inline card in the chat:

```
┌──────────────────────────────────────┐
│ 📦 Package Ready                     │
│                                      │
│ Goal: Implement user authentication  │
│ Type: Code Change                    │
│ Context: 12 files (45K tokens)       │
│                                      │
│ [View in Packages Tab] [Quick Send ▶]│
└──────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/webview/components/ai-chat/PackagesTab.tsx` | Main packages list view with filtering and bulk actions |
| `src/webview/components/ai-chat/PackageCard.tsx` | Individual package card with status-dependent actions |
| `src/webview/components/ai-chat/PackagePreview.tsx` | Detailed package preview/edit modal |
| `src/webview/components/ai-chat/PackageInlineCard.tsx` | In-chat card shown when package is ready |
| `src/webview/components/ai-chat/BatchStatusBadge.tsx` | Status badge component (draft/approved/submitted/completed/failed) |
| `src/webview/components/ai-chat/CostEstimator.tsx` | Displays estimated token count and cost |

## Files to Edit

| File | Change |
|------|--------|
| [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:35) | Add "Packages" tab to TabList |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts) | Handle package CRUD messages: `listPackages`, `approvePackage`, `sendPackage`, `sendAllApproved`, `cancelBatch`, `viewBatchStatus` |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for package-related messages |
| [`src/chat/batch/batchManager.ts`](src/chat/batch/batchManager.ts) | Add `listPackages()`, `getPackagePreview()` methods |

---

## Atomic Actions

1. **Create `src/webview/components/ai-chat/BatchStatusBadge.tsx`** — renders colored badge based on status: draft (yellow), approved (green), submitted (blue), completed (checkmark), failed (red)
2. **Create `src/webview/components/ai-chat/CostEstimator.tsx`** — takes token count, displays estimated cost based on Opus batch pricing ($7.50/MTok input, $37.50/MTok output for batch)
3. **Create `src/webview/components/ai-chat/PackageCard.tsx`** — displays package summary with status-dependent action buttons:
   - Draft: Preview, Approve, Delete
   - Approved: Preview, Send, Unapprove
   - Submitted: View Status, Cancel
   - Completed: View Response, Apply to Thread
   - Failed: View Error, Retry
4. **Create `src/webview/components/ai-chat/PackagePreview.tsx`** — modal/panel showing full package details:
   - Editable goal text (only in draft state)
   - File list with individual token counts and compression levels
   - Output instruction selector (plan/code_change/code_review)
   - Total token estimate and cost estimate
   - Collapsible raw prompt preview
5. **Create `src/webview/components/ai-chat/PackageInlineCard.tsx`** — compact card for embedding in chat messages when a package is ready
6. **Create `src/webview/components/ai-chat/PackagesTab.tsx`** — main view:
   - Filter dropdown: All / Draft / Approved / Submitted / Completed / Failed
   - Type filter: Plan / Code Change / Code Review
   - "Send All Approved" bulk action button
   - Sorted by status priority (draft first, then approved, etc.)
   - Empty state with explanation
7. **Update [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:35)** — add `<Tab value="Packages">Packages</Tab>` and render `<PackagesTab />` when active
8. **Update [`ChatController`](src/webview/controllers/ChatController.ts)** — handle messages:
   - `listPackages` → query `batchRepository`, return list
   - `approvePackage` → update status to 'approved'
   - `unapprovePackage` → revert to 'draft'
   - `sendPackage` → call `batchManager.submitApproved([id])`
   - `sendAllApproved` → call `batchManager.submitApproved(allApprovedIds)`
   - `cancelBatch` → call `anthropicBatchClient.cancelBatch()`
   - `deletePackage` → delete from DB (only draft/failed)
   - `getPackagePreview` → return full package details
9. **Update [`messageSchemas.ts`](src/webview/messageSchemas.ts)** — add Zod schemas for all package messages
10. **Update [`batchManager`](src/chat/batch/batchManager.ts)** — add `listPackages(filter?)` and `getPackagePreview(id)` methods
11. **Wire package creation into HITL flow** — when `humanApproveSend` interrupt fires, the UI shows the `PackageInlineCard` in chat and the package appears in the Packages tab
12. **Write tests** — `src/test/webview/PackagesTab.test.ts` (component rendering tests)

---

## Acceptance Criteria

- [ ] Packages tab shows all packages across all threads
- [ ] Packages can be filtered by status and type
- [ ] Draft packages can be previewed and edited (goal text, output type)
- [ ] Individual packages can be approved and sent
- [ ] Bulk "Send All Approved" sends multiple packages in one batch API call
- [ ] Submitted packages show polling status
- [ ] Completed packages link back to their originating thread
- [ ] Failed packages show error details and can be retried
- [ ] Cost estimates are displayed based on token counts
- [ ] In-chat card appears when a package is ready during the HITL workflow
