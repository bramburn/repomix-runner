import { StateGraph } from "@langchain/langgraph";
import type { ExtensionContext } from "vscode";
import { ChatState } from "./state";
import * as nodes from "./nodes";

export type ProgressCallback = (message: string) => void;

/**
 * Creates and compiles the chat graph with a Plan & Execute loop.
 */
export function createChatGraph(
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  const workflow = new StateGraph(ChatState)
    .addNode("generateQueries", (state) =>
      nodes.generateQueriesNode(state, extensionContext, onProgress)
    )
    .addNode("vectorSearch", (state) =>
      nodes.vectorSearchNode(state, extensionContext, onProgress)
    )
    .addNode("evaluate", (state) =>
      nodes.evaluateNode(state, extensionContext, onProgress)
    )
    .addNode("readFile", (state) => nodes.readFileNode(state, onProgress))
    .addNode("generateResponse", (state) =>
      nodes.generateResponseNode(state, extensionContext, onProgress)
    )
    .addEdge("__start__", "generateQueries")
    .addEdge("generateQueries", "vectorSearch")
    .addEdge("vectorSearch", "evaluate")
    .addConditionalEdges("evaluate", (state) => {
      if (state.nextAction === "READ") {
        return "readFile";
      }
      return "generateResponse";
    })
    .addEdge("readFile", "evaluate")
    .addEdge("generateResponse", "__end__");

  return workflow.compile();
}
