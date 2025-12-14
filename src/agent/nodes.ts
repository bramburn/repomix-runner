import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AgentState } from "./state";
import * as tools from "./tools";
import * as fs from 'fs/promises';
import { logger } from "../shared/logger";
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';

// Define a helper that takes the key
function getModel(apiKey: string) {
  if (!apiKey) {
    throw new Error("Google API Key not found in state.");
  }
  return new ChatGoogleGenerativeAI({
    modelName: "gemini-2.5-flash-lite",
    temperature: 0,
    apiKey: apiKey
  });
}

// Node 1: Indexing
export async function initialIndexing(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 1 - Indexing repository...");
  // Run repomix --compress to get the map of the repo
  const contextPath = await tools.runRepomixCompress(state.workspaceRoot);
  return { contextFilePath: contextPath };
}

// Node 2: Structure Extraction
export async function structureExtraction(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 2 - Extracting file list...");
  // Parse the XML to get a clean list of all file paths
  const files = await tools.parseDirectoryStructure(state.contextFilePath);
  logger.both.info(`Agent: Found ${files.length} files in repository.`);
  return { allFilePaths: files };
}

// Node 3: Initial Filtering (Fast Pass)
export async function initialFiltering(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 3 - Filtering candidate files...");

  // PASS KEY FROM STATE
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

  const structuredLlm = model.withStructuredOutput(schema);

  try {
    const result = await structuredLlm.invoke(prompt);
    logger.both.info(`Agent: Selected ${result.candidates.length} candidate files for deep analysis.`);
    return { candidateFiles: result.candidates };
  } catch (error) {
    logger.both.error("Agent: Filtering failed", error);
    // Fallback: If LLM fails, return empty or all (risk management)
    return { candidateFiles: [] };
  }
}

// Node 4: Relevance Confirmation (Deep Analysis)
export async function relevanceConfirmation(state: typeof AgentState.State) {
  const count = state.candidateFiles.length;
  logger.both.info(`Agent: Step 4 - Analyzing content of ${count} files...`);

  if (count === 0) {
    return { confirmedFiles: [] };
  }

  // 1. Bulk fetch content using our optimized tool
  const contentMap = await tools.extractFileContents(state.contextFilePath, state.candidateFiles);

  // PASS KEY FROM STATE
  const model = getModel(state.apiKey);
  const confirmed: string[] = [];

  // Define schema for the boolean check
  const checkSchema = z.object({
    isRelevant: z.boolean().describe("True if the file is necessary to answer the user query")
  });
  const checkLlm = model.withStructuredOutput(checkSchema);

  // 2. Iterate and check (Sequential for simplicity, can be parallelized)
  for (const filePath of state.candidateFiles) {
    const content = contentMap.get(filePath);

    if (!content) {
      logger.both.warn(`Agent: Could not find content for ${filePath}`);
      continue;
    }

    // Truncate huge files to fit context window if necessary,
    // though Gemini Flash has a large window.
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
      const result = await checkLlm.invoke(prompt);
      if (result.isRelevant) {
        confirmed.push(filePath);
      }
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  logger.both.info(`Agent: Confirmed ${confirmed.length} files as strictly relevant.`);
  return { confirmedFiles: confirmed };
}

// Node 5: Command Generation
export async function commandGeneration(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 5 - Generating final command...");

  if (state.confirmedFiles.length === 0) {
    logger.both.warn("Agent: No relevant files found. Skipping execution.");
    return { finalCommand: "" };
  }

  // Escape paths for safety (basic quoting)
  const includeFlag = state.confirmedFiles
    .map(f => `"${f}"`)
    .join(",");

  // Construct the CLI command
  // We use the --include flag to specify exactly which files to package
  const command = `npx repomix --include ${includeFlag}`;

  return { finalCommand: command };
}

// Node 6: Final Execution (Cleanup & Run)
export async function finalExecution(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 6 - Executing final run...");

  // 1. Cleanup the temp context file
  try {
    await fs.unlink(state.contextFilePath);
    logger.both.debug("Agent: Cleaned up context file.");
  } catch (e) {
    // Ignore cleanup errors
  }

  if (!state.finalCommand) {
    vscode.window.showWarningMessage("Repomix Agent: No relevant files found for your query.");
    return {};
  }

  // 2. Execute the final command using the existing runner infrastructure
  try {
    await execPromisify(state.finalCommand, { cwd: state.workspaceRoot });
    vscode.window.showInformationMessage(`Agent successfully packaged ${state.confirmedFiles.length} files!`);
  } catch (error) {
    logger.both.error("Agent: Failed to execute final command", error);
    vscode.window.showErrorMessage(`Repomix Agent failed to execute: ${error}`);
  }

  return {};
}