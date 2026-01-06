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
    const graph = createSearchGraph(adapter, context);
    // @ts-ignore - LangGraph state types can be tricky
    const finalState = await graph.invoke(initialState);
    return finalState as SearchGraphState;
}
