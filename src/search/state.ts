import { Annotation } from "@langchain/langgraph";
import { RepoSearchResult } from "../core/indexing/llmReranking.js";

/**
 * Defines the shared state for the Search graph.
 */
export const SearchGraphState = Annotation.Root({
    // Inputs
    repoId: Annotation<string>,
    repoRoot: Annotation<string>,
    userQuery: Annotation<string>,
    smartFilterEnabled: Annotation<boolean>,
    maxResults: Annotation<number>,
    googleApiKey: Annotation<string | undefined>,
    confidenceThreshold: Annotation<number | undefined>,

    // Derived / intermediate
    expandedQueries: Annotation<string[]>({
        reducer: (x, y) => (y ? y : x),
        default: () => [],
    }),
    vectorHits: Annotation<RepoSearchResult[]>({
        reducer: (x, y) => (y ? y : x),
        default: () => [],
    }),
    dedupedHits: Annotation<RepoSearchResult[]>({
        reducer: (x, y) => (y ? y : x),
        default: () => [],
    }),
    rerankedHits: Annotation<RepoSearchResult[]>({
        reducer: (x, y) => (y ? y : x),
        default: () => [],
    }),
    finalHits: Annotation<RepoSearchResult[]>({
        reducer: (x, y) => (y ? y : x),
        default: () => [],
    }),

    // Observability
    timings: Annotation<Record<string, number>>({
        reducer: (x, y) => ({ ...x, ...y }),
        default: () => ({}),
    }),
    logs: Annotation<Array<{ node: string; msg: string; ts: number }>>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    errors: Annotation<Array<{ node: string; error: string; ts: number }>>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    tokensUsed: Annotation<number>({
        reducer: (x, y) => x + y,
        default: () => 0,
    }),
});

export type SearchGraphState = typeof SearchGraphState.State;
