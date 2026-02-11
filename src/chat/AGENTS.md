# Chat Graph Guide

This folder contains the Chat Graph used by the webview chat UI. It is a small LangGraph workflow that takes user input, optionally enriches it (RAG), and returns a response to the webview.

## Structure

- `src/chat/state.ts`
  - Defines the `ChatState` (shared state for the graph).
  - Add fields here when you need to store new data across nodes.
- `src/chat/nodes.ts`
  - Graph nodes (functions) such as `vectorSearchNode` and `helloWorldNode`.
  - Each node reads from and returns updates to the state.
- `src/chat/graph.ts`
  - Graph wiring (nodes + edges). This is the flow definition.
- `src/webview/controllers/ChatController.ts`
  - Runs the graph and sends the result back to the webview.
- `src/webview/components/ChatTab.tsx`
  - UI that sends user input (`chatSubmit`) and receives responses (`chatResponse`).

## How The Chat Graph Communicates With ChatTab

1. `ChatTab` posts a message to the extension:
   - `command: 'chatSubmit'`
   - `text: <user input>`
2. `ChatController` receives it and runs `createChatGraph(...)`.
3. The graph produces a final state with `aiResponse` (and optional extras like `tokensUsed`, `costUsd`).
4. `ChatController` sends a `chatResponse` message to the webview.
5. `ChatTab` updates UI when it receives `chatResponse`.

## Add Or Edit State

Edit `src/chat/state.ts`:

- Add a new field with `Annotation<...>()`.
- Provide a `default` and `reducer` when needed.

Example:

```ts
newField: Annotation<number>({
  reducer: (_, y) => y,
  default: () => 0,
}),
```

If this data needs to reach the UI, also update:

- `src/webview/controllers/ChatController.ts` (include the new field in `chatResponse`)
- `src/webview/messageSchemas.ts` (schema for `chatResponse`)
- `src/webview/components/ChatTab.tsx` (read and render it)

## Add A Node

1. Create the node function in `src/chat/nodes.ts`:

```ts
export async function myNode(state: typeof ChatState.State, deps: MyDeps) {
  // read state, do work
  return { someField: newValue };
}
```

2. Register the node and wire edges in `src/chat/graph.ts`:

```ts
const workflow = new StateGraph(ChatState)
  .addNode("myNode", (state) => nodes.myNode(state, deps))
  .addEdge("__start__", "myNode")
  .addEdge("myNode", "__end__");
```

3. If the node needs dependencies, pass them through `createChatGraph(...)` and inject from `ChatController`.

## Edit An Existing Node

- Update the node in `src/chat/nodes.ts`.
- If you change its inputs or dependencies, update `src/chat/graph.ts` and `ChatController` accordingly.
- If you change state fields, update `src/chat/state.ts` and any UI wiring (see above).

## Example: RAG Node Flow

- `vectorSearchNode`:
  - Embeds the query with `embeddingService`.
  - Queries the vector DB adapter (`getVectorDbAdapterForRepo`).
  - Loads snippet content from files on disk.
  - Writes `retrievedContext` into state.
- `helloWorldNode`:
  - Reads `retrievedContext` to build the response.

## Tips

- Keep nodes small and return only the fields you need to update.
- Prefer `groupBy: "filePath"` in vector queries to avoid many hits from one file.
- Use `getRepoId(...)` and `getVectorDbAdapterForRepo(...)` for repo-scoped queries.

