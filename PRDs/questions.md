# Critical Questions for Chat System PRDs

> These questions block architectural decisions. Please answer each so I can finalize the PRDs.

---

## Q1: PostgreSQL Deployment Model

You mentioned PostgreSQL for memory storage and session storage. VS Code extensions run in a sandboxed Node.js process and can't bundle a PostgreSQL server.

**Options:**
- **(A)** User provides a connection string to an external PostgreSQL instance (self-hosted or cloud like Supabase/Neon) configured in Settings.
- **(B)** Use SQLite (already in the project via `sql.js`) for local-first storage and add an optional PostgreSQL sync layer for team/cloud scenarios.
- **(C)** Something else?

**Why it matters:** Determines whether we add `pg` / `@neondatabase/serverless` as a dependency, and whether PostgreSQL is required or optional.

answer: go for option A so that the sync is stronger and no messing about with migration of sqlite.

---

## Q2: Claude Opus 4 Batch API Mechanics

The diagram shows batch processing with ~24-hour turnaround. Anthropic's official Batch API returns a `batch_id` that you poll.

- **(a)** Are we using the official **Anthropic Message Batches API** (`POST /v1/messages/batches`)? Or is this going through an intermediary/proxy?
- **(b)** How should the extension survive restarts while waiting? My assumption: persist `batch_id` + metadata to disk/DB → poll on startup + interval timer. Confirm?
- **(c)** Should we support a webhook/callback as an alternative to polling, or is polling sufficient?


answer: yes we want to use option A, we poll it until we get a response and we notify the user. the user cannot do much until the response other than starting a new chat thread. please note that we can create multiple batch packages and then send them in a go and wait for its response
---

## Q3: Separate Qdrant for Chat — Scope

You said "it can be different to the main indexing/semantic search." Does this mean:

- **(A)** A separate **collection** on the same Qdrant instance (simpler, just a new collection name in settings).
- **(B)** A potentially **entirely different Qdrant URL + API key** for the chat memory vector store.
- **(C)** Both — default to same instance, different collection, but allow overriding the URL?

answer: I think i went overboard with this idea request. I thought we could use qdrant to manage long conversation but we don't really need that, we just use qdrant to query the db as we're doing already for the current repo to gather relevant snippets or files from the repo that we can use for our context gathering to package the requestion

---

## Q4: File Edit Strategy from Batch Response

The expensive LLM (Opus) will output full file contents or edit instructions. Currently the codebase has a SEARCH/REPLACE patching system in [`src/core/patching/`](src/core/patching/codePatcher.ts).

- **(a)** Should we instruct Opus to output **full file contents** (simpler, more tokens but reliable) or **SEARCH/REPLACE diffs** (matching the existing patching infra)?
- **(b)** For new files, do we auto-create in the workspace, or stage them in `.repomix/incoming/` for user review first?
- **(c)** Should the user approve each file edit individually, or can they bulk-approve all at once? (The diagram shows "user approves all or single one.")

answer: go for option A where we can generate full file content but for files that are too big we can do search/replace. we could have a dropdown option in our chat settings tab that allows us to test full file, search replace and our hybrid approach. and we do autocreate the files in the workspace then i'll review it in the commit changes tab in vscode. what i meant by aproves all or single one is that when we are in a chat thread we have reached to the part where we've gathered all the context it will show a card that says we've completed the package, and there should be a package tab where we can see multiple thread's package (by package i mean a prompt that includes: goal, files context, output instruction [either plan, or code change or code review] then on that page we can approve and send a package to the batch api 1by1 or send a bulk set of packages to the batch api endpoint)

---

## Q5: "Installed Applications" Context

You mentioned gathering "installed applications" as part of the context for the planning LLM. What does this mean exactly?

- **(A)** The extensions installed in VS Code?
- **(B)** The CLI tools available on the user's system (e.g., `node`, `python`, `docker`)?
- **(C)** The dependencies declared in `package.json` / `requirements.txt` / etc.? (Already captured by the fingerprint/blueprint system.)

answer: it is the dependencies of the repo workspace - option C

---

## Assumptions I'll proceed with unless you correct them:

1. **Storage responses at `.repomix/incoming/{batchId}/...`** as `.xml` or `.md` files per the diagram.
2. **Plans stored at `.repomix/plans/{threadId}.md`** — already implemented in [`PlanService`](src/services/planService.ts).
3. **The "repo architecture doc"** will extend the existing [`fingerprint/`](src/fingerprint/graph.ts) system (which already generates `RepoBlueprint` with directory structure, patterns, guides) — we'll add markdown tree output with folder explanations.
4. **Gemini 2.5 Flash** is the planning/orchestration model; **Claude Opus 4.6 EXTRA THINKING** is the batch execution model. No other models needed initially.
5. **Message queue** = in-memory queue in the extension with persistence, not an external message broker.
6. **Context compression** uses the existing [`compressFile`](src/core/compression/index.ts) for AST-level compression plus LLM-based summarization for conversation history. user answer:But not sure how its useful for the chat and prompt you might need to elaborate on this in the plan with details.
