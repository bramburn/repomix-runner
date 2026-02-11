# Agent Development Guide

This guide explains the architecture of the Repomix Runner Smart Agent and how to extend its capabilities. The agent is built using **LangGraph** and uses **Google Gemini** models.

## Architecture Overview

The agent is organized into a scalable structure within `src/agent/` (and replicated in `src/fingerprint/` and `src/search/`):

*   **`graph.ts`**: The central orchestrator. It defines the workflow, nodes, and edges (connections) that determine the execution path.
*   **`nodes.ts`**: Contains the core logic for each step in the workflow. Each node receives the current state and returns updates to that state.
*   **`state.ts`**: Defines the `AgentState` schema using `@langchain/langgraph` `Annotation.Root`. This acts as the shared memory passed between nodes.
*   **`prompts.ts`**: Centralized storage for all LLM prompts as pure template functions to separate logic from text generation.
*   **`types.ts`**: (Recommended) Contains Zod schemas and TypeScript interfaces for structured LLM outputs to ensure type safety across the graph.
*   **`llmClient.ts`**: A wrapper around the Gemini API that handles rate limiting, retries, and structured output parsing.

---

## 0. Registration and Usage

The agent is initialized and executed in two primary locations:

1.  **VS Code Command**: `repomixRunner.smartRun` in `src/extension.ts`. It captures the user query via an input box and invokes the graph with progress notification.
2.  **Webview Controller**: `AgentController.ts` in `src/webview/controllers/`. It allows the agent to be triggered from the sidebar UI.

To register the graph, call `createSmartRepomixGraph(databaseService)` which returns a compiled runnable.

---

## 1. How to Add a New Node

Nodes are asynchronous functions that perform a specific task and return a partial state update.

### Step 1: Define the Node in `nodes.ts`

```typescript
// src/agent/nodes.ts
import { AgentState } from "./state";
import { logger } from "../shared/logger";

export async function myNewNode(state: typeof AgentState.State) {
  logger.both.info("Agent: Executing my new node...");

  // ... perform logic ...

  // Return only the fields you want to update in the state
  return {
    someStateField: "newValue"
  };
}
```

### Step 2: Register the Node in `graph.ts`

```typescript
// src/agent/graph.ts
import * as nodes from "./nodes";

export function createSmartRepomixGraph(...) {
  const workflow = new StateGraph(AgentState)
    // ... existing nodes ...
    .addNode("myNewNode", nodes.myNewNode) // <--- Add this

    // ... define edges to connect it ...
    .addEdge("previousNode", "myNewNode")
    .addEdge("myNewNode", "nextNode");

  return workflow.compile();
}
```

---

## 2. Conditional Nodes and Edges

You can create dynamic workflows where the path changes based on the agent's state.

### Using Conditional Edges

In `src/agent/graph.ts`, use `addConditionalEdges` to route execution based on state values.

```typescript
// src/agent/graph.ts

workflow.addConditionalEdges(
  "decisionNode", // The node where the decision is made
  (state) => {
    // Logic to determine the next node
    if (state.needsRefinement) {
      return "refinementNode";
    }
    return "executionNode";
  }
);
```

---

## 3. Prompt Usage

All prompts should be defined in `src/agent/prompts.ts` to maintain cleanliness and reusability.

### Step 1: Add to `prompts.ts`

```typescript
// src/agent/prompts.ts

export const MY_NEW_PROMPT = (context: string) => `
You are a helpful assistant.
Context: ${context}

Task: Analyze the context and provide a summary.
`;
```

### Step 2: Use in a Node

```typescript
// src/agent/nodes.ts
import * as prompts from "./prompts";

const prompt = prompts.MY_NEW_PROMPT(someContext);
```

---

## 4. Making LLM Calls

Use the `src/agent/llmClient.ts` wrapper for all LLM interactions. This ensures:
*   Rate limiting (preventing 429 errors)
*   Automatic retries with exponential backoff
*   Type-safe structured outputs

### Text Generation

Use `generateText` for simple string responses.

```typescript
import * as llmClient from "./llmClient";

const { content, totalTokens } = await llmClient.generateText(
  state.apiKey,
  prompt,
  "My Node Name" // Label for logging
);
```

### Structured Output (JSON)

Use `generateStructured` when you need the LLM to return specific data shapes. This is preferred for reliability.

1.  **Define Schema in `types.ts`**:
```typescript
import { z } from "zod";
export const AnalysisSchema = z.object({
  isRelevant: z.boolean(),
  reasoning: z.string(),
  tags: z.array(z.string())
});
```

2.  **Call Client in `nodes.ts`**:

```typescript
import * as llmClient from "./llmClient";
import { AnalysisSchema } from "./types";

const { parsed, totalTokens } = await llmClient.generateStructured(
  state.apiKey,
  AnalysisSchema,
  prompt,
  "Analysis Node"
);

// parsed is fully typed!
if (parsed.isRelevant) {
  console.log(parsed.reasoning);
}
```

---

## 5. Implementation Rules for Robust Replication

To ensure LLMs can replicate and extend this structure reliably:

1.  **No State Mutations**: Nodes must return a new partial state object.
2.  **Schema-First**: Every structured LLM call must have a Zod schema.
3.  **Pure Prompts**: Prompts must be templates; logic stays in nodes.
4.  **Error Handling**: Nodes should catch errors and update an `errors` array in the state rather than crashing.
5.  **Granularity**: Keep nodes small and focused on one transformation.
