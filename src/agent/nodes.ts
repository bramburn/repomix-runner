import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AgentState } from "./state";
import * as tools from "./tools";
import { logger } from "../shared/logger";
import * as vscode from 'vscode';
import { execPromisify } from '../shared/execPromisify';

function getModel(apiKey: string) {
  if (!apiKey) {throw new Error("Google API Key not found in state.");}
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",
    temperature: 0,
    apiKey: apiKey
  });
}

// Node 1: Indexing
export async function initialIndexing(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 1 - Indexing repository via VS Code API...");

  // Use native VS Code API
  const files = await tools.getWorkspaceFiles(state.workspaceRoot);

  logger.both.info(`Agent: Found ${files.length} files.`);
  return { allFilePaths: files };
}

// Node 2: Structure Extraction (Pass-through)
// Since getWorkspaceFiles already returns a clean string array, we don't need XML parsing.
export async function structureExtraction(state: typeof AgentState.State) {
  return { allFilePaths: state.allFilePaths };
}

// Node 3: Initial Filtering (Fast Pass)
export async function initialFiltering(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 3 - Filtering candidate files...");

  const model = getModel(state.apiKey);
  const structureContext = state.allFilePaths.join('\n');

  const prompt = `
    You are an expert software engineer assistant.
    User Query: "${state.userQuery}"

    Below is the list of all files in the repository:
    ---
    ${structureContext}
    ---

    Task: Select all file paths that appear relevant to the user's query.
    Be generous. If the user asks for "lesson structure" or "markdown", include ALL .md files.
    Do not hallucinate paths. Only select from the list.
  `;

  const schema = z.object({ candidates: z.array(z.string()) });
  const structuredLlm = model.withStructuredOutput(schema);

  try {
    const result = await structuredLlm.invoke(prompt);
    logger.both.info(`Agent: Selected ${result.candidates.length} candidate files.`);
    return { candidateFiles: result.candidates };
  } catch (error) {
    logger.both.error("Agent: Filtering failed", error);
    return { candidateFiles: [] };
  }
}

// Node 4: Relevance Confirmation (Deep Analysis)
export async function relevanceConfirmation(state: typeof AgentState.State) {
  const count = state.candidateFiles.length;
  logger.both.info(`Agent: Step 4 - Analyzing content of ${count} files...`);

  if (count === 0) {return { confirmedFiles: [] };}

  const model = getModel(state.apiKey);
  const confirmed: string[] = [];
  const checkSchema = z.object({ isRelevant: z.boolean() });
  const checkLlm = model.withStructuredOutput(checkSchema);

  // Iterate through candidates and check content
  for (const filePath of state.candidateFiles) {
    // Call the new tool to get content directly
    const content = await tools.getFileContent(state.workspaceRoot, filePath);

    if (!content) {
        logger.both.debug(`Agent: Skipping ${filePath} (empty/unreadable)`);
        continue;
    }

    const snippet = content.slice(0, 30000); // Token limit protection

    const prompt = `
      User Query: "${state.userQuery}"
      File Path: "${filePath}"
      Content:
      ---
      ${snippet}
      ---
      Is this file relevant?
      - If it is documentation, markdown, or text related to the query -> TRUE.
      - If it is code related to the query -> TRUE.
      - If it contains configs for the query -> TRUE.
    `;

    try {
      const result = await checkLlm.invoke(prompt);
      if (result.isRelevant) {confirmed.push(filePath);}
    } catch (e) {
      logger.both.error(`Agent: Error checking ${filePath}`, e);
    }
  }

  logger.both.info(`Agent: Confirmed ${confirmed.length} files.`);

  // FAILSAFE: If deep check rejected all files but we had candidates, return candidates.
  if (confirmed.length === 0 && state.candidateFiles.length > 0) {
    logger.both.warn("Agent: Deep check rejected all files. Falling back to initial candidates.");
    return { confirmedFiles: state.candidateFiles };
  }

  return { confirmedFiles: confirmed };
}

// Node 5: Command Generation
export async function commandGeneration(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 5 - Generating command...");
  if (state.confirmedFiles.length === 0) {return { finalCommand: "" };}

  const includeFlag = state.confirmedFiles.map(f => `"${f}"`).join(",");

  // We return the raw command string
  return { finalCommand: `npx repomix --include ${includeFlag}` };
}

// Node 6: Final Execution
export async function finalExecution(state: typeof AgentState.State) {
  logger.both.info("Agent: Step 6 - Executing...");

  if (!state.finalCommand) {
    vscode.window.showWarningMessage("No files found.");
    return {};
  }

  try {
    // Run the generated command using the existing CLI wrapper
    await execPromisify(state.finalCommand, { cwd: state.workspaceRoot });
    vscode.window.showInformationMessage(`Packaged ${state.confirmedFiles.length} files!`);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed: ${error.message}`);
  }
  return {};
}