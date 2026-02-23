# PRD 003: Context Compression Strategy

## Goal

Implement intelligent context management that monitors token usage against a configurable threshold and compresses the conversation context when it approaches the limit. This ensures long-running chat sessions remain functional without losing critical information, and that the prompt packages sent to the batch LLM are optimally sized.

---

## Background

There are two distinct compression needs:

### 1. Conversation History Compression
As a chat thread grows, the message history accumulates tokens. When the total context (system prompt + history + retrieved files) approaches the model's context window, we need to compress older messages into summaries while preserving recent exchanges and key decisions.

### 2. File Context Compression
When packaging prompts for the batch LLM (Claude Opus 4), we gather multiple files as context. Large files waste tokens on implementation details when only signatures, types, and structure matter. The existing [`compressFile()`](src/core/compression/index.ts) provides AST-level skeleton extraction for supported languages.

### How Compression Helps the Chat & Prompt Pipeline

| Scenario | Without Compression | With Compression |
|----------|-------------------|-----------------|
| 50-message thread | ~40K tokens of history | ~8K tokens (summarized older messages, full recent 10) |
| 15 context files averaging 500 lines | ~75K tokens raw | ~15K tokens (AST skeletons + key sections) |
| Batch prompt to Opus | May exceed 200K limit | Fits comfortably with room for output |

The user configures a **context threshold percentage** (e.g., 80%) in the chat settings. When current token count reaches that % of the model's context window, compression triggers automatically.

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses existing `gpt-tokenizer` / `js-tiktoken` for counting, `compressFile` for AST compression, Gemini Flash for summarization |

---

## Compression Strategies

### Strategy A: Conversation History Summarization

**Trigger:** `totalHistoryTokens / contextWindowSize >= thresholdPercent`

**Algorithm:**
1. Keep the last N messages (configurable, default 10) in full
2. Take all older messages and batch them into groups of ~5
3. For each group, call Gemini 2.5 Flash with a summarization prompt:
   - "Summarize this conversation segment. Preserve: key decisions, file paths mentioned, code changes discussed, user preferences expressed. Output a concise paragraph."
4. Replace the original messages with `{ role: 'system', content: '[Summary] ...' }` markers
5. Store the original messages in the `chat_messages` table with a `compressed: true` flag so they can be expanded if needed

**Token Budget Allocation:**
- System prompt: 2K tokens reserved
- Conversation summaries: 20% of remaining budget
- Recent messages: 30% of remaining budget
- File context: 50% of remaining budget

### Strategy B: File Context Compression (for Prompt Packaging)

**Levels (applied progressively):**

1. **Level 0 — Full content**: File included as-is (for small files < 100 lines)
2. **Level 1 — AST skeleton**: Use [`compressFile()`](src/core/compression/compressFile.ts) to extract imports, signatures, interfaces, types, classes with bodies removed. Works for TS/JS/Python/Rust/C#/Dart.
3. **Level 2 — Targeted extraction**: For files where only specific sections are relevant, extract only the functions/classes mentioned in the goal using tree-sitter queries
4. **Level 3 — LLM summary**: For unsupported languages or when even AST skeleton is too large, call Gemini Flash to produce a 200-word summary of the file's purpose and key exports

**Selection logic:**
```
for each contextFile:
  if file.tokens < 200:
    use Level 0
  elif file.language is supported by compressFile:
    compressed = compressFile(file)
    if compressed.tokens < budget_per_file:
      use Level 1
    else:
      use Level 2 (targeted extraction)
  else:
    use Level 3 (LLM summary)
```

### Strategy C: Sliding Window with Anchors

For the batch prompt specifically, certain pieces of context are "anchored" and never compressed:
- The goal text itself
- Output instruction template
- Files that the user explicitly pinned
- The repo architecture markdown

Everything else is subject to compression based on available token budget.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/compression/contextManager.ts` | Main orchestrator: monitors token usage, triggers compression |
| `src/chat/compression/historySummarizer.ts` | Summarizes conversation history segments via Gemini Flash |
| `src/chat/compression/fileCompressor.ts` | Multi-level file compression (AST → targeted → LLM summary) |
| `src/chat/compression/tokenBudget.ts` | Token budget calculator and allocator |
| `src/chat/compression/types.ts` | Shared types for compression pipeline |

## Files to Edit

| File | Change |
|------|--------|
| [`src/chat/state.ts`](src/chat/state.ts:6) | Add `compressionLevel`, `tokenBudget`, `compressedSegments` fields |
| [`src/chat/nodes/gatherContext.ts`](src/chat/nodes/gatherContext.ts) | Integrate file compressor when loading context files |
| [`src/chat/nodes/packagePrompt.ts`](src/chat/nodes/packagePrompt.ts) | Use token budget allocator when assembling final prompt |
| [`src/core/compression/compressFile.ts`](src/core/compression/compressFile.ts) | Export token count alongside compressed output |

---

## Atomic Actions

1. **Create `src/chat/compression/types.ts`** — define `CompressionLevel`, `TokenBudget`, `CompressedSegment`, `CompressionConfig` interfaces
2. **Create `src/chat/compression/tokenBudget.ts`** — `calculateBudget(modelContextWindow, thresholdPercent)` returns allocation for system/history/context/output; `countTokens(text)` wrapper around `gpt-tokenizer`
3. **Create `src/chat/compression/historySummarizer.ts`** — `summarizeHistory(messages, maxTokens, apiKey)`: groups old messages, calls Gemini Flash, returns compressed history with summary markers
4. **Create `src/chat/compression/fileCompressor.ts`** — `compressFileForContext(filePath, content, maxTokens)`: applies progressive compression levels, returns `{ content, level, tokens }`
5. **Create `src/chat/compression/contextManager.ts`** — `manageContext(state, config)`: checks if compression needed, orchestrates history + file compression, returns updated state with compressed data
6. **Update [`src/chat/state.ts`](src/chat/state.ts:6)** — add `contextThresholdPercent` (default 80), `currentTokenCount`, `compressionApplied` boolean
7. **Update [`src/core/compression/compressFile.ts`](src/core/compression/compressFile.ts)** — return `{ compressed: string | null, tokenCount: number }` instead of just `string | null`
8. **Integrate into `gatherContext` node** — after loading files, run through `fileCompressor` to fit within budget
9. **Integrate into `packagePrompt` node** — before assembling final prompt, run `contextManager` to ensure total fits within Opus context window
10. **Add setting** `repomix.chat.contextThresholdPercent` (number, default 80, min 50, max 95) — the % of context window that triggers compression
11. **Add setting** `repomix.chat.maxRecentMessages` (number, default 10) — messages to keep in full before summarizing older ones
12. **Write tests** — `src/test/chat/compression/tokenBudget.test.ts`, `fileCompressor.test.ts`

---

## Acceptance Criteria

- [ ] Token count is tracked per message and per context file
- [ ] When history exceeds threshold, older messages are automatically summarized
- [ ] Summaries preserve key decisions, file paths, and code change references
- [ ] File context uses AST compression for supported languages
- [ ] Unsupported languages fall back to LLM summary
- [ ] User can configure threshold percentage in settings
- [ ] Compressed context still produces coherent LLM responses
- [ ] Original messages remain accessible in the database (not deleted, just flagged)
