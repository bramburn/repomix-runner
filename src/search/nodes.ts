import { SearchGraphState } from "./state.js";
import { getAllQueriesToSearch } from "../core/indexing/queryExpansion.js";
import { RepoSearchResult } from "../core/indexing/llmReranking.js";
import { rerankResultsWithLLM } from "../core/indexing/llmReranking.js";
import { embeddingService } from "../core/indexing/embeddingService.js";
import { getVectorDbAdapterForRepo } from "../core/indexing/vectorDb/factory.js";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import ignore from 'ignore';

export async function validateInputsNode(state: SearchGraphState) {
    const start = Date.now();
    const errors: any[] = [];

    const q = (state.userQuery ?? '').trim();
    if (!q) {
        errors.push({ node: 'validateInputs', error: 'User query is empty', ts: Date.now() });
    }

    if (!fs.existsSync(state.repoRoot)) {
        errors.push({ node: 'validateInputs', error: 'Repo root does not exist', ts: Date.now() });
    }

    if (!state.googleApiKey) {
        errors.push({ node: 'validateInputs', error: 'Google API key is required for search', ts: Date.now() });
    }

    return {
        errors,
        timings: { validateInputs: Date.now() - start }
    };
}

export async function expandQueryNode(state: SearchGraphState, context: any) {
    const start = Date.now();
    if (state.errors.length > 0) return {};

    let expandedQueries = [state.userQuery];

    if (state.smartFilterEnabled && state.googleApiKey) {
        const queries = await getAllQueriesToSearch(state.userQuery, state.googleApiKey);
        expandedQueries = queries.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0);

        if (context) {
            context.postMessage({
                command: 'searchQueryExpanded',
                queries: expandedQueries,
            });
        }
    }

    return {
        expandedQueries,
        timings: { expandQuery: Date.now() - start }
    };
}

export async function vectorSearchNode(state: SearchGraphState, adapter: any) {
    const start = Date.now();
    if (state.errors.length > 0) return {};

    if (!state.googleApiKey || !adapter) {
        return {
            errors: [{ node: 'vectorSearch', error: 'Missing API key or Vector DB adapter', ts: Date.now() }],
            timings: { vectorSearch: Date.now() - start }
        };
    }

    const vectors = await Promise.all(
        state.expandedQueries.map((queryText) => embeddingService.embedText(queryText))
    );

    const resList = await Promise.all(
        vectors.map((vector) =>
            adapter.queryVectors({
                repoId: state.repoId,
                vector,
                topK: state.maxResults,
            })
        )
    );

    const vectorHits: RepoSearchResult[] = [];
    for (const res of resList) {
        const matches = res?.matches ?? [];
        for (const m of matches) {
            vectorHits.push({
                id: m.id,
                score: m.score ?? 0,
                path: m.metadata?.filePath as string,
                snippet: (m.metadata?.snippet ?? m.metadata?.text) as string | undefined,
            });
        }
    }

    return {
        vectorHits,
        timings: { vectorSearch: Date.now() - start }
    };
}

export async function dedupeNode(state: SearchGraphState) {
    const start = Date.now();
    if (state.errors.length > 0) return {};

    const bestByPath = new Map<string, RepoSearchResult>();

    for (const hit of state.vectorHits) {
        if (!hit.path) continue;
        const existing = bestByPath.get(hit.path);
        if (!existing || hit.score > existing.score) {
            bestByPath.set(hit.path, hit);
        }
    }

    const dedupedHits = Array.from(bestByPath.values()).sort((a, b) => b.score - a.score);

    return {
        dedupedHits,
        timings: { dedupe: Date.now() - start }
    };
}

export async function rerankNode(state: SearchGraphState) {
    const start = Date.now();
    if (state.errors.length > 0) return {};

    if (!state.smartFilterEnabled || state.dedupedHits.length === 0 || !state.googleApiKey) {
        return {
            rerankedHits: state.dedupedHits,
            timings: { rerank: Date.now() - start }
        };
    }

    const rerankedHits = await rerankResultsWithLLM(
        state.userQuery,
        state.dedupedHits,
        state.googleApiKey,
        state.repoRoot,
        {
            maxFiles: 10,
            confidenceThreshold: state.confidenceThreshold ?? 0.5,
            useFileContent: false,
        }
    );

    return {
        rerankedHits,
        timings: { rerank: Date.now() - start }
    };
}

export async function finalizeNode(state: SearchGraphState) {
    const start = Date.now();
    if (state.errors.length > 0) return {};

    let finalHits = state.rerankedHits;

    // .gitignore filtering
    try {
        const ig = ignore();
        const gitignorePath = path.join(state.repoRoot, '.gitignore');

        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig.add(gitignoreContent);
        }

        ig.add(['.git', 'node_modules', '.DS_Store', 'dist', 'out', 'build']);

        finalHits = finalHits.filter((r) => {
            if (!r.path) return false;
            return !ig.ignores(r.path);
        });
    } catch (filterErr) {
        console.warn('[SEARCH_GRAPH] Error filtering search results with .gitignore:', filterErr);
    }

    // Cap results
    finalHits = finalHits.slice(0, state.maxResults);

    return {
        finalHits,
        timings: { finalize: Date.now() - start }
    };
}
