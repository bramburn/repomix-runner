# PRD 009: File Edit Applier

## Goal

Build the system that takes parsed file edits from batch LLM responses and applies them to the workspace — creating new files, replacing existing file contents, or performing SEARCH/REPLACE patches. The applier supports a hybrid mode (configurable in settings) and integrates with VS Code's native diff/SCM so the user can review changes in the Source Control tab.

---

## Background

When a batch response from Claude Opus arrives (PRD 005), the [`responseParser`](src/chat/batch/responseParser.ts) extracts structured file edits. These need to be applied to the actual workspace files. The user confirmed:

- **Full file content** for new files and small existing files
- **SEARCH/REPLACE** for large existing files (>300 lines)
- **Hybrid mode** (auto-select based on file size) as default, with a dropdown to force one mode
- Files are **auto-created in the workspace** — the user reviews via VS Code's Source Control (git diff) tab
- The existing [`src/core/patching/`](src/core/patching/codePatcher.ts) system handles SEARCH/REPLACE but needs enhancement

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses existing VS Code `WorkspaceEdit` API, `fastest-levenshtein` for fuzzy matching |

---

## Edit Modes

### Mode 1: Full File Write
- For new files: write the entire content
- For existing files: overwrite the entire file
- Pros: reliable, no matching issues
- Cons: more tokens consumed in the batch response

### Mode 2: SEARCH/REPLACE Patch
- Uses the existing [`patchParser`](src/core/patching/patchParser.ts) and [`codePatcher`](src/core/patching/codePatcher.ts)
- Finds the SEARCH block in the file, replaces with REPLACE block
- Falls back to fuzzy matching via [`contentAnalyst`](src/core/patching/contentAnalyst.ts) if exact match fails
- Pros: fewer tokens, preserves surrounding code
- Cons: can fail if the file has changed since context was gathered

### Mode 3: Hybrid (Default)
- New files → full write
- Existing files < 300 lines → full write
- Existing files ≥ 300 lines → SEARCH/REPLACE
- Configurable threshold in settings

---

## File Edit Structure

```typescript
interface FileEdit {
  id: string;
  batchJobId: string;
  filePath: string;           // relative to workspace root
  action: 'create' | 'edit' | 'delete';
  mode: 'full' | 'search_replace';
  content: string;            // full content or SEARCH/REPLACE blocks
  searchReplaceBlocks?: Array<{
    search: string;
    replace: string;
  }>;
  status: 'pending' | 'applied' | 'failed' | 'skipped';
  error?: string;
  appliedAt?: Date;
}
```

---

## Application Flow

```
1. Batch response parsed into FileEdit[]
2. For each edit:
   a. Resolve file path (exact → fuzzy → AI-assisted via fileResolver)
   b. Determine mode (based on setting + file size)
   c. If mode === 'full':
      - For 'create': write new file
      - For 'edit': overwrite existing file
   d. If mode === 'search_replace':
      - For each SEARCH/REPLACE block:
        i.  Find exact match in file
        ii. If not found, try fuzzy match (Levenshtein)
        iii. If fuzzy match score > 0.8, apply
        iv. If score < 0.8, mark as failed, log error
   e. For 'delete': delete the file
3. After all edits applied:
   - Show VS Code notification with summary
   - Open Source Control tab so user can review diffs
   - Update batch job status in DB
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/apply/fileEditApplier.ts` | Main orchestrator: takes FileEdit[], applies to workspace |
| `src/chat/apply/fullFileWriter.ts` | Handles full file write (create + overwrite) |
| `src/chat/apply/searchReplaceApplier.ts` | Enhanced SEARCH/REPLACE with better fuzzy matching |
| `src/chat/apply/editModeSelector.ts` | Determines which mode to use based on settings + file size |
| `src/chat/apply/types.ts` | TypeScript interfaces for file edits |
| `src/webview/components/ai-chat/FileEditCard.tsx` | UI: shows individual file edit with diff preview |
| `src/webview/components/ai-chat/EditReviewPanel.tsx` | UI: shows all edits from a batch response for review |

## Files to Edit

| File | Change |
|------|--------|
| [`src/core/patching/codePatcher.ts`](src/core/patching/codePatcher.ts) | Extract reusable `applySearchReplace()` function |
| [`src/core/patching/contentAnalyst.ts`](src/core/patching/contentAnalyst.ts) | Improve fuzzy matching with configurable threshold |
| [`src/core/patching/fileResolver.ts`](src/core/patching/fileResolver.ts) | Reuse for path resolution in the applier |
| [`src/chat/nodes/applyEdits.ts`](src/chat/nodes/applyEdits.ts) | Wire to `fileEditApplier` |
| [`src/chat/nodes/humanReviewEdits.ts`](src/chat/nodes/humanReviewEdits.ts) | Pass edit data to UI for review cards |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts) | Handle `applyEdit`, `applyAllEdits`, `skipEdit` messages |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for edit messages |

---

## Atomic Actions

1. **Create `src/chat/apply/types.ts`** — define `FileEdit`, `EditMode`, `ApplyResult`, `ApplyConfig` interfaces
2. **Create `src/chat/apply/editModeSelector.ts`** — `selectMode(filePath, action, settings): EditMode`:
   - Read `repomix.chat.editMode` setting ('full' | 'search_replace' | 'hybrid')
   - If hybrid: check file existence and line count, return appropriate mode
   - Configurable threshold: `repomix.chat.hybridThresholdLines` (default 300)
3. **Create `src/chat/apply/fullFileWriter.ts`** — `writeFullFile(edit: FileEdit): Promise<ApplyResult>`:
   - For `create`: ensure parent directories exist, write file
   - For `edit`: read existing file, write new content
   - Uses `vscode.workspace.fs` API for proper VS Code integration
4. **Create `src/chat/apply/searchReplaceApplier.ts`** — `applySearchReplace(edit: FileEdit): Promise<ApplyResult>`:
   - For each SEARCH/REPLACE block:
     - Try exact match first
     - Fall back to fuzzy match with configurable threshold
     - Apply via `vscode.WorkspaceEdit`
   - Returns detailed result with per-block success/failure
5. **Create `src/chat/apply/fileEditApplier.ts`** — `applyEdits(edits: FileEdit[], config: ApplyConfig): Promise<ApplyResult[]>`:
   - For each edit: resolve path → select mode → apply
   - Collects results, handles errors gracefully (one failure doesn't block others)
   - Emits progress events
   - Returns summary of applied/failed/skipped
6. **Refactor [`codePatcher.ts`](src/core/patching/codePatcher.ts)** — extract `applySearchReplaceToDocument(uri, searchText, replaceText): Promise<boolean>` as a reusable function
7. **Improve [`contentAnalyst.ts`](src/core/patching/contentAnalyst.ts)** — add configurable similarity threshold, better whitespace normalization
8. **Create `src/webview/components/ai-chat/FileEditCard.tsx`** — displays:
   - File path with action badge (create/edit/delete)
   - Inline diff preview (first 20 lines of change)
   - Status badge (pending/applied/failed/skipped)
   - Action buttons: Apply, Skip, View Full Diff
9. **Create `src/webview/components/ai-chat/EditReviewPanel.tsx`** — lists all `FileEditCard`s from a batch response:
   - "Apply All" button
   - "Apply Selected" button
   - Summary: X creates, Y edits, Z deletes
   - Filter by status
10. **Update [`src/chat/nodes/applyEdits.ts`](src/chat/nodes/applyEdits.ts)** — call `fileEditApplier.applyEdits()` with approved edits from state
11. **Update [`ChatController`](src/webview/controllers/ChatController.ts)** — handle:
    - `applyEdit` — apply single edit
    - `applyAllEdits` — apply all pending edits
    - `skipEdit` — mark edit as skipped
    - `viewEditDiff` — open VS Code diff view for the file
12. **Add settings**:
    - `repomix.chat.editMode` — enum: 'full' | 'search_replace' | 'hybrid' (default 'hybrid')
    - `repomix.chat.hybridThresholdLines` — number (default 300)
    - `repomix.chat.fuzzyMatchThreshold` — number 0-1 (default 0.8)
13. **After all edits applied** — call `vscode.commands.executeCommand('workbench.view.scm')` to open Source Control tab
14. **Write tests** — `src/test/chat/apply/fileEditApplier.test.ts`, `editModeSelector.test.ts`, `searchReplaceApplier.test.ts`

---

## Acceptance Criteria

- [ ] New files are created in the correct workspace location
- [ ] Existing files are overwritten (full mode) or patched (SEARCH/REPLACE mode)
- [ ] Hybrid mode auto-selects based on file size
- [ ] User can configure edit mode in settings
- [ ] Failed SEARCH/REPLACE patches are reported with details (expected vs actual)
- [ ] Fuzzy matching catches minor whitespace/formatting differences
- [ ] User can review all changes in VS Code Source Control tab
- [ ] Individual edits can be applied or skipped
- [ ] Bulk "Apply All" works
- [ ] File creation handles nested directory creation
- [ ] Delete action removes files from workspace
