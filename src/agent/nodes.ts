import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AgentState } from "./state";
import * as tools from "./tools";
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';
import { logger } from "../shared/logger";
import { DatabaseService, AgentRunHistory } from '../core/storage/databaseService';
import * as crypto from 'crypto';

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
  MAX_CONCURRENT_BATCHES: 3,  // Maximum parallel batch requests

  // Content processing
  MAX_FILE_CONTENT_LENGTH: 15000,  // Reduced for batch processing (per file)
  MIN_CONFIDENCE_THRESHOLD: 0.6,   // Lowered from 0.7 for inclusiveness

  // Rate limiting
  RATE_LIMIT_DELAY_MS: 500,  // Delay between batch requests

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

// Helper to initialize the model dynamically
function getModel(apiKey: string) {
  if (!apiKey) {
    throw new Error("Google API Key not provided to agent.");
  }

  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",
    temperature: 0,
    apiKey: apiKey
  });
}

// Node 1: Indexing
export async function initialIndexing(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 1 - Indexing repository...");
  // Get all files in the workspace using native VS Code API
  const files = await tools.getWorkspaceFiles(state.workspaceRoot);
  return { allFilePaths: files };
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

  const model = getModel(state.apiKey);

  // Define the structured output schema
  const schema = z.object({
    candidates: z.array(z.string()).describe("List of relevant file paths found in the repository")
  });

  const structuredLlm = model.withStructuredOutput(schema, { includeRaw: true });

  // Chunk the files to avoid token limits (JSON truncation) with large repos
  const CHUNK_SIZE = 600;
  const fileChunks = chunkArray(state.allFilePaths, CHUNK_SIZE);

  const allCandidates: string[] = [];
  let totalTokens = 0;

  try {
    // Process chunks sequentially to be safe with rate limits
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
        const response = await structuredLlm.invoke(prompt);
        const result = response.parsed as { candidates: string[] };
        const tokens = (response.raw as any)?.usage_metadata?.total_tokens || 0;

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
  query: string
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

  return `
You are analyzing files for a user request.
User Query: "${query}"

Analyze the following files and determine which are strictly necessary to fulfill the user's request.

${fileEntries}

For each file, determine:
1. Is it strictly necessary to fulfill the user's request? (true/false)
2. How confident are you? (0-1 score)

Return a JSON array with the structure:
[
  {"path": "file path", "isRelevant": true/false, "confidence": 0.0-1.0}
]
`;
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
  apiKey: string
): Promise<BatchProcessResult> {
  const model = getModel(apiKey);
  const batchSchema = z.object({
    files: z.array(z.object({
      path: z.string(),
      isRelevant: z.boolean(),
      confidence: z.number().min(0).max(1)
    }))
  });

  const batchLlm = model.withStructuredOutput(batchSchema, { includeRaw: true });

  try {
    // Check cache first
    const batchContent = batch.map(f => contentMap.get(f) || '').join('|||');
    const cacheResult = await llmCache.getOrCompute(
      query,
      batchContent,
      async () => {
        const prompt = buildBatchPrompt(batch, contentMap, query);
        const response = await batchLlm.invoke(prompt);
        return response;
      }
    );

    const result = cacheResult.parsed as { files: BatchFileResult[] };
    const tokens = (cacheResult.raw as any)?.usage_metadata?.total_tokens || 0;

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
  maxConcurrent: number = CONFIG.MAX_CONCURRENT_BATCHES
): Promise<BatchProcessResult[]> {
  const results: BatchProcessResult[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const batchPromise = (async (batchIndex: number) => {
      try {
        // Rate limiting delay for batches after the first few
        if (batchIndex >= maxConcurrent) {
          await new Promise(resolve =>
            setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS * (batchIndex - maxConcurrent + 1))
          );
        }

        const result = await processBatch(batch, contentMap, query, apiKey);
        results[batchIndex] = result;
      } catch (error) {
        results[batchIndex] = {
          relevantFiles: [],
          tokens: 0,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })(i);

    executing.push(batchPromise);

    // Limit concurrent executions
    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
      // Remove completed promises
      const settled = await Promise.allSettled(executing);
      executing.length = 0;
    }
  }

  // Wait for remaining promises
  await Promise.allSettled(executing);

  return results;
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

    // Process batches with controlled concurrency
    const results = await processBatchesWithConcurrency(
      batches,
      contentMap,
      state.userQuery,
      state.apiKey,
      CONFIG.MAX_CONCURRENT_BATCHES
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

  // Failsafe: ensure we have at least some files if candidates existed
  if (uniqueConfirmed.length === 0 && state.candidateFiles.length > 0) {
    logger.both.warn("Agent: No files confirmed as relevant, applying failsafe");

    // Show warning to user that relevance check failed and fallback is being used
    vscode.window.showWarningMessage(
      `Agent relevance check failed for all candidate files, using fallback selection of first ${Math.min(CONFIG.FALLBACK_MIN_FILES, state.candidateFiles.length)} files.`
    );

    // Return first few candidates as a fallback
    const fallbackFiles = state.candidateFiles.slice(0, CONFIG.FALLBACK_MIN_FILES);
    logger.both.info(`Agent: Fallback selected ${fallbackFiles.length} files`);
    return { confirmedFiles: fallbackFiles, totalTokens: stepTokens };
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

  const model = getModel(state.apiKey);
  const confirmed: string[] = [];

  const checkSchema = z.object({
    isRelevant: z.boolean().describe("True if the file is necessary to answer the user query")
  });
  const checkLlm = model.withStructuredOutput(checkSchema, { includeRaw: true });

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
      const response = await checkLlm.invoke(prompt);
      const result = response.parsed as { isRelevant: boolean };
      stepTokens += (response.raw as any)?.usage_metadata?.total_tokens || 0;

      if (result.isRelevant) {
        confirmed.push(filePath);
      }
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  return { confirmedFiles: confirmed, totalTokens: stepTokens };
}

// Node 5: Command Generation
export async function commandGeneration(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 5 - Generating final command...");

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
    const errorMessage = "Repomix Agent: No relevant files found for your query.";
    vscode.window.showWarningMessage(errorMessage);
    error = errorMessage;

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
