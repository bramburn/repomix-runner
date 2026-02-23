# PRD 004: Memory Manager CRUD

## Goal

Build a memory management system with full CRUD operations that allows the chat system to store, retrieve, update, and delete persistent knowledge at two scopes: **session-level** (per chat thread) and **repo-level** (shared across all threads for a repository). This gives the LLM persistent context about user preferences, architectural decisions, and project-specific knowledge that survives across conversations.

---

## Background

Currently, each chat thread is stateless beyond its message history. When a user starts a new thread, the LLM has no memory of previous decisions, preferences, or project knowledge established in earlier conversations. 

The memory system provides:
- **Session memory**: Facts specific to a single chat thread (e.g., "user wants to use React Query for data fetching in this task")
- **Repo memory**: Facts shared across all threads for a repo (e.g., "this project uses a monorepo with pnpm workspaces", "the auth module is in src/lib/auth/", "user prefers functional components over class components")

Memory entries are key-value pairs stored in the `chat_memory` table (defined in PRD 001). The user can view, edit, and delete them through a Memory Manager panel in the UI.

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses PostgreSQL from PRD 001, existing Qdrant for optional semantic search |

---

## Memory Entry Structure

```typescript
interface MemoryEntry {
  id: string;           // UUID
  scope: 'session' | 'repo';
  scopeId: string;      // threadId for session, repoId for repo
  key: string;          // human-readable key, e.g. "preferred_framework"
  value: string;        // the actual knowledge, e.g. "User prefers Next.js App Router"
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;     // optional TTL
  source: 'user' | 'auto';  // manually added or auto-extracted by LLM
}
```

### Auto-Extraction

During conversation, the LLM can identify facts worth remembering. A dedicated node in the chat graph will:
1. After each assistant response, check if the conversation contains extractable knowledge
2. Call Gemini Flash with a structured output prompt: "Extract any persistent facts from this exchange that would be useful in future conversations"
3. Auto-create memory entries with `source: 'auto'`
4. User can review and delete auto-extracted memories

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/memory/memoryManager.ts` | Core service: CRUD operations, auto-extraction orchestration |
| `src/chat/memory/memoryExtractor.ts` | LLM-based auto-extraction of facts from conversations |
| `src/chat/memory/memoryInjector.ts` | Injects relevant memories into prompt context |
| `src/chat/memory/types.ts` | TypeScript interfaces for memory entries |
| `src/chat/nodes/extractMemory.ts` | Graph node: runs after response to extract memories |
| `src/webview/components/ai-chat/MemoryPanel.tsx` | UI: list, create, edit, delete memory entries |
| `src/webview/components/ai-chat/MemoryEntryCard.tsx` | UI: single memory entry display with edit/delete |

## Files to Edit

| File | Change |
|------|--------|
| [`src/chat/db/memoryRepository.ts`](src/chat/db/memoryRepository.ts) | Already created in PRD 001 — verify API matches this PRD's needs |
| [`src/chat/graph.ts`](src/chat/graph.ts) | Add `extractMemory` node after `generateSummary` |
| [`src/chat/state.ts`](src/chat/state.ts) | Add `activeMemories` field for injected memories |
| [`src/chat/nodes/prepareGoal.ts`](src/chat/nodes/prepareGoal.ts) | Include relevant memories in goal preparation prompt |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts) | Handle memory CRUD messages from webview |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for memory messages |
| [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:35) | Add "Memory" tab alongside Chat/Settings/History |

---

## Atomic Actions

1. **Create `src/chat/memory/types.ts`** — define `MemoryEntry`, `MemoryScope`, `MemoryCreateInput`, `MemoryUpdateInput` interfaces
2. **Create `src/chat/memory/memoryManager.ts`** — class `MemoryManager` with methods:
   - `create(input: MemoryCreateInput): Promise<MemoryEntry>`
   - `get(id: string): Promise<MemoryEntry | null>`
   - `list(scope: MemoryScope, scopeId: string): Promise<MemoryEntry[]>`
   - `update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry>`
   - `delete(id: string): Promise<void>`
   - `search(scope: MemoryScope, scopeId: string, query: string): Promise<MemoryEntry[]>` — keyword search on key+value
3. **Create `src/chat/memory/memoryExtractor.ts`** — `extractMemories(messages: ThreadMessage[], existingMemories: MemoryEntry[], apiKey: string): Promise<MemoryCreateInput[]>` — calls Gemini Flash with structured output to identify new facts
4. **Create `src/chat/memory/memoryInjector.ts`** — `injectMemories(scope: MemoryScope, scopeId: string, repoId: string): Promise<string>` — loads session + repo memories, formats as a "Known Facts" section for the prompt
5. **Create `src/chat/nodes/extractMemory.ts`** — graph node that runs `memoryExtractor` after each conversation turn, saves results via `memoryManager`
6. **Update [`src/chat/state.ts`](src/chat/state.ts)** — add `activeMemories: Annotation<string>` (formatted memory text for prompt injection)
7. **Update [`src/chat/nodes/prepareGoal.ts`](src/chat/nodes/prepareGoal.ts)** — call `memoryInjector` and include result in the goal preparation prompt as "Previously established facts about this project"
8. **Update [`src/chat/graph.ts`](src/chat/graph.ts)** — add `extractMemory` node, wire after `generateSummary` → `extractMemory` → `__end__`
9. **Create `src/webview/components/ai-chat/MemoryEntryCard.tsx`** — displays key/value with scope badge, edit button, delete button, source indicator (user/auto)
10. **Create `src/webview/components/ai-chat/MemoryPanel.tsx`** — lists memories grouped by scope (session/repo), search bar, "Add Memory" button, uses `MemoryEntryCard`
11. **Update [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:35)** — add "Memory" tab to the `TabList`
12. **Update [`ChatController`](src/webview/controllers/ChatController.ts)** — handle `memoryCreate`, `memoryUpdate`, `memoryDelete`, `memoryList`, `memorySearch` commands
13. **Update [`messageSchemas.ts`](src/webview/messageSchemas.ts)** — add Zod schemas for memory CRUD messages
14. **Write tests** — `src/test/chat/memory/memoryManager.test.ts`, `memoryExtractor.test.ts`

---

## Memory Extraction Prompt

```
You are analyzing a conversation between a user and an AI assistant about a software project.

Extract any persistent facts that would be useful in future conversations about this project.

Categories to look for:
- User preferences (coding style, framework choices, naming conventions)
- Architectural decisions (patterns chosen, libraries selected, folder structure decisions)
- Project constraints (performance requirements, compatibility needs, deployment targets)
- Domain knowledge (business rules, data models, API contracts)

For each fact, provide:
- key: A short, descriptive identifier (snake_case)
- value: The fact itself, written as a clear statement

Only extract facts that are:
1. Explicitly stated or clearly implied by the user
2. Likely to be relevant in future conversations
3. Not already captured in existing memories

Existing memories (do not duplicate):
{existingMemories}

Recent conversation:
{recentMessages}
```

---

## Acceptance Criteria

- [ ] User can view all memories for the current session and repo in the Memory tab
- [ ] User can manually create a new memory entry (key + value + scope)
- [ ] User can edit existing memory entries
- [ ] User can delete memory entries
- [ ] Auto-extraction identifies relevant facts after each conversation turn
- [ ] Auto-extracted memories are tagged with `source: 'auto'`
- [ ] Memories are injected into the goal preparation prompt
- [ ] Session memories are scoped to the thread; repo memories are shared across threads
- [ ] Memory search works by keyword matching on key and value
