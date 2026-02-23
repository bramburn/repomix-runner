# PRD 001: PostgreSQL Chat Storage

## Goal

Replace the current file-based conversation storage ([`ConversationService`](src/services/conversationService.ts)) and local JSON thread index with a PostgreSQL-backed persistence layer. All chat sessions, messages, memory entries, and batch job metadata will live in PostgreSQL so that data survives extension reinstalls, syncs across machines, and supports relational queries (e.g. "find all sessions for repo X").

---

## Background

The existing [`ConversationService`](src/services/conversationService.ts:18) stores threads in `threads.json` and conversations as individual JSON files under `globalStorageUri`. This works for single-machine use but:

- Cannot be shared across machines or team members.
- Has no relational query capability (e.g. join sessions with memory entries).
- Cannot support the batch job tracking, package management, and memory CRUD features planned in later PRDs.

The user has confirmed **Option A**: an external PostgreSQL connection string provided in VS Code settings.

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| `pg` | Node.js PostgreSQL client |
| `@types/pg` (devDep) | TypeScript types for `pg` |

---

## Database Schema

### Tables

```sql
-- Chat threads (replaces threads.json)
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  preview TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'  -- active | archived | deleted
);

-- Chat messages (replaces {threadId}.json files)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  cost_usd NUMERIC(10,6),
  context_files TEXT[],
  tool_calls JSONB,
  metadata JSONB
);
CREATE INDEX idx_messages_thread ON chat_messages(thread_id, timestamp);

-- Memory entries (for Memory Manager CRUD - PRD 004)
CREATE TABLE chat_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('session', 'repo', 'global')),
  scope_id TEXT NOT NULL,  -- thread_id for session, repo_id for repo, 'global' for global
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  embedding_vector FLOAT8[],  -- optional for semantic retrieval
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(scope, scope_id, key)
);
CREATE INDEX idx_memory_scope ON chat_memory(scope, scope_id);

-- Batch jobs (for Batch LLM Pipeline - PRD 005)
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES chat_threads(id),
  batch_api_id TEXT,  -- Anthropic batch_id
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'submitted', 'processing', 'completed', 'failed', 'cancelled')),
  package_type TEXT NOT NULL CHECK (package_type IN ('plan', 'code_change', 'code_review')),
  prompt_payload JSONB NOT NULL,
  response_payload JSONB,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB
);
CREATE INDEX idx_batch_thread ON batch_jobs(thread_id);
CREATE INDEX idx_batch_status ON batch_jobs(status);

-- Repo architecture snapshots (extends fingerprint system)
CREATE TABLE repo_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id TEXT NOT NULL UNIQUE,
  markdown_tree TEXT NOT NULL,
  folder_explanations JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  git_commit TEXT,
  tokens_used INTEGER
);
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/db/postgresClient.ts` | Connection pool singleton, migration runner |
| `src/chat/db/migrations/001_initial_schema.sql` | SQL file with the schema above |
| `src/chat/db/threadRepository.ts` | CRUD for `chat_threads` table |
| `src/chat/db/messageRepository.ts` | CRUD for `chat_messages` table |
| `src/chat/db/memoryRepository.ts` | CRUD for `chat_memory` table |
| `src/chat/db/batchRepository.ts` | CRUD for `batch_jobs` table |
| `src/chat/db/architectureRepository.ts` | CRUD for `repo_architecture` table |

## Files to Edit

| File | Change |
|------|--------|
| [`package.json`](package.json:671) | Add `pg` to dependencies, `@types/pg` to devDependencies |
| [`src/webview/components/ai-chat/ChatTab.tsx`](src/webview/components/ai-chat/ChatTab.tsx:19) | No change yet — wired in PRD 010 |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts:14) | Replace `ConversationService` usage with `threadRepository` + `messageRepository` |
| [`src/extension.ts`](src/extension.ts) | Initialize PostgreSQL connection on activation, pass pool to controllers |
| [`src/services/conversationService.ts`](src/services/conversationService.ts:18) | Deprecate; keep as fallback if no PG connection configured |

---

## Atomic Actions

1. **Install `pg` and `@types/pg`** — `npm install pg && npm install -D @types/pg`
2. **Add VS Code setting** `repomix.chat.postgresConnectionString` (type: string, default: "", description: "PostgreSQL connection string for chat storage")
3. **Create `src/chat/db/postgresClient.ts`** — exports `getPool()` that lazily creates a `pg.Pool` from the setting, runs migrations on first connect, exports `query()` helper
4. **Create migration SQL file** `src/chat/db/migrations/001_initial_schema.sql` with all tables above
5. **Create `src/chat/db/threadRepository.ts`** — `createThread()`, `getThreads(repoId)`, `getThread(id)`, `updateThread(id, patch)`, `deleteThread(id)`, `archiveThread(id)`
6. **Create `src/chat/db/messageRepository.ts`** — `saveMessage(threadId, msg)`, `getMessages(threadId)`, `deleteMessage(id)`
7. **Create `src/chat/db/memoryRepository.ts`** — `upsertMemory(scope, scopeId, key, value)`, `getMemory(scope, scopeId, key)`, `listMemories(scope, scopeId)`, `deleteMemory(id)`, `searchMemories(scope, scopeId, query)`
8. **Create `src/chat/db/batchRepository.ts`** — `createBatchJob(...)`, `getBatchJob(id)`, `listBatchJobs(threadId?)`, `updateBatchStatus(id, status, response?)`, `getPendingBatches()`
9. **Create `src/chat/db/architectureRepository.ts`** — `upsertArchitecture(repoId, data)`, `getArchitecture(repoId)`, `isExpired(repoId)`
10. **Update [`src/extension.ts`](src/extension.ts)** — on activation, read PG connection string from settings, initialize pool, pass to webview providers
11. **Update [`ChatController`](src/webview/controllers/ChatController.ts:14)** — inject repositories, replace all `conversationService` calls with repository calls
12. **Add connection test command** — `repomixRunner.testPostgresConnection` that validates the connection and runs migrations
13. **Write unit tests** — `src/test/chat/db/threadRepository.test.ts`, `messageRepository.test.ts`

---

## Acceptance Criteria

- [ ] User can configure a PostgreSQL connection string in VS Code settings
- [ ] On first connection, tables are auto-created via migration
- [ ] All existing chat functionality (create thread, send message, load history, delete thread) works identically but backed by PostgreSQL
- [ ] If no connection string is configured, the extension shows a warning and the chat feature is disabled (or falls back gracefully)
- [ ] Connection errors are surfaced to the user via notification
