import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state";
import * as nodes from "./nodes";
import { DatabaseService } from '../core/storage/databaseService';
import { getVectorDbAdapterForRepo } from '../core/indexing/vectorDb/factory';

export function createSmartRepomixGraph(databaseService: DatabaseService, bundleId?: string) {
  const workflow = new StateGraph(AgentState)
    // Add all the nodes we defined
    .addNode("analyzeObjective", nodes.analyzeObjective)
    .addNode("retrieval", async (state) => {
      const repoId = state.workspaceRoot; // Use root path as repo ID for now
      const { adapter } = await getVectorDbAdapterForRepo(
        (global as any).extensionContext, // This will need to be provided globally or passed in
        repoId
      );
      return nodes.retrieval(state, adapter, repoId);
    })
    .addNode("relevanceCheck", nodes.relevanceConfirmation)
    .addNode("commandGeneration", nodes.commandGeneration)
    .addNode("execution", (state) => nodes.finalExecution(state, databaseService, bundleId))

    // Define the flow (Edges)
    // Start -> Analyze Objective
    .addEdge("__start__", "analyzeObjective")

    // Analyze -> Retrieval
    .addEdge("analyzeObjective", "retrieval")

    // Conditional edge: Skip to command generation if we already have confirmed files (re-pack scenario)
    .addConditionalEdges("retrieval", (state) => {
      if (state.confirmedFiles.length > 0) {
        return "commandGeneration"; // Skip directly to command generation
      }
      return "relevanceCheck"; // Continue with normal flow
    })

    // Check -> Generate Command
    .addEdge("relevanceCheck", "commandGeneration")

    // Generate -> Execute & Cleanup
    .addEdge("commandGeneration", "execution")

    // End
    .addEdge("execution", "__end__");

  return workflow.compile();
}