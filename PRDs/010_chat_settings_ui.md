# PRD 010: Chat Settings & History UI

## Goal

Build the Settings and History tabs for the AI Chat webview. The Settings tab provides configuration for all chat-related features (PostgreSQL connection, LLM models, batch API, compression thresholds, edit modes). The History tab shows all past chat threads with the ability to resume, search, and manage them.

---

## Background

The current [`AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:48) has placeholder tabs for Settings and History that display "coming soon" messages. These need to be fully implemented to support the features from PRDs 001-009.

The existing main webview [`SettingsTab.tsx`](src/webview/components/SettingsTab.tsx) handles indexing/embedding settings. The chat settings are separate and live in the AI Chat webview panel.

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Uses existing Fluent UI components |

---

## Settings Tab Sections

### 1. Database Connection
- PostgreSQL connection string input (password masked)
- "Test Connection" button
- Connection status indicator (connected/disconnected/error)
- "Run Migrations" button (for first-time setup)

### 2. Planning LLM (Gemini Flash)
- Google API Key (stored in VS Code secrets — reuses existing key)
- Model selector: `gemini-2.5-flash` (default), `gemini-2.5-flash-lite`
- Rate limit (RPM) setting

### 3. Batch LLM (Claude Opus)
- Anthropic API Key (stored in VS Code secrets)
- Model selector: `claude-opus-4-20250514` (default)
- Max output tokens (default 16384)
- Thinking budget tokens (default 10000)
- Poll interval seconds (default 60)

### 4. Context Management
- Context threshold % slider (50-95, default 80)
- Max recent messages to keep (default 10)
- File compression level selector (auto/full/skeleton/summary)

### 5. File Edit Mode
- Edit mode dropdown: Full / SEARCH/REPLACE / Hybrid (default)
- Hybrid threshold (lines, default 300)
- Fuzzy match threshold slider (0.5-1.0, default 0.8)

### 6. Architecture Document
- Auto-refresh interval (hours, default 24)
- "Refresh Now" button
- Last generated timestamp
- Document status (fresh/stale/missing)

---

## History Tab Design

```
┌─────────────────────────────────────────────┐
│  📜 Chat History                             │
│                                              │
│  🔍 [Search threads...]                     │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Auth Module Refactor                  │    │
│  │ 2h ago · 45 messages · 12K tokens    │    │
│  │ "Let's implement the JWT refresh..." │    │
│  │ [Resume] [Export] [Delete]           │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ API Endpoint Design                   │    │
│  │ 1d ago · 23 messages · 8K tokens     │    │
│  │ 🔵 Batch pending (2 packages)        │    │
│  │ [Resume] [View Packages] [Export]    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Database Migration                    │    │
│  │ 3d ago · 67 messages · 25K tokens    │    │
│  │ ✅ Completed · 15 files changed      │    │
│  │ [Resume] [Export] [Archive] [Delete] │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [Load More...]                              │
└─────────────────────────────────────────────┘
```

### History Features
- **Search**: Full-text search across thread titles and message content
- **Resume**: Switch to the Chat tab with the selected thread loaded
- **Export**: Download thread as JSON
- **Archive**: Move to archived state (hidden from default view)
- **Delete**: Permanently delete thread and all messages
- **Batch status**: Show if thread has pending batch jobs
- **Pagination**: Load 20 threads at a time, "Load More" button

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/webview/components/ai-chat/ChatSettingsTab.tsx` | Full settings form for chat configuration |
| `src/webview/components/ai-chat/ChatHistoryTab.tsx` | Thread history list with search and management |
| `src/webview/components/ai-chat/ThreadCard.tsx` | Individual thread card in history list |
| `src/webview/components/ai-chat/ConnectionStatus.tsx` | Database connection status indicator |
| `src/webview/components/ai-chat/SecretInput.tsx` | Masked input for API keys with save-to-secrets button |

## Files to Edit

| File | Change |
|------|--------|
| [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:35) | Replace placeholder Settings/History content with new components |
| [`src/webview/controllers/ChatController.ts`](src/webview/controllers/ChatController.ts) | Handle settings read/write messages, history search/pagination |
| [`src/webview/messageSchemas.ts`](src/webview/messageSchemas.ts) | Add schemas for settings and history messages |
| [`package.json`](package.json:34) | Add new VS Code configuration properties for all chat settings |
| [`src/extension.ts`](src/extension.ts) | Register secret storage for Anthropic API key |

---

## VS Code Settings to Add

```json
{
  "repomix.chat.postgresConnectionString": {
    "type": "string",
    "default": "",
    "description": "PostgreSQL connection string for chat storage (e.g., postgresql://user:pass@host:5432/dbname)"
  },
  "repomix.chat.planningModel": {
    "type": "string",
    "enum": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    "default": "gemini-2.5-flash",
    "description": "LLM model for planning and orchestration"
  },
  "repomix.chat.batchModel": {
    "type": "string",
    "default": "claude-opus-4-20250514",
    "description": "LLM model for batch processing (Anthropic)"
  },
  "repomix.chat.batchMaxTokens": {
    "type": "number",
    "default": 16384,
    "description": "Maximum output tokens for batch LLM responses"
  },
  "repomix.chat.batchThinkingBudget": {
    "type": "number",
    "default": 10000,
    "description": "Thinking budget tokens for Claude extended thinking"
  },
  "repomix.chat.batchPollIntervalSeconds": {
    "type": "number",
    "default": 60,
    "minimum": 10,
    "description": "How often to poll for batch job completion (seconds)"
  },
  "repomix.chat.contextThresholdPercent": {
    "type": "number",
    "default": 80,
    "minimum": 50,
    "maximum": 95,
    "description": "Context window usage % that triggers compression"
  },
  "repomix.chat.maxRecentMessages": {
    "type": "number",
    "default": 10,
    "minimum": 3,
    "description": "Number of recent messages to keep in full before summarizing"
  },
  "repomix.chat.editMode": {
    "type": "string",
    "enum": ["full", "search_replace", "hybrid"],
    "default": "hybrid",
    "description": "How to apply file edits from batch responses"
  },
  "repomix.chat.hybridThresholdLines": {
    "type": "number",
    "default": 300,
    "description": "Line count threshold for hybrid edit mode (files above this use SEARCH/REPLACE)"
  },
  "repomix.chat.fuzzyMatchThreshold": {
    "type": "number",
    "default": 0.8,
    "minimum": 0.5,
    "maximum": 1.0,
    "description": "Similarity threshold for fuzzy SEARCH/REPLACE matching"
  },
  "repomix.chat.architectureRefreshHours": {
    "type": "number",
    "default": 24,
    "minimum": 1,
    "description": "Hours between automatic architecture document refreshes"
  }
}
```

---

## Atomic Actions

1. **Create `src/webview/components/ai-chat/SecretInput.tsx`** — masked text input with "Save" button that sends `saveSecret` message to extension; shows "Saved ✓" confirmation
2. **Create `src/webview/components/ai-chat/ConnectionStatus.tsx`** — displays connection state: disconnected (gray), connecting (yellow), connected (green), error (red with message)
3. **Create `src/webview/components/ai-chat/ChatSettingsTab.tsx`** — form with all 6 sections:
   - Database: connection string input + test button + status
   - Planning LLM: API key (SecretInput) + model dropdown + RPM
   - Batch LLM: API key (SecretInput) + model + max tokens + thinking budget + poll interval
   - Context: threshold slider + max messages
   - Edit Mode: mode dropdown + hybrid threshold + fuzzy threshold
   - Architecture: refresh interval + refresh button + status
4. **Create `src/webview/components/ai-chat/ThreadCard.tsx`** — displays thread title, time ago, message count, token count, preview text, batch status badge, action buttons
5. **Create `src/webview/components/ai-chat/ChatHistoryTab.tsx`** — search input + thread list with pagination:
   - Loads threads from PostgreSQL via controller
   - Search filters by title and message content
   - "Show Archived" toggle
   - Pagination with "Load More"
6. **Update [`src/webview/AiChatRoot.tsx`](src/webview/AiChatRoot.tsx:48)** — replace placeholder content:
   - `{activeTab === 'Settings' && <ChatSettingsTab />}`
   - `{activeTab === 'History' && <ChatHistoryTab />}`
7. **Update [`package.json`](package.json:34)** — add all VS Code configuration properties listed above under a new `"Chat"` configuration section
8. **Update [`ChatController`](src/webview/controllers/ChatController.ts)** — handle settings messages:
   - `getChatSettings` → read all settings from VS Code config + secrets
   - `setChatSetting` → write individual setting
   - `saveSecret` → store API key in `extensionContext.secrets`
   - `testPostgresConnection` → attempt connection, return status
   - `runMigrations` → execute migration SQL
   - `searchThreads` → full-text search across threads
   - `getThreadsPage` → paginated thread list
   - `archiveThread` → update thread status
9. **Update [`messageSchemas.ts`](src/webview/messageSchemas.ts)** — add Zod schemas for all settings and history messages
10. **Update [`src/extension.ts`](src/extension.ts)** — register `repomix.chat.anthropicApiKey` in secrets store
11. **Write tests** — `src/test/webview/ChatSettingsTab.test.ts`, `ChatHistoryTab.test.ts`

---

## Acceptance Criteria

- [ ] Settings tab displays all configuration sections
- [ ] PostgreSQL connection can be tested from the UI
- [ ] API keys are stored securely in VS Code secrets (not in plaintext settings)
- [ ] All settings persist across extension restarts
- [ ] History tab shows all threads sorted by last updated
- [ ] Search filters threads by title and content
- [ ] Threads can be resumed (switches to Chat tab with thread loaded)
- [ ] Threads can be exported, archived, and deleted
- [ ] Batch status is visible on threads with pending jobs
- [ ] Pagination works for large thread lists
- [ ] Settings changes take effect immediately (no restart required)
