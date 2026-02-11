import { StateGraph } from "@langchain/langgraph";
import type { ExtensionContext } from "vscode";
import { ChatState } from "./state";
import * as nodes from "./nodes";

/**
 * Creates and compiles the chat graph.
 * This is a simple graph with a single "helloWorld" node for demonstration.
 */
export function createChatGraph(extensionContext: ExtensionContext) {
  const workflow = new StateGraph(ChatState)
    .addNode("vectorSearch", (state) => nodes.vectorSearchNode(state, extensionContext))
    .addNode("helloWorld", nodes.helloWorldNode)
    .addEdge("__start__", "vectorSearch")
    .addEdge("vectorSearch", "helloWorld")
    .addEdge("helloWorld", "__end__");

  return workflow.compile();
}
