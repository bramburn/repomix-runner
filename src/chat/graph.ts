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
    .addNode("loadPlan", (state) =>
      nodes.loadPlanNode(state, extensionContext, onProgress)
    )
    .addNode("generateQueries", (state) =>
      nodes.generateQueriesNode(state, extensionContext, onProgress)
    )
    .addNode("vectorSearch", (state) =>
      nodes.vectorSearchNode(state, extensionContext, onProgress)
    )
    .addNode("evaluate", (state) =>
      nodes.evaluateNode(state, extensionContext, onProgress)
    )
    .addNode("loadForRewrite", (state) => nodes.loadForRewriteNode(state, onProgress))
    .addNode("editPlan", (state) =>
      nodes.editPlanNode(state, extensionContext, onProgress)
    )
    .addNode("repairEdit", (state) =>
      nodes.repairEditNode(state, extensionContext, onProgress)
    )
    .addNode("generateResponse", (state) =>
      nodes.generateResponseNode(state, extensionContext, onProgress)
    )
    .addEdge("__start__", "loadPlan")
    .addEdge("loadPlan", "generateQueries")
    .addEdge("generateQueries", "vectorSearch")
    .addEdge("vectorSearch", "evaluate")
    .addConditionalEdges("evaluate", (state) => {
      if (state.nextAction === "SEARCH_MORE") {
        return "vectorSearch";
      }
      if (state.nextAction === "REWRITE") {
        return "loadForRewrite";
      }
      return "generateResponse";
    })
    .addEdge("loadForRewrite", "editPlan")
    .addConditionalEdges("editPlan", (state) => {
      if (state.nextAction === "RETRY_EDIT") {
        return "repairEdit";
      }
      return "generateResponse";
    })
    .addConditionalEdges("repairEdit", (state) => {
      if (state.nextAction === "RETRY_EDIT") {
        return "repairEdit";
      }
      return "generateResponse";
    })
    .addEdge("generateResponse", "__end__");

  return workflow.compile();
}
