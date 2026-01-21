import { z } from "zod";
import { AgentState } from "./state";
import * as tools from "./tools";
import * as prompts from "./prompts";
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';
import { logger } from "../shared/logger";
import { DatabaseService, AgentRunHistory } from '../core/storage/databaseService';
import * as crypto from 'crypto';
import { embeddingService } from "../core/indexing/embeddingService";
import { VectorDbAdapter } from "../core/indexing/vectorDb/types";
import * as llmClient from "./llmClient";

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

// Node 1: Retrieval (RAG-based)
export async function retrieval(
  state: typeof AgentState.State,
  adapter: VectorDbAdapter,
  repoId: string
) {
  logger.both.info("Agent: Step 1 - Retrieving candidate files via RAG...");

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
    logger.both.info("Agent: Attempting RAG retrieval with embedding service...");

    // 1. Core query embedding
    const queryVector = await embeddingService.embedText(state.apiKey, state.userQuery);
    logger.both.info("Agent: Query embedding successful");

    // 2. Query Vector DB
    logger.both.info("Agent: Querying vector database...");
    const results = await adapter.queryVectors({
      repoId: repoId,
      vector: queryVector,
      topK: 50, // Retrieve top 50 chunks
    });

    const matches = results?.matches ?? [];
    logger.both.info(`Agent: Vector DB returned ${matches.length} matches`);

    // 3. Extract unique file paths
    const filePaths = new Set<string>();
    for (const m of matches) {
      const filePath = m.metadata?.filePath as string;
      if (filePath) {
        filePaths.add(filePath);
      }
    }

    const candidates = Array.from(filePaths);
    logger.both.info(`Agent: RAG retrieved ${candidates.length} unique candidate files.`);

    return { candidateFiles: candidates };
  } catch (error) {
    logger.both.error("Agent: RAG retrieval failed, falling back to basic file listing", error);

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

    // Filter based on confidence threshold
    const relevantFiles = result.files
      .filter(file => file.isRelevant && file.confidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD)
      .map(file => file.path);

    return { relevantFiles, tokens };
  } catch (error) {
    logger.both.error(`Agent: Error processing batch:`, error);
    return {
      relevantFiles: [],
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

    results.forEach((result, index) => {
      if (result.error) {
        errorCount++;
        logger.both.warn(`Agent: Batch ${index + 1} failed: ${result.error}`);
      } else {
        successCount++;
        confirmed.push(...result.relevantFiles);
        stepTokens += result.tokens;
      }
    });

    logger.both.info(`Agent: Batch processing complete - ${successCount} successful, ${errorCount} failed`);
  } catch (error) {
    logger.both.error("Agent: Parallel batch processing failed, falling back to sequential", error);
    return await fallbackSequentialProcessing(state, contentMap);
  }

  // Remove duplicates (possible when batches overlap in logic)
  const uniqueConfirmed = Array.from(new Set(confirmed));

  // Failsafe removed to ensure strict relevance filtering
  if (uniqueConfirmed.length === 0 && state.candidateFiles.length > 0) {
    logger.both.info("Agent: No relevant files found after deep analysis.");
    // Do NOT return fallback files. Return empty to signify no relevant files found.
    return { confirmedFiles: [], totalTokens: stepTokens };
  }

  logger.both.info(`Agent: Confirmed ${uniqueConfirmed.length} files as strictly relevant (used ${stepTokens.toLocaleString()} tokens).`);
  return { confirmedFiles: uniqueConfirmed, totalTokens: stepTokens };
}

// ============================================================================
// Fallback: Sequential processing for when parallel fails
// ============================================================================

async function fallbackSequentialProcessing(
  state: typeof AgentState.State,
  contentMap: Map<string, string>
): Promise<{ confirmedFiles: string[]; totalTokens: number }> {
  logger.both.info("Agent: Using fallback sequential processing...");

  const confirmed: string[] = [];

  const checkSchema = z.object({
    isRelevant: z.boolean().describe("True if the file is necessary to answer the user query")
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
    `;

    try {
      const { parsed: result, totalTokens: tokens } = await llmClient.generateStructured(
        state.apiKey,
        checkSchema,
        prompt,
        `CHECK ${filePath}`
      );

      stepTokens += tokens;

      if (result.isRelevant) {
        confirmed.push(filePath);
      }
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  return { confirmedFiles: confirmed, totalTokens: stepTokens };
}

// Node New: Generate Summary
export async function generateSummary(state: typeof AgentState.State) {
  if (state.confirmedFiles.length === 0) return {};

  logger.both.info("Agent: Generating markdown summary...");
  const summaryGenerator = await import('./summaryGenerator.js');

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

  // Execute the final command using the existing runner infrastructure
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
    // Don't throw error here as it shouldn't affect the main functionality
  }

  return {
    outputPath: outputPath
  };
}
