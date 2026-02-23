# PRD 008: Repo Architecture Generator

## Goal

Build a LangGraph sub-workflow that generates and maintains a comprehensive markdown document describing the repository's architecture — including a directory tree with folder explanations, key file descriptions, dependency overview, and architectural patterns. This document is used as context for both the planning LLM (Gemini Flash) and the batch LLM (Claude Opus) to understand the overall codebase without needing to include every file.

---

## Background

The existing [`fingerprint/`](src/fingerprint/graph.ts) system already generates a [`RepoBlueprint`](src/core/storage/databaseService.ts:82) containing:
- `packageInfo` — parsed package.json
- `configFiles` — discovered config files
- `directoryStructure` — tree of files/directories
- `architecturalPatterns` — naming conventions, data fetching, state management
- `developmentGuides` — how-to guides for common tasks

However, this data is stored as structured JSON in SQLite and isn't optimized for LLM consumption. We need a **markdown-formatted architecture document** that:
1. Presents the directory tree with inline explanations of what each folder does
2. Highlights key files (entry points, config, types, main modules)
3. Summarizes the dependency stack
4. Is stored in PostgreSQL for cross-session retrieval
5. Auto-refreshes when the repo changes (git commit hash comparison)
6. Can be generated as a separate LangGraph workflow (not blocking the chat)

---

## Packages Needed

| Package | Purpose |
|---------|---------|
| (none new) | Reuses existing LangGraph, Gemini Flash, fingerprint infrastructure |

---

## Architecture Document Format

```markdown
# Repository Architecture: {repoName}

## Overview
{2-3 sentence description of what this project is and does}

## Tech Stack
- **Language**: TypeScript
- **Framework**: VS Code Extension API + React (webview)
- **Key Dependencies**: @langchain/langgraph, @qdrant/js-client-rest, sql.js
- **Build**: esbuild + TypeScript compiler
- **Test**: Mocha + @vscode/test-electron

## Directory Structure
```
src/
├── extension.ts          # Extension entry point, command registration
├── agent/                # Smart Agent LangGraph workflow (file selection + bundling)
│   ├── graph.ts          # Graph definition with nodes and edges
│   ├── nodes.ts          # Node implementations (RAG, filtering, summary)
│   └── state.ts          # Agent state annotations
├── chat/                 # Chat system (this is being enhanced)
│   ├── graph.ts          # Chat LangGraph workflow
│   ├── nodes.ts          # Chat nodes (search, evaluate, plan, respond)
│   └── state.ts          # Chat state annotations
├── core/
│   ├── compression/      # AST-based code compression (tree-sitter)
│   ├── indexing/          # Vector DB indexing pipeline
│   ├── patching/          # SEARCH/REPLACE code patching
│   └── storage/           # SQLite database service
├── webview/
│   ├── components/        # React UI components
│   ├── controllers/       # Message handlers (Chat, Config, Agent, etc.)
│   └── App.tsx            # Main webview application
└── ...
```

## Key Files
| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension activation, command registration, service initialization |
| `src/chat/graph.ts` | Chat workflow definition |
| `src/core/storage/databaseService.ts` | SQLite persistence for indexing, blueprints, history |
| ... | ... |

## Architectural Patterns
- **LangGraph Workflows**: All AI features use LangGraph state graphs (agent, chat, search, fingerprint)
- **Controller Pattern**: Webview messages dispatched to typed controllers
- **Repository Pattern**: Data access through service classes
- ...
```

---

## LangGraph Sub-Workflow

```
__start__
    │
    ▼
[checkFreshness]  ← compare git HEAD with stored commit hash
    │
    ├── (fresh) → __end__ (return cached document)
    │
    ▼ (stale or missing)
[scanDirectory]   ← walk filesystem, build tree, classify folders
    │
    ▼
[analyzeKeyFiles] ← identify entry points, configs, type definitions
    │
    ▼
[gatherDependencies] ← parse package.json, requirements.txt, etc.
    │
    ▼
[generateDocument] ← Gemini Flash: synthesize markdown from all data
    │
    ▼
[storeDocument]   ← save to PostgreSQL repo_architecture table
    │
    ▼
__end__
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/chat/architecture/architectureGraph.ts` | LangGraph workflow definition |
| `src/chat/architecture/architectureState.ts` | State annotations for the architecture graph |
| `src/chat/architecture/nodes/checkFreshness.ts` | Compares git HEAD with stored hash |
| `src/chat/architecture/nodes/scanDirectory.ts` | Walks filesystem, builds classified tree |
| `src/chat/architecture/nodes/analyzeKeyFiles.ts` | Identifies and summarizes key files |
| `src/chat/architecture/nodes/gatherDependencies.ts` | Parses manifest files for dependency info |
| `src/chat/architecture/nodes/generateDocument.ts` | Gemini Flash generates the markdown document |
| `src/chat/architecture/nodes/storeDocument.ts` | Persists to PostgreSQL |
| `src/chat/architecture/prompts.ts` | Prompt templates for architecture generation |

## Files to Edit

| File | Change |
|------|--------|
| [`src/chat/db/architectureRepository.ts`](src/chat/db/architectureRepository.ts) | Already created in PRD 001 — verify API matches |
| [`src/chat/nodes/gatherContext.ts`](src/chat/nodes/gatherContext.ts) | Load architecture document as part of context gathering |
| [`src/extension.ts`](src/extension.ts) | Register architecture refresh command, trigger on workspace open |
| [`src/fingerprint/nodes.ts`](src/fingerprint/nodes.ts) | Optionally trigger architecture doc generation after fingerprint completes |

---

## Atomic Actions

1. **Create `src/chat/architecture/architectureState.ts`** — define state: `repoId`, `repoRoot`, `gitHead`, `directoryTree`, `keyFiles`, `dependencies`, `markdownDocument`, `isFresh`
2. **Create `src/chat/architecture/nodes/checkFreshness.ts`** — read current git HEAD via [`GitService`](src/git/GitService.ts), compare with stored `git_commit` in `repo_architecture` table, set `isFresh` flag
3. **Create `src/chat/architecture/nodes/scanDirectory.ts`** — walk the workspace directory (respecting `.gitignore`), build a tree structure, classify folders using heuristics (e.g., `src/` = source, `test/` = tests, `scripts/` = build scripts)
4. **Create `src/chat/architecture/nodes/analyzeKeyFiles.ts`** — identify key files: entry points (package.json `main`), config files, type definition files, README; read first 100 lines of each for summary
5. **Create `src/chat/architecture/nodes/gatherDependencies.ts`** — parse `package.json` dependencies/devDependencies, `requirements.txt`, `Cargo.toml`, etc. — reuse existing [`fingerprint`](src/fingerprint/nodes.ts) logic where possible
6. **Create `src/chat/architecture/prompts.ts`** — prompt template that takes directory tree + key files + dependencies → asks Gemini Flash to generate the markdown architecture document
7. **Create `src/chat/architecture/nodes/generateDocument.ts`** — calls Gemini Flash with the prompt, returns markdown string
8. **Create `src/chat/architecture/nodes/storeDocument.ts`** — saves to `repo_architecture` table via `architectureRepository`, also writes to `.repomix/architecture.md` for local reference
9. **Create `src/chat/architecture/architectureGraph.ts`** — wire all nodes: `checkFreshness` → conditional (fresh → end, stale → `scanDirectory` → `analyzeKeyFiles` → `gatherDependencies` → `generateDocument` → `storeDocument` → end)
10. **Update [`src/chat/nodes/gatherContext.ts`](src/chat/nodes/gatherContext.ts)** — at the start of context gathering, load the architecture document from DB; if missing or expired, trigger the architecture graph first
11. **Update [`src/extension.ts`](src/extension.ts)** — register command `repomixRunner.refreshArchitecture` that manually triggers the architecture graph; optionally auto-trigger on workspace open if document is stale
12. **Add setting** `repomix.chat.architectureRefreshHours` (number, default 24) — how often to regenerate the architecture document
13. **Write to `.repomix/architecture.md`** — also save a local copy so users can browse it
14. **Write tests** — `src/test/chat/architecture/scanDirectory.test.ts`, `checkFreshness.test.ts`

---

## Acceptance Criteria

- [ ] Architecture document is auto-generated on first chat use for a repo
- [ ] Document includes directory tree with folder explanations
- [ ] Document includes key files table with purposes
- [ ] Document includes tech stack and dependency summary
- [ ] Document is cached and only regenerated when git HEAD changes or TTL expires
- [ ] Document is stored in PostgreSQL and also written to `.repomix/architecture.md`
- [ ] Document is automatically included in batch prompt packages as context
- [ ] Manual refresh command works
- [ ] Generation uses Gemini Flash (not the expensive batch model)
