import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state";
import * as nodes from "./nodes";
import { DatabaseService } from '../core/storage/databaseService';
import { getVectorDbAdapterForRepo } from '../core/indexing/vectorDb/factory';
import { logger } from '../shared/logger';

export function createSmartRepomixGraph(databaseService: DatabaseService, bundleId?: string) {
  const workflow = new StateGraph(AgentState)
    // Add all the nodes we defined
    .addNode("analyzeObjective", nodes.analyzeObjective)
    .addNode("retrieval", async (state) => {
      const repoId = state.workspaceRoot; // Use root path as repo ID for now

      try {
        // Safely retrieve the extension context from global scope
        const extensionContext = (global as any).extensionContext;

        if (!extensionContext) {
          logger.both.warn("Agent: Extension context not available in global scope, RAG will use fallback");
          // Return empty adapter to trigger fallback in retrieval node
          return nodes.retrieval(state, undefined as any, repoId);
        }

        const { adapter } = await getVectorDbAdapterForRepo(extensionContext, repoId);
        return nodes.retrieval(state, adapter, repoId);
      } catch (error) {
        logger.both.error("Agent: Failed to get vector DB adapter, using fallback", error);
        // Return empty adapter to trigger fallback in retrieval node
        return nodes.retrieval(state, undefined as any, repoId);
      }
    })
    .addNode("relevanceCheck", nodes.relevanceConfirmation)
    .addNode("fetchBlueprint", nodes.fetchBlueprint)
    .addNode("optimizeContext", nodes.optimizeContext)
    .addNode("commandGeneration", nodes.commandGeneration)
    .addNode("generateSummary", nodes.generateSummary)
    .addNode("execution", (state) => nodes.finalExecution(state, databaseService, bundleId))

    // Define the flow (Edges)
    // Start -> Analyze Objective
    .addEdge("__start__", "analyzeObjective")

    // Analyze -> Retrieval
    .addEdge("analyzeObjective", "retrieval")

    // Conditional edge: Skip to fetchBlueprint if we already have confirmed files (re-pack scenario)
    .addConditionalEdges("retrieval", (state) => {
      if (state.confirmedFiles.length > 0) {
        return "fetchBlueprint"; // Skip directly to blueprint fetch
      }
      return "relevanceCheck"; // Continue with normal flow
    })

    // Relevance Check -> Fetch Blueprint
    .addEdge("relevanceCheck", "fetchBlueprint")

    // Fetch Blueprint -> Optimize Context (Semantic Folding)
    .addEdge("fetchBlueprint", "optimizeContext")

    // Optimize Context -> Generate Summary
    .addEdge("optimizeContext", "generateSummary")

    // Summary -> Generate Command
    .addEdge("generateSummary", "commandGeneration")

    // Generate -> Execute & Cleanup
    .addEdge("commandGeneration", "execution")

    // End
    .addEdge("execution", "__end__");

  return workflow.compile();
}