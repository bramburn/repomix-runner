import { StateGraph } from "@langchain/langgraph";
import { SearchGraphState } from "./state.js";
import * as nodes from "./nodes.js";

export function createSearchGraph(adapter: any, context: any) {
    const workflow = new StateGraph(SearchGraphState)
        .addNode("validateInputs", nodes.validateInputsNode)
        .addNode("expandQuery", (state) => nodes.expandQueryNode(state, context))
        .addNode("vectorSearch", (state) => nodes.vectorSearchNode(state, adapter))
        .addNode("dedupe", nodes.dedupeNode)
        .addNode("rerank", nodes.rerankNode)
        .addNode("finalize", nodes.finalizeNode)

        .addEdge("__start__", "validateInputs")
        .addConditionalEdges("validateInputs", (state) => {
            return state.errors.length > 0 ? "__end__" : "expandQuery";
        })
        .addEdge("expandQuery", "vectorSearch")
        .addConditionalEdges("vectorSearch", (state) => {
            return state.errors.length > 0 ? "__end__" : "dedupe";
        })
        .addEdge("dedupe", "rerank")
        .addEdge("rerank", "finalize")
        .addEdge("finalize", "__end__");

    return workflow.compile();
}

/**
 * Executor for the Search graph.
 */
export async function runSearchGraph(initialState: Partial<SearchGraphState>, adapter: any, context: any): Promise<SearchGraphState> {
    console.log('[SEARCH_GRAPH] ===== runSearchGraph START =====');
    console.log('[SEARCH_GRAPH] Initial state:', {
        userQuery: initialState.userQuery,
        maxResults: initialState.maxResults,
        smartFilterEnabled: initialState.smartFilterEnabled,
        confidenceThreshold: initialState.confidenceThreshold,
    });
    
    console.log('[SEARCH_GRAPH] Creating search graph...');
    const graph = createSearchGraph(adapter, context);
    console.log('[SEARCH_GRAPH] Graph created, invoking...');
    
    // @ts-ignore - LangGraph state types can be tricky
    const finalState = await graph.invoke(initialState);
    
    console.log('[SEARCH_GRAPH] Graph execution completed');
    console.log('[SEARCH_GRAPH] Final state errors:', finalState.errors?.length || 0);
    console.log('[SEARCH_GRAPH] Final state hits:', finalState.finalHits?.length || 0);
    console.log('[SEARCH_GRAPH] ===== runSearchGraph END =====');
    
    return finalState as SearchGraphState;
}
