import { StateGraph } from "@langchain/langgraph";
import { ChatState } from "./state";
import * as nodes from "./nodes";

/**
 * Creates and compiles the chat graph.
 * This is a simple graph with a single "helloWorld" node for demonstration.
 */
export function createChatGraph() {
  const workflow = new StateGraph(ChatState)
    .addNode("helloWorld", nodes.helloWorldNode)
    .addEdge("__start__", "helloWorld")
    .addEdge("helloWorld", "__end__");

  return workflow.compile();
}

