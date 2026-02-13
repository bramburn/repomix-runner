import { z } from "zod";
import { AgentState, ProcessedFile } from "./state";
import * as tools from "./tools";
import * as prompts from "./prompts";
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';
import { logger } from "../shared/logger";
import { DatabaseService, AgentRunHistory, RepoBlueprint } from '../core/storage/databaseService';
import * as crypto from 'crypto';
import { embeddingService } from "../core/indexing/embeddingService";
import { VectorDbAdapter } from "../core/indexing/vectorDb/types";
import { getAllQueriesToSearch } from "../core/indexing/queryExpansion";
import * as llmClient from "./llmClient";
import { getBlueprintService } from "../fingerprint/blueprintService";
import { treeSitterService, TreeSitterService } from "../core/indexing/treeSitterService";
import { encode } from 'gpt-tokenizer';
import { GitService } from "../git/GitService";

// ============================================================================
// Caching Layer for LLM Responses
// ============================================================================

interface CacheEntry {
  result: any;
  timestamp: number;
}

class LLMResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate a cache key from query and content hash
   */
  private generateKey(query: string, content: string): string {
    const contentHash = crypto.createHash('md5').update(content).digest('hex');
    return `${query}:${contentHash}`;
  }

  /**
   * Get cached result or compute and cache
   */
  async getOrCompute(
    query: string,
    content: string,
    computeFn: () => Promise<any>
  ): Promise<any> {
    const key = this.generateKey(query, content);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.result;
    }

    const result = await computeFn();
    this.cache.set(key, { result, timestamp: Date.now() });
    return result;
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Global cache instance
const llmCache = new LLMResponseCache();

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
  // Batch processing settings
  BATCH_SIZE: 5,              // Files per LLM batch request
  MAX_CONCURRENT_BATCHES: 3,  // Maximum parallel batch requests (Kept for logical grouping, but queue handles actual rate limiting)

  // Content processing
  MAX_FILE_CONTENT_LENGTH: 15000,  // Reduced for batch processing (per file)
  MIN_CONFIDENCE_THRESHOLD: 0.6,   // Lowered from 0.7 for inclusiveness

  // Rate limiting
  RATE_LIMIT_DELAY_MS: 500,  // Delay between batch requests (Now handled by p-queue, but kept for legacy structure if needed explicitly)

  // Fallback thresholds
  FALLBACK_MIN_FILES: 5,     // Minimum files to return on fallback
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

// Helper to generate a unique 4-character ID
function generateShortId(): string {
  return Math.random().toString(36).substring(2, 6);
}

// Helper function to chunk arrays into smaller pieces
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Node 0: Analyze Objective
export async function analyzeObjective(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 0 - Analyzing user objective...");

  // This schema defines the structure of the expected output from the LLM,
  // ensuring it includes both the objective type and relevance criteria for the task.
  const schema = z.object({
    objectiveType: z.enum(['ACTION', 'SEARCH']).describe("Whether the user wants to perform a task/modify code (ACTION) or find info/understand (SEARCH)"),
    relevanceCriteria: z.string().describe("A strict checklist of what constitutes a 'relevant file' for this specific task")
  });

  const prompt = prompts.ANALYZE_OBJECTIVE_PROMPT(state.userQuery);

  try {
    const { parsed: result, totalTokens } = await llmClient.generateStructured(
      state.apiKey,
      schema,
      prompt,
      "Analyze Objective"
    );

    logger.both.info(`Agent: Objective classified as ${result.objectiveType}.`);
    logger.both.info(`Agent: Relevance Criteria: ${result.relevanceCriteria}`);

    return {
      objectiveType: result.objectiveType,
      relevanceCriteria: result.relevanceCriteria,
      totalTokens: totalTokens
    };
  } catch (error) {
    logger.both.error("Agent: Objective analysis failed", error);
    // Fallback values
    return {
      objectiveType: 'ACTION' as const,
      relevanceCriteria: "Select files relevant to the user's query.",
      totalTokens: 0
    };
  }
}

// Node 1: Retrieval (RAG-based with Multi-Query Expansion)
export async function retrieval(
  state: typeof AgentState.State,
  adapter: VectorDbAdapter,
  repoId: string
) {
  logger.both.info("Agent: Step 1 - Retrieving candidate files via RAG with multi-query expansion...");

  if (!state.apiKey || !adapter) {
    logger.both.warn("Agent: Missing API key or adapter, falling back to basic indexing.");
    try {
      const files = await tools.getWorkspaceFiles(state.workspaceRoot);
      return { candidateFiles: files.slice(0, 50) };
    } catch (fallbackError) {
      logger.both.error("Agent: Fallback file listing also failed", fallbackError);
      return { candidateFiles: [] };
    }
  }

  try {
    logger.both.info("Agent: Generating search queries with semantic expansion...");
    
    // 1. Expand Query (Multi-Query RAG)
    const queries = await getAllQueriesToSearch(state.userQuery, state.apiKey);
    logger.both.info(`Agent: Expanded to ${queries.length} queries: ${JSON.stringify(queries)}`);

    // 2. Embed all queries in parallel (using priority=true for user-facing latency)
    logger.both.info("Agent: Embedding all query variants...");
    const vectors = await Promise.all(
      queries.map(q => embeddingService.embedText(q, 'agent', true))
    );
    logger.both.info(`Agent: Generated ${vectors.length} embeddings`);

    // 3. Query Vector DB for each vector in parallel
    logger.both.info("Agent: Querying vector database for all variants...");
    const gitService = new GitService();
    const branchName = await gitService.getCurrentBranch(state.workspaceRoot);
    const resultsList = await Promise.all(
      vectors.map(vector => 
        adapter.queryVectors({
          repoId: repoId,
          vector: vector,
          topK: 30, // Slightly reduced topK per query since we run multiple
          branchName,
        })
      )
    );

    // 4. Merge and Deduplicate Results
    const filePaths = new Set<string>();
    let totalMatches = 0;
    let totalScore = 0;
    const fileScores = new Map<string, { count: number; totalScore: number }>();

    for (const results of resultsList) {
      const matches = results?.matches ?? [];
      totalMatches += matches.length;
      
      for (const m of matches) {
        const filePath = m.metadata?.filePath as string;
        const score = m.score ?? 0;
        totalScore += score;
        
        if (filePath) {
          filePaths.add(filePath);
          
          // Track scoring statistics for potential ranking
          const current = fileScores.get(filePath) || { count: 0, totalScore: 0 };
          fileScores.set(filePath, {
            count: current.count + 1,
            totalScore: current.totalScore + score
          });
        }
      }
    }

    const candidates = Array.from(filePaths);
    const avgScore = totalMatches > 0 ? totalScore / totalMatches : 0;
    
    logger.both.info(
      `Agent: RAG retrieved ${totalMatches} raw matches across ${queries.length} queries, ` +
      `reduced to ${candidates.length} unique files (avg score: ${avgScore.toFixed(3)}).`
    );

    // Optional: Log top files by frequency/score for debugging
    const sortedFiles = Array.from(fileScores.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].totalScore - a[1].totalScore)
      .slice(0, 5);
    
    if (sortedFiles.length > 0) {
      logger.both.info(
        `Agent: Top files by frequency: ${sortedFiles.map(([fp, stats]) => 
          `${path.basename(fp)}(${stats.count}/${queries.length})`
        ).join(', ')}`
      );
    }

    return { candidateFiles: candidates };
  } catch (error) {
    logger.both.error("Agent: Multi-query RAG retrieval failed, falling back to basic file listing", error);

    // CRITICAL: Fallback to local FS call only - no network calls
    try {
      const files = await tools.getWorkspaceFiles(state.workspaceRoot);
      logger.both.info(`Agent: Fallback retrieved ${files.length} files from workspace`);
      return { candidateFiles: files.slice(0, 50) };
    } catch (fallbackError) {
      logger.both.error("Agent: Fallback file listing also failed", fallbackError);
      // Last resort: return empty array to allow workflow to continue
      return { candidateFiles: [] };
    }
  }
}

// Node 2: Structure Extraction (combined with Node 1)
export async function structureExtraction(state: typeof AgentState.State) {
  logger.both.info(`Agent: Step 2 - Found ${state.allFilePaths.length} files in repository.`);
  // No additional work needed since we already have the file list from Node 1
  return {};
}

// Node 3: Initial Filtering (Fast Pass)
export async function initialFiltering(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 3 - Filtering candidate files...");

  // Define the structured output schema
  const schema = z.object({
    candidates: z.array(z.string()).describe("List of relevant file paths found in the repository")
  });

  // Chunk the files to avoid token limits (JSON truncation) with large repos
  const CHUNK_SIZE = 600;
  const fileChunks = chunkArray(state.allFilePaths, CHUNK_SIZE);

  const allCandidates: string[] = [];
  let totalTokens = 0;

  try {
    // Process chunks sequentially to be safe with rate limits
    // Note: Implicit sequential execution here, but llmClient queue ensures it anyway.
    for (const chunk of fileChunks) {
      const structureContext = chunk.join('\n');

      const prompt = `
        You are an expert software engineer assistant.
        The user wants to package specific parts of a codebase into a single file.

        User Query: "${state.userQuery}"

        Below is a subset of files from the repository:
        ---
        ${structureContext}
        ---

        Task: Select all file paths from the list above that appear relevant to the user's query based on their names and directory location.
        Be generous in this step; include any file that MIGHT be relevant.
        Do not hallucinate paths. Only select from the provided list.
      `;

      try {
        const { parsed: result, totalTokens: tokens } = await llmClient.generateStructured(
          state.apiKey,
          schema,
          prompt,
          "Initial Filtering Chunk"
        );

        if (result && result.candidates) {
          allCandidates.push(...result.candidates);
        }
        totalTokens += tokens;
      } catch (chunkError) {
        logger.both.warn("Agent: Error processing a file chunk, skipping...", chunkError);
        // Continue to next chunk even if one fails
      }
    }

    logger.both.info(`Agent: Selected ${allCandidates.length} candidate files for deep analysis.`);

    // Ensure we don't return empty candidates if there are files available
    if (allCandidates.length === 0 && state.allFilePaths.length > 0) {
      logger.both.warn("Agent: No candidates selected, applying failsafe to select some files");

      const fallbackCandidates = state.allFilePaths.filter(file =>
        file.includes('src') ||
        file.includes('lib') ||
        file.includes('app') ||
        file.match(/\.(ts|js|tsx|jsx|py|java|cs|cpp|c|go|rs|php)$/)
      ).slice(0, 20);

      return { candidateFiles: fallbackCandidates, totalTokens: totalTokens };
    }

    return { candidateFiles: allCandidates, totalTokens: totalTokens };

  } catch (error) {
    logger.both.error("Agent: Filtering failed", error);

    vscode.window.showWarningMessage(`Agent filtering failed (${error instanceof Error ? error.message : 'Unknown'}), using fallback file list.`);

    if (state.allFilePaths.length > 0) {
      const fallbackCandidates = state.allFilePaths.filter(file =>
        file.match(/\.(ts|js|tsx|jsx|py|java|cs|cpp|c|go|rs|php)$/)
      ).slice(0, 20);
      return { candidateFiles: fallbackCandidates, totalTokens: 0 };
    }
    return { candidateFiles: [], totalTokens: 0 };
  }
}

// ============================================================================
// Helper: Build batch prompt for multiple files
// ============================================================================

function buildBatchPrompt(
  files: string[],
  contentMap: Map<string, string>,
  query: string,
  objectiveType: 'ACTION' | 'SEARCH' | undefined,
  relevanceCriteria: string | undefined
): string {
  const fileEntries = files.map((filePath, index) => {
    const content = contentMap.get(filePath) || '';
    const snippet = content.slice(0, CONFIG.MAX_FILE_CONTENT_LENGTH);
    return `
File ${index + 1}: ${filePath}
---
${snippet}
---`;
  }).join('\n\n');

  const criteria = relevanceCriteria || 'Evaluate relevance based on query.';

  if (objectiveType === 'ACTION') {
    return prompts.ACTION_RELEVANCE_PROMPT(query, criteria, fileEntries);
  } else {
    // Default to SEARCH logic if undefined or explicit SEARCH
    return prompts.SEARCH_RELEVANCE_PROMPT(query, criteria, fileEntries);
  }
}

// ============================================================================
// Helper: Process a batch of files with LLM
// ============================================================================

interface BatchFileResult {
  path: string;
  isRelevant: boolean;
  confidence: number;
}

interface BatchProcessResult {
  relevantFiles: string[];
  fileScores: Record<string, number>;
  tokens: number;
  error?: string;
}

async function processBatch(
  batch: string[],
  contentMap: Map<string, string>,
  query: string,
  apiKey: string,
  objectiveType: 'ACTION' | 'SEARCH' | undefined,
  relevanceCriteria: string | undefined
): Promise<BatchProcessResult> {
  const batchSchema = z.object({
    files: z.array(z.object({
      path: z.string(),
      isRelevant: z.boolean(),
      confidence: z.number().min(0).max(1)
    }))
  });

  try {
    // Check cache first
    const batchContent = batch.map(f => contentMap.get(f) || '').join('|||');
    const cacheResult = await llmCache.getOrCompute(
      query,
      batchContent,
      async () => {
        const prompt = buildBatchPrompt(batch, contentMap, query, objectiveType, relevanceCriteria);
        // Note: We return the full LLM response object to cache it, just like before,
        // but now we construct a mock object or change how we cache.
        // Actually, let's cache the structural result to be cleaner, but the cache keys off raw content.
        // The previous code cached the `invoke` response.

        // Use the new client to get parsed result
        const { parsed, totalTokens } = await llmClient.generateStructured(
          apiKey,
          batchSchema,
          prompt,
          "Process Batch"
        );

        return { parsed, totalTokens };
      }
    );

    const result = cacheResult.parsed as { files: BatchFileResult[] };
    const tokens = cacheResult.totalTokens || 0;

    // Filter based on confidence threshold and collect scores
    const relevantFiles: string[] = [];
    const fileScores: Record<string, number> = {};
    
    for (const file of result.files) {
      fileScores[file.path] = file.confidence;
      if (file.isRelevant && file.confidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD) {
        relevantFiles.push(file.path);
      }
    }

    return { relevantFiles, fileScores, tokens };
  } catch (error) {
    logger.both.error(`Agent: Error processing batch:`, error);
    return {
      relevantFiles: [],
      fileScores: {},
      tokens: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============================================================================
// Helper: Process batches with controlled concurrency
// ============================================================================

async function processBatchesWithConcurrency(
  batches: string[][],
  contentMap: Map<string, string>,
  query: string,
  apiKey: string,
  objectiveType: 'ACTION' | 'SEARCH' | undefined,
  relevanceCriteria: string | undefined
): Promise<BatchProcessResult[]> {
  // We can just map all batches to promises. The underlying p-queue in llmClient
  // will handle the rate limiting (concurrency: 1, RPM cap).
  // We don't need manual rate limiting logic here anymore.

  const promises = batches.map(async (batch, index) => {
    try {
      return await processBatch(batch, contentMap, query, apiKey, objectiveType, relevanceCriteria);
    } catch (error) {
      return {
        relevantFiles: [],
        tokens: 0,
        fileScores: {},
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  return Promise.all(promises);
}

// ============================================================================
// Node 4: Relevance Confirmation (Deep Analysis with Parallel Batching)
// ============================================================================

export async function relevanceConfirmation(state: typeof AgentState.State) {
  const count = state.candidateFiles.length;
  logger.both.info(`Agent: Step 4 - Analyzing content of ${count} files using parallel batch processing...`);

  if (count === 0) {
    return { confirmedFiles: [] };
  }

  // Clear expired cache entries periodically
  llmCache.clearExpired();

  // Bulk fetch content using our optimized tool
  const contentMap = await tools.getFileContents(state.workspaceRoot, state.candidateFiles);

  const confirmed: string[] = [];
  let stepTokens = 0;

  try {
    // Create batches of files to process in parallel
    const batches = chunkArray(state.candidateFiles, CONFIG.BATCH_SIZE);
    logger.both.info(`Agent: Processing ${batches.length} batches (${CONFIG.BATCH_SIZE} files per batch)...`);

    // Process batches with controlled concurrency (handled by queue)
    const results = await processBatchesWithConcurrency(
      batches,
      contentMap,
      state.userQuery,
      state.apiKey,
      state.objectiveType,
      state.relevanceCriteria
    );

    // Aggregate results
    let successCount = 0;
    let errorCount = 0;
    const allFileScores: Record<string, number> = {};

    results.forEach((result, index) => {
      if (result.error) {
        errorCount++;
        logger.both.warn(`Agent: Batch ${index + 1} failed: ${result.error}`);
      } else {
        successCount++;
        confirmed.push(...result.relevantFiles);
        stepTokens += result.tokens;
        // Merge file scores
        Object.assign(allFileScores, result.fileScores);
      }
    });

    logger.both.info(`Agent: Batch processing complete - ${successCount} successful, ${errorCount} failed`);
    
    // Remove duplicates (possible when batches overlap in logic)
    const uniqueConfirmed = Array.from(new Set(confirmed));

    // Failsafe removed to ensure strict relevance filtering
    if (uniqueConfirmed.length === 0 && state.candidateFiles.length > 0) {
      logger.both.info("Agent: No relevant files found after deep analysis.");
      return { confirmedFiles: [], fileRelevanceScores: allFileScores, totalTokens: stepTokens };
    }

    logger.both.info(`Agent: Confirmed ${uniqueConfirmed.length} files as strictly relevant (used ${stepTokens.toLocaleString()} tokens).`);
    return { confirmedFiles: uniqueConfirmed, fileRelevanceScores: allFileScores, totalTokens: stepTokens };
  } catch (error) {
    logger.both.error("Agent: Parallel batch processing failed, falling back to sequential", error);
    return await fallbackSequentialProcessing(state, contentMap);
  }
}

// ============================================================================
// Fallback: Sequential processing for when parallel fails
// ============================================================================

async function fallbackSequentialProcessing(
  state: typeof AgentState.State,
  contentMap: Map<string, string>
): Promise<{ confirmedFiles: string[]; fileRelevanceScores: Record<string, number>; totalTokens: number }> {
  logger.both.info("Agent: Using fallback sequential processing...");

  const confirmed: string[] = [];
  const fileScores: Record<string, number> = {};

  const checkSchema = z.object({
    isRelevant: z.boolean().describe("True if the file is necessary to answer the user query"),
    confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1")
  });

  let stepTokens = 0;

  for (const filePath of state.candidateFiles) {
    const content = contentMap.get(filePath);

    if (!content) {
      logger.both.warn(`Agent: Could not find content for ${filePath}`);
      continue;
    }

    const snippet = content.slice(0, 30000);

    const prompt = `
      User Query: "${state.userQuery}"
      File Path: "${filePath}"

      File Content (Snippet):
      ---
      ${snippet}
      ---

      Based on the content, is this file strictly necessary to fulfill the user's request?
      Return true only if it contains logic, definitions, or data relevant to "${state.userQuery}".
      Also provide a confidence score between 0 and 1.
    `;

    try {
      const { parsed: result, totalTokens: tokens } = await llmClient.generateStructured(
        state.apiKey,
        checkSchema,
        prompt,
        `CHECK ${filePath}`
      );

      stepTokens += tokens;
      fileScores[filePath] = result.confidence;

      if (result.isRelevant && result.confidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD) {
        confirmed.push(filePath);
      }
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  return { confirmedFiles: confirmed, fileRelevanceScores: fileScores, totalTokens: stepTokens };
}

// Node New: Generate Summary
export async function generateSummary(state: typeof AgentState.State) {
  // Debug logging to trace state
  logger.both.info(`Agent: generateSummary - confirmedFiles: ${state.confirmedFiles?.length || 0}, processedFiles: ${state.processedFiles?.length || 0}`);
  
  // Skip if no files to process
  if ((!state.confirmedFiles || state.confirmedFiles.length === 0) && (!state.processedFiles || state.processedFiles.length === 0)) {
    logger.both.warn("Agent: No files to summarize");
    return {};
  }

  logger.both.info("Agent: Generating markdown summary...");
  const summaryGenerator = await import('./summaryGenerator.js');

  // Use structured summary if we have processed files with compression tiers
  
  if (state.processedFiles && state.processedFiles.length > 0) {
    logger.both.info(`Agent: Using structured output with semantic folding (${state.processedFiles.length} files)...`);
    
    const result = await summaryGenerator.generateStructuredSummary(
      state.apiKey,
      state.userQuery,
      state.processedFiles,
      state.blueprintSummary || '',
      state.workspaceRoot
    );

    return {
      summaryPath: result.summaryPath,
      confirmedFiles: result.summaryPath ? [...state.confirmedFiles, result.summaryPath] : state.confirmedFiles,
      totalTokens: result.totalTokens
    };
  }

  // Fallback to original summary generation (for backward compatibility)
  logger.both.info("Agent: Falling back to legacy summary generation (processedFiles empty)");
  const result = await summaryGenerator.generateMarkdownSummary(
    state.apiKey,
    state.userQuery,
    state.confirmedFiles,
    state.workspaceRoot
  );

  return {
    summaryPath: result.summaryPath,
    confirmedFiles: result.summaryPath ? [...state.confirmedFiles, result.summaryPath] : state.confirmedFiles,
    totalTokens: result.totalTokens
  };
}

// ============================================================================
// Semantic Folding Nodes
// ============================================================================

/**
 * Estimate token count for a string
 */
function estimateTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    // Fallback: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Generate a blueprint summary string from a RepoBlueprint
 */
function generateBlueprintSummaryText(blueprint: RepoBlueprint): string {
  const parts: string[] = [];

  // Package info
  if (blueprint.packageInfo) {
    const pkg = blueprint.packageInfo;
    if (pkg.framework) {
      parts.push(`Framework: ${pkg.framework}`);
    }
    if (pkg.language) {
      parts.push(`Language: ${pkg.language}`);
    }
  }

  // Architectural patterns
  if (blueprint.architecturalPatterns) {
    const patterns = blueprint.architecturalPatterns;
    const patternParts: string[] = [];
    
    if (patterns.namingConventions) {
      patternParts.push(`Naming: ${patterns.namingConventions}`);
    }
    if (patterns.stateManagement) {
      patternParts.push(`State: ${patterns.stateManagement}`);
    }
    if (patterns.dataFetching) {
      patternParts.push(`Data Fetching: ${patterns.dataFetching}`);
    }
    if (patterns.apiConventions) {
      patternParts.push(`API: ${patterns.apiConventions}`);
    }
    
    if (patternParts.length > 0) {
      parts.push(`Patterns: ${patternParts.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No architectural blueprint available.';
}

/**
 * Node: Fetch Blueprint
 * Retrieves architectural context from the repository blueprint.
 */
export async function fetchBlueprint(state: typeof AgentState.State) {
  logger.both.info("Agent: Fetching repository blueprint...");

  try {
    const blueprintService = getBlueprintService();
    
    if (!blueprintService) {
      logger.both.warn("Agent: Blueprint service not available");
      return { blueprintSummary: '', totalTokens: 0 };
    }

    // Get valid blueprint from the service
    const blueprint = await blueprintService.getValidBlueprint(
      state.workspaceRoot,
      state.workspaceRoot
    );

    if (!blueprint) {
      logger.both.info("Agent: No valid blueprint found, continuing without architectural context");
      return { blueprintSummary: '', totalTokens: 0 };
    }

    // Generate summary text from blueprint
    const summary = generateBlueprintSummaryText(blueprint);
    logger.both.info(`Agent: Blueprint summary generated (${summary.length} chars)`);

    return { 
      blueprintSummary: summary,
      totalTokens: 0 // No LLM calls needed
    };
  } catch (error) {
    logger.both.warn("Agent: Failed to fetch blueprint, continuing without architectural context", error);
    return { blueprintSummary: '', totalTokens: 0 };
  }
}

/**
 * Node: Optimize Context
 * Assigns compression tiers to files based on relevance and token budget.
 * 
 * Tier A (Full): High relevance files, full source code
 * Tier B (Skeleton): Medium relevance files, AST skeletons only
 * Tier C (Summary): Low relevance files, LLM-generated 2-3 sentence summaries
 */
export async function optimizeContext(state: typeof AgentState.State) {
  const fileCount = state.confirmedFiles.length;
  const budget = state.tokenBudget || 50000;
  
  logger.both.info(`Agent: Optimizing context for ${fileCount} files with ${budget} token budget...`);

  if (fileCount === 0) {
    return { processedFiles: [], totalTokens: 0 };
  }

  // Budget allocation percentages
  const TIER_A_BUDGET = budget * 0.70;  // 70% for full code
  const TIER_B_BUDGET = budget * 0.20;  // 20% for skeletons
  // Remaining 10% for summaries

  // Get file contents
  const contentMap = await tools.getFileContents(state.workspaceRoot, state.confirmedFiles);

  // Calculate tokens and relevance for each file
  interface FileMetadata {
    path: string;
    content: string;
    tokens: number;
    relevanceScore: number;
  }

  const filesWithMetadata: FileMetadata[] = [];
  
  for (const filePath of state.confirmedFiles) {
    const content = contentMap.get(filePath) || '';
    const tokens = estimateTokens(content);
    
    // Get relevance score from state if available, otherwise default to 0.7
    const relevanceScore = state.fileRelevanceScores?.[filePath] ?? 0.7;
    
    filesWithMetadata.push({
      path: filePath,
      content,
      tokens,
      relevanceScore
    });
  }

  // Sort by relevance score (descending) - but since scores are likely all the same,
  // the original order from relevanceCheck is preserved (already ranked by LLM confidence)
  filesWithMetadata.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Assign tiers based on budget (all confirmed files are considered relevant)
  // Tier A: Full content - fills up to 70% of budget
  // Tier B: Skeleton - fills up to 90% of budget (next 20%)
  // Tier C: Summary - remaining files
  const tierA: FileMetadata[] = [];
  const tierB: FileMetadata[] = [];
  const tierC: FileMetadata[] = [];
  
  let tierATokens = 0;
  let tierBTokens = 0;

  for (const file of filesWithMetadata) {
    // First try to fit in Tier A (full content)
    if (tierATokens + file.tokens <= TIER_A_BUDGET) {
      tierA.push(file);
      tierATokens += file.tokens;
    }
    // Then try Tier B (skeleton - estimated at ~15% of original tokens)
    else {
      const skeletonTokensEstimate = Math.max(100, Math.ceil(file.tokens * 0.15));
      
      if (tierBTokens + skeletonTokensEstimate <= TIER_B_BUDGET) {
        tierB.push(file);
        tierBTokens += skeletonTokensEstimate;
      } else {
        // Overflow to Tier C (summary only)
        tierC.push(file);
      }
    }
  }

  logger.both.info(`Agent: Tier assignment - A:${tierA.length} (full), B:${tierB.length} (skeleton), C:${tierC.length} (summary)`);

  // Process files according to their tiers
  const processedFiles: ProcessedFile[] = [];
  let totalTokensUsed = 0;

  // Process Tier A (Full content)
  for (const file of tierA) {
    processedFiles.push({
      path: file.path,
      content: file.content,
      compressionLevel: 'full',
      tokens: file.tokens,
      relevanceScore: file.relevanceScore
    });
    totalTokensUsed += file.tokens;
  }

  // Process Tier B (Skeletons)
  // Initialize tree-sitter service
  try {
    // WASM files are copied to dist/tree-sitter-wasm/ during build
    // __dirname at runtime is the dist/ folder
    treeSitterService.setWasmDirectory(
      path.join(__dirname, 'tree-sitter-wasm')
    );
    await treeSitterService.initialize();
  } catch (error) {
    logger.both.warn("Agent: Failed to initialize tree-sitter, Tier B files will use full content", error);
  }

  for (const file of tierB) {
    const language = TreeSitterService.detectLanguage(file.path);
    let processedContent = file.content;
    let actualTokens = file.tokens;
    
    if (language && TreeSitterService.isLanguageSupported(language)) {
      try {
        const skeleton = await treeSitterService.generateSkeleton(file.content, language);
        processedContent = skeleton;
        actualTokens = estimateTokens(skeleton);
      } catch (error) {
        logger.both.warn(`Agent: Failed to generate skeleton for ${file.path}, using full content`, error);
      }
    }
    
    processedFiles.push({
      path: file.path,
      content: processedContent,
      compressionLevel: 'skeleton',
      tokens: actualTokens,
      relevanceScore: file.relevanceScore
    });
    totalTokensUsed += actualTokens;
  }

  // Process Tier C (Summaries)
  let summaryTokens = 0;
  for (const file of tierC) {
    try {
      const summary = await generateFileSummary(state.apiKey, file.path, file.content);
      const summaryContent = `// File: ${file.path}\n// Summary: ${summary}`;
      const tokens = estimateTokens(summaryContent);
      
      processedFiles.push({
        path: file.path,
        content: summaryContent,
        compressionLevel: 'summary',
        tokens,
        relevanceScore: file.relevanceScore
      });
      totalTokensUsed += tokens;
      summaryTokens += 150; // Approximate tokens per summary call
    } catch (error) {
      logger.both.warn(`Agent: Failed to generate summary for ${file.path}`, error);
      // Fall back to a minimal entry
      const fallbackContent = `// File: ${file.path}\n// Summary: File content not summarized.`;
      processedFiles.push({
        path: file.path,
        content: fallbackContent,
        compressionLevel: 'summary',
        tokens: estimateTokens(fallbackContent),
        relevanceScore: file.relevanceScore
      });
    }
  }

  logger.both.info(`Agent: Context optimization complete - ${totalTokensUsed} tokens used, ${processedFiles.length} files processed`);

  return {
    processedFiles,
    totalTokens: summaryTokens // Only count LLM tokens from summary generation
  };
}

/**
 * Generate a 2-3 sentence summary of a file using LLM
 */
async function generateFileSummary(apiKey: string, filePath: string, content: string): Promise<string> {
  const schema = z.object({
    summary: z.string().describe("2-3 sentence summary of the file's purpose and key functionality")
  });

  // Truncate content for efficiency
  const truncatedContent = content.slice(0, 4000);

  const prompt = `
Summarize this source file in 2-3 concise sentences.
Focus on:
- Primary purpose/functionality
- Key exports (functions, classes, types)
- Main dependencies or integrations

File: ${filePath}

Content:
---
${truncatedContent}
---

Provide a clear, technical summary.
`;

  try {
    const { parsed } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      `Summary: ${path.basename(filePath)}`
    );
    return parsed.summary;
  } catch (error) {
    logger.both.warn(`Agent: Failed to generate summary for ${filePath}`, error);
    return 'Summary not available.';
  }
}

// Node 5: Command Generation
export async function commandGeneration(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 5 - Generating final command...");

  // If explicit false, skip generation
  if (state.generateFile === false) {
    logger.both.info("Agent: generateFile is false, skipping command generation.");
    return { finalCommand: "", outputPath: undefined };
  }

  if (state.confirmedFiles.length === 0) {
    logger.both.warn("Agent: No relevant files found. Skipping execution.");
    return { finalCommand: "", outputPath: undefined };
  }

  // If we have processedFiles from semantic folding, skip repomix CLI
  // The structured markdown is already created by generateSummary node
  if (state.processedFiles && state.processedFiles.length > 0 && state.summaryPath) {
    logger.both.info("Agent: Semantic folding enabled - using structured markdown as output.");
    return {
      finalCommand: "", // No CLI command needed
      outputPath: state.summaryPath // Use the structured markdown as output
    };
  }

  // Generate unique 4-char ID for this run
  const uniqueId = generateShortId();

  // Create output filename with unique ID
  const outputPath = `repomix-output.${uniqueId}.xml`;

  // Escape paths for safety (basic quoting)
  const includeFlag = state.confirmedFiles
    .map(f => `"${f}"`)
    .join(",");

  // Construct the CLI command using repomix with --include and --output flags
  const command = `npx repomix --include ${includeFlag} --output ${outputPath}`;

  return {
    finalCommand: command,
    outputPath: outputPath
  };
}

// Node 6: Final Execution (Cleanup & Run)
export async function finalExecution(
  state: typeof AgentState.State,
  databaseService: DatabaseService,
  bundleId?: string
): Promise<Partial<typeof AgentState.State>> {
  logger.both.info("Agent: Step 6 - Executing final run...");

  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const outputPath = state.outputPath;
  let success = false;
  let error: string | undefined;

  // Case 1: Semantic folding - output already exists (structured markdown)
  if (!state.finalCommand && outputPath && state.processedFiles && state.processedFiles.length > 0) {
    success = true;
    const tierA = state.processedFiles.filter(f => f.compressionLevel === 'full').length;
    const tierB = state.processedFiles.filter(f => f.compressionLevel === 'skeleton').length;
    const tierC = state.processedFiles.filter(f => f.compressionLevel === 'summary').length;
    
    vscode.window.showInformationMessage(
      `Agent packaged ${state.processedFiles.length} files (Full: ${tierA}, Skeleton: ${tierB}, Summary: ${tierC})`
    );
    logger.both.info(`Agent: Semantic folding complete - output at ${outputPath}`);

    // Save successful run to database
    const runHistory: AgentRunHistory = {
      id: runId,
      timestamp: startTime,
      query: state.userQuery,
      files: state.confirmedFiles,
      fileCount: state.confirmedFiles.length,
      outputPath: outputPath,
      success: true,
      duration: Date.now() - startTime,
      bundleId
    };

    try {
      await databaseService.saveAgentRun(runHistory);
      logger.both.info(`Agent run saved to database: ${runId} (success - semantic folding)`);
    } catch (dbError) {
      logger.both.error("Failed to save agent run to database:", dbError);
    }

    return { outputPath };
  }

  // Case 2: No command and no semantic folding output
  if (!state.finalCommand) {
    // If generation was intentionally skipped but we have files, treat as success
    if (state.generateFile === false && state.confirmedFiles && state.confirmedFiles.length > 0) {
      success = true;
      vscode.window.showInformationMessage(`Agent found ${state.confirmedFiles.length} relevant files.`);
    } else {
      const errorMessage = "Repomix Agent: No relevant files found for your query.";
      vscode.window.showWarningMessage(errorMessage);
      error = errorMessage;
    }

    // Save failed run to database
    const runHistory: AgentRunHistory = {
      id: runId,
      timestamp: startTime,
      query: state.userQuery,
      files: state.confirmedFiles,
      fileCount: state.confirmedFiles.length,
      outputPath: outputPath,
      success: false,
      error: error,
      duration: Date.now() - startTime,
      bundleId
    };

    try {
      await databaseService.saveAgentRun(runHistory);
    } catch (dbError) {
      logger.both.error("Failed to save failed agent run to database:", dbError);
    }

    return { outputPath: undefined };
  }

  // Case 3: Execute repomix CLI command (legacy path)
  try {
    await execPromisify(state.finalCommand, { cwd: state.workspaceRoot });
    success = true;
    vscode.window.showInformationMessage(`Agent successfully packaged ${state.confirmedFiles.length} files!`);
  } catch (executionError) {
    error = executionError instanceof Error ? executionError.message : String(executionError);
    logger.both.error("Agent: Failed to execute final command", executionError);
    vscode.window.showErrorMessage(`Repomix Agent failed to execute: ${error}`);
  }

  const duration = Date.now() - startTime;

  // Save run to database
  const runHistory: AgentRunHistory = {
    id: runId,
    timestamp: startTime,
    query: state.userQuery,
    files: state.confirmedFiles,
    fileCount: state.confirmedFiles.length,
    outputPath: outputPath,
    success: success,
    error: error,
    duration: duration,
    bundleId
  };

  try {
    await databaseService.saveAgentRun(runHistory);
    logger.both.info(`Agent run saved to database: ${runId} (${success ? 'success' : 'failed'})`);
  } catch (dbError) {
    logger.both.error("Failed to save agent run to database:", dbError);
  }

  return {
    outputPath: outputPath
  };
}
