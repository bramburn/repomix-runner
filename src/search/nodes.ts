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
    console.log('[SEARCH_GRAPH] ===== validateInputsNode START =====');
    const start = Date.now();
    const errors: any[] = [];

    const q = (state.userQuery ?? '').trim();
    if (!q) {
        console.error('[SEARCH_GRAPH] User query is empty');
        errors.push({ node: 'validateInputs', error: 'User query is empty', ts: Date.now() });
    }

    if (!fs.existsSync(state.repoRoot)) {
        console.error('[SEARCH_GRAPH] Repo root does not exist:', state.repoRoot);
        errors.push({ node: 'validateInputs', error: 'Repo root does not exist', ts: Date.now() });
    }

    if (!state.googleApiKey) {
        console.error('[SEARCH_GRAPH] Google API key is missing');
        errors.push({ node: 'validateInputs', error: 'Google API key is required for search', ts: Date.now() });
    }

    console.log('[SEARCH_GRAPH] validateInputsNode: errors=', errors.length);
    console.log('[SEARCH_GRAPH] ===== validateInputsNode END (', Date.now() - start, 'ms) =====');
    return {
        errors,
        timings: { validateInputs: Date.now() - start }
    };
}

export async function expandQueryNode(state: SearchGraphState, context: any) {
    console.log('[SEARCH_GRAPH] ===== expandQueryNode START =====');
    console.log('[SEARCH_GRAPH] User query:', state.userQuery);
    console.log('[SEARCH_GRAPH] Smart filter enabled:', state.smartFilterEnabled);
    const start = Date.now();
    if (state.errors.length > 0) {
        console.log('[SEARCH_GRAPH] Skipping expandQueryNode due to previous errors');
        return {};
    }

    let expandedQueries = [state.userQuery];

    if (state.smartFilterEnabled && state.googleApiKey) {
        console.log('[SEARCH_GRAPH] Expanding query with LLM...');
        const queries = await getAllQueriesToSearch(state.userQuery, state.googleApiKey);
        expandedQueries = queries.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0);
        console.log('[SEARCH_GRAPH] Expanded queries:', expandedQueries);

        if (context) {
            console.log('[SEARCH_GRAPH] Sending expanded queries to webview...');
            context.postMessage({
                command: 'searchQueryExpanded',
                queries: expandedQueries,
            });
        }
    } else {
        console.log('[SEARCH_GRAPH] Using original query only (no expansion)');
    }

    console.log('[SEARCH_GRAPH] ===== expandQueryNode END (', Date.now() - start, 'ms) =====');
    return {
        expandedQueries,
        timings: { expandQuery: Date.now() - start }
    };
}

export async function vectorSearchNode(state: SearchGraphState, adapter: any) {
    console.log('[SEARCH_GRAPH] ===== vectorSearchNode START =====');
    console.log('[SEARCH_GRAPH] Expanded queries count:', state.expandedQueries?.length || 0);
    console.log('[SEARCH_GRAPH] Max results:', state.maxResults);
    const start = Date.now();
    if (state.errors.length > 0) {
        console.log('[SEARCH_GRAPH] Skipping vectorSearchNode due to previous errors');
        return {};
    }

    if (!state.googleApiKey || !adapter) {
        console.error('[SEARCH_GRAPH] Missing API key or adapter');
        return {
            errors: [{ node: 'vectorSearch', error: 'Missing API key or Vector DB adapter', ts: Date.now() }],
            timings: { vectorSearch: Date.now() - start }
        };
    }

    try {
        console.log('[SEARCH_GRAPH] Embedding queries...');
        const vectors = await Promise.all(
            state.expandedQueries.map((queryText) => embeddingService.embedText(queryText))
        );
        console.log('[SEARCH_GRAPH] Embeddings generated:', vectors.length);

        console.log('[SEARCH_GRAPH] Querying vector database...');
        console.log('[SEARCH_GRAPH] Vector DB details:', {
            repoId: state.repoId,
            topK: state.maxResults,
            vectorDimension: vectors[0]?.length || 0
        });
        
        const resList = await Promise.all(
            vectors.map((vector) =>
                adapter.queryVectors({
                    repoId: state.repoId,
                    vector,
                    topK: state.maxResults,
                })
            )
        );
        console.log('[SEARCH_GRAPH] Vector search results received:', resList.length);

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

        console.log('[SEARCH_GRAPH] Total vector hits:', vectorHits.length);
        console.log('[SEARCH_GRAPH] ===== vectorSearchNode END (', Date.now() - start, 'ms) =====');
        return {
            vectorHits,
            timings: { vectorSearch: Date.now() - start }
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[SEARCH_GRAPH] Vector search failed:', error);
        console.error('[SEARCH_GRAPH] Error type:', error instanceof Error ? error.constructor.name : typeof error);
        console.error('[SEARCH_GRAPH] Error stack:', error instanceof Error ? error.stack : 'N/A');
        
        // Provide more specific error messages based on error content
        let userFriendlyError = errorMessage;
        
        // Network/connectivity errors
        if (errorMessage.toLowerCase().includes('fetch failed') || 
            errorMessage.toLowerCase().includes('econnrefused') ||
            errorMessage.toLowerCase().includes('enotfound') ||
            errorMessage.toLowerCase().includes('etimedout')) {
            userFriendlyError = `Cannot connect to vector database. Please check:\n` +
                `1. Your internet connection\n` +
                `2. Vector DB URL is correct in Settings\n` +
                `3. Vector DB service is running\n` +
                `4. Firewall is not blocking the connection\n\n` +
                `Details: ${errorMessage}`;
        } 
        // Authentication errors
        else if (errorMessage.toLowerCase().includes('api key') || 
                 errorMessage.toLowerCase().includes('unauthorized') ||
                 errorMessage.toLowerCase().includes('401') ||
                 errorMessage.toLowerCase().includes('403')) {
            userFriendlyError = `Authentication failed. Please verify your API key in Settings.\nDetails: ${errorMessage}`;
        } 
        // Collection/index not found
        else if (errorMessage.toLowerCase().includes('not found') ||
                 errorMessage.toLowerCase().includes('404') ||
                 errorMessage.toLowerCase().includes('collection') ||
                 errorMessage.toLowerCase().includes('index')) {
            userFriendlyError = `Vector database collection/index not found. Please check Settings and ensure the collection exists.\nDetails: ${errorMessage}`;
        }
        // Embedding provider errors
        else if (errorMessage.toLowerCase().includes('embedding') ||
                 errorMessage.toLowerCase().includes('gemini') ||
                 errorMessage.toLowerCase().includes('ollama')) {
            userFriendlyError = `Embedding service error. Please check your embedding provider settings.\nDetails: ${errorMessage}`;
        }
        // Timeout errors
        else if (errorMessage.toLowerCase().includes('timeout')) {
            userFriendlyError = `Request timed out. The vector database may be slow or unresponsive.\nDetails: ${errorMessage}`;
        }
        
        console.error('[SEARCH_GRAPH] User-friendly error:', userFriendlyError);
        
        return {
            errors: [{ node: 'vectorSearch', error: userFriendlyError, ts: Date.now() }],
            timings: { vectorSearch: Date.now() - start }
        };
    }
}

export async function dedupeNode(state: SearchGraphState) {
    console.log('[SEARCH_GRAPH] ===== dedupeNode START =====');
    console.log('[SEARCH_GRAPH] Vector hits to dedupe:', state.vectorHits?.length || 0);
    const start = Date.now();
    if (state.errors.length > 0) {
        console.log('[SEARCH_GRAPH] Skipping dedupeNode due to previous errors');
        return {};
    }

    const bestByPath = new Map<string, RepoSearchResult>();

    for (const hit of state.vectorHits) {
        if (!hit.path) continue;
        const existing = bestByPath.get(hit.path);
        if (!existing || hit.score > existing.score) {
            bestByPath.set(hit.path, hit);
        }
    }

    const dedupedHits = Array.from(bestByPath.values()).sort((a, b) => b.score - a.score);

    console.log('[SEARCH_GRAPH] Deduped hits:', dedupedHits.length);
    console.log('[SEARCH_GRAPH] ===== dedupeNode END (', Date.now() - start, 'ms) =====');
    return {
        dedupedHits,
        timings: { dedupe: Date.now() - start }
    };
}

export async function rerankNode(state: SearchGraphState) {
    console.log('[SEARCH_GRAPH] ===== rerankNode START =====');
    console.log('[SEARCH_GRAPH] Deduped hits:', state.dedupedHits?.length || 0);
    console.log('[SEARCH_GRAPH] Smart filter enabled:', state.smartFilterEnabled);
    const start = Date.now();
    if (state.errors.length > 0) {
        console.log('[SEARCH_GRAPH] Skipping rerankNode due to previous errors');
        return {};
    }

    if (!state.smartFilterEnabled || state.dedupedHits.length === 0 || !state.googleApiKey) {
        console.log('[SEARCH_GRAPH] Skipping reranking, using deduped hits as-is');
        console.log('[SEARCH_GRAPH] ===== rerankNode END (', Date.now() - start, 'ms) =====');
        return {
            rerankedHits: state.dedupedHits,
            timings: { rerank: Date.now() - start }
        };
    }

    console.log('[SEARCH_GRAPH] Reranking with LLM...');
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

    console.log('[SEARCH_GRAPH] Reranked hits:', rerankedHits.length);
    console.log('[SEARCH_GRAPH] ===== rerankNode END (', Date.now() - start, 'ms) =====');
    return {
        rerankedHits,
        timings: { rerank: Date.now() - start }
    };
}

export async function finalizeNode(state: SearchGraphState) {
    console.log('[SEARCH_GRAPH] ===== finalizeNode START =====');
    console.log('[SEARCH_GRAPH] Reranked hits:', state.rerankedHits?.length || 0);
    const start = Date.now();
    if (state.errors.length > 0) {
        console.log('[SEARCH_GRAPH] Skipping finalizeNode due to previous errors');
        return {};
    }

    let finalHits = state.rerankedHits;

    // .gitignore filtering
    console.log('[SEARCH_GRAPH] Applying .gitignore filtering...');
    try {
        const ig = ignore();
        const gitignorePath = path.join(state.repoRoot, '.gitignore');

        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig.add(gitignoreContent);
            console.log('[SEARCH_GRAPH] Loaded .gitignore file');
        }

        ig.add(['.git', 'node_modules', '.DS_Store', 'dist', 'out', 'build']);

        finalHits = finalHits.filter((r) => {
            if (!r.path) return false;
            return !ig.ignores(r.path);
        });
        console.log('[SEARCH_GRAPH] After .gitignore filtering:', finalHits.length);
    } catch (filterErr) {
        console.warn('[SEARCH_GRAPH] Error filtering search results with .gitignore:', filterErr);
    }

    // Cap results
    console.log('[SEARCH_GRAPH] Capping results to maxResults:', state.maxResults);
    finalHits = finalHits.slice(0, state.maxResults);

    console.log('[SEARCH_GRAPH] Final hits count:', finalHits.length);
    console.log('[SEARCH_GRAPH] ===== finalizeNode END (', Date.now() - start, 'ms) =====');
    return {
        finalHits,
        timings: { finalize: Date.now() - start }
    };
}
