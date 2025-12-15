import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AgentState } from "./state";
import * as tools from "./tools";
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';
import { logger } from "../shared/logger";
import { DatabaseService, AgentRunHistory } from '../core/storage/databaseService';

// Helper to generate a unique 4-character ID
function generateShortId(): string {
  return Math.random().toString(36).substring(2, 6);
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
  const structureContext = state.allFilePaths.join('\n');

  const prompt = `
    You are an expert software engineer assistant.
    The user wants to package specific parts of a codebase into a single file.

    User Query: "${state.userQuery}"

    Below is the list of all files in the repository:
    ---
    ${structureContext}
    ---

    Task: Select all file paths that appear relevant to the user's query based on their names and directory location.
    Be generous in this step; include any file that MIGHT be relevant.
    Do not hallucinate paths. Only select from the provided list.
  `;

  // Define the structured output schema
  const schema = z.object({
    candidates: z.array(z.string()).describe("List of relevant file paths found in the repository")
  });

  const structuredLlm = model.withStructuredOutput(schema, { includeRaw: true });

  try {
    const response = await structuredLlm.invoke(prompt);
    const result = response.parsed as { candidates: string[] };
    const tokens = (response.raw as any)?.usage_metadata?.total_tokens || 0;

    logger.both.info(`Agent: Selected ${result.candidates.length} candidate files for deep analysis.`);

    // Ensure we don't return empty candidates if there are files available
    if (result.candidates.length === 0 && state.allFilePaths.length > 0) {
      logger.both.warn("Agent: No candidates selected, applying failsafe to select some files");
      // Failsafe: select a reasonable subset of files based on common patterns
      const fallbackCandidates = state.allFilePaths.filter(file =>
        file.includes('src') ||
        file.includes('lib') ||
        file.includes('app') ||
        file.match(/\.(ts|js|tsx|jsx|py|java|cs|cpp|c|go|rs|php)$/)
      ).slice(0, 20);

      return { candidateFiles: fallbackCandidates, totalTokens: tokens };
    }

    return { candidateFiles: result.candidates, totalTokens: tokens };
  } catch (error) {
    logger.both.error("Agent: Filtering failed", error);

    // Show warning to user so they know AI filtering failed and fallback is used
    vscode.window.showWarningMessage(`Agent filtering failed (${error instanceof Error ? error.message : 'Unknown'}), using fallback file list.`);

    // Fallback: If LLM fails, return empty or apply failsafe
    if (state.allFilePaths.length > 0) {
      const fallbackCandidates = state.allFilePaths.filter(file =>
        file.match(/\.(ts|js|tsx|jsx|py|java|cs|cpp|c|go|rs|php)$/)
      ).slice(0, 20);
      return { candidateFiles: fallbackCandidates, totalTokens: 0 };
    }
    return { candidateFiles: [], totalTokens: 0 };
  }
}

// Node 4: Relevance Confirmation (Deep Analysis)
export async function relevanceConfirmation(state: typeof AgentState.State) {
  const count = state.candidateFiles.length;
  logger.both.info(`Agent: Step 4 - Analyzing content of ${count} files...`);

  if (count === 0) {
    return { confirmedFiles: [] };
  }

  // Bulk fetch content using our optimized tool
  const contentMap = await tools.getFileContents(state.workspaceRoot, state.candidateFiles);

  const model = getModel(state.apiKey);
  const confirmed: string[] = [];

  // Define schema for the boolean check
  const checkSchema = z.object({
    isRelevant: z.boolean().describe("True if the file is necessary to answer the user query")
  });
  const checkLlm = model.withStructuredOutput(checkSchema, { includeRaw: true });

  let stepTokens = 0; // Track tokens for this loop

  // Iterate and check (can be parallelized, but keeping sequential for reliability)
  for (const filePath of state.candidateFiles) {
    const content = contentMap.get(filePath);

    if (!content) {
      logger.both.warn(`Agent: Could not find content for ${filePath}`);
      continue;
    }

    // Truncate huge files to fit context window if necessary
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
      stepTokens += (response.raw as any)?.usage_metadata?.total_tokens || 0; // Accumulate

      if (result.isRelevant) {
        confirmed.push(filePath);
      }
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  // Failsafe: ensure we have at least some files if candidates existed
  if (confirmed.length === 0 && state.candidateFiles.length > 0) {
    logger.both.warn("Agent: No files confirmed as relevant, applying failsafe");

    // Show warning to user that relevance check failed and fallback is being used
    vscode.window.showWarningMessage(`Agent relevance check failed for all candidate files, using fallback selection of first ${Math.min(5, state.candidateFiles.length)} files.`);

    // Return first few candidates as a fallback
    const fallbackFiles = state.candidateFiles.slice(0, 5);
    logger.both.info(`Agent: Fallback selected ${fallbackFiles.length} files`);
    return { confirmedFiles: fallbackFiles, totalTokens: stepTokens };
  }

  logger.both.info(`Agent: Confirmed ${confirmed.length} files as strictly relevant.`);
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
      bundleId,
      queryId: state.queryId
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

    // Save or update the query if run was successful
    await handleQueryPersistence(state, databaseService);
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
    bundleId,
    queryId: state.queryId
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

/**
 * Handles query persistence - saves new queries or updates existing ones
 */
async function handleQueryPersistence(
  state: typeof AgentState.State,
  databaseService: DatabaseService
): Promise<void> {
  try {
    // Check if this query already exists
    const existingQuery = await databaseService.findQueryByText(state.userQuery);

    if (existingQuery) {
      // Update existing query's usage
      await databaseService.updateQueryUsage(existingQuery.id);
      logger.both.info(`Updated existing query usage: ${existingQuery.id}`);
    } else {
      // Save new query
      const queryId = state.queryId || `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const queryName = state.userQuery.length > 50
        ? state.userQuery.substring(0, 47) + '...'
        : state.userQuery;

      await databaseService.saveQuery({
        id: queryId,
        name: queryName,
        query: state.userQuery,
        timestamp: Date.now(),
        lastUsed: Date.now(),
        runCount: 1
      });

      logger.both.info(`Saved new query: ${queryId}`);
    }
  } catch (error) {
    // Don't fail the whole operation if query persistence fails
    logger.both.error("Failed to handle query persistence:", error);
  }
}
