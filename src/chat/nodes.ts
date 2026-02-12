import { z } from "zod";
import { ChatState } from "./state";
import { logger } from "../shared/logger";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getVectorDbAdapterForRepo } from "../core/indexing/vectorDb/factory.js";
import { embeddingService } from "../core/indexing/embeddingService.js";
import { getRepoId } from "../utils/repoIdentity.js";
import * as llmClient from "../agent/llmClient.js";
import type { ProgressCallback } from "./graph";

const SECRET_GOOGLE_GEMINI = "repomix.agent.googleApiKey";
const GEMINI_2_5_FLASH_INPUT_PER_M = 0.3;
const GEMINI_2_5_FLASH_OUTPUT_PER_M = 2.5;
const TOKENS_PER_MILLION = 1_000_000;

type RetrievedContextItem = {
  filePath: string;
  content: string;
  score: number;
  startLine?: number;
  endLine?: number;
};

function sliceSnippet(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...`;
}

function calculateGeminiCost(promptTokens: number, completionTokens: number) {
  const inputCost = (promptTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_INPUT_PER_M;
  const outputCost = (completionTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_OUTPUT_PER_M;
  return inputCost + outputCost;
}

async function loadSnippet(repoRoot: string, filePath: string, startLine?: number, endLine?: number) {
  const fullPath = path.resolve(repoRoot, filePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) return "";
  if (!fs.existsSync(fullPath)) return "";
  const content = await fs.promises.readFile(fullPath, "utf-8");
  if (!startLine || !endLine || startLine < 1 || endLine < startLine) {
    return sliceSnippet(content, 1000);
  }
  const lines = content.split(/\r?\n/);
  const slice = lines.slice(startLine - 1, endLine);
  return sliceSnippet(slice.join("\n"), 1000);
}

async function getApiKey(extensionContext: ExtensionContext): Promise<string> {
  return (await extensionContext.secrets.get(SECRET_GOOGLE_GEMINI)) ?? "";
}

// --- Node 1: Generate Search Queries ---
export async function generateQueriesNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress("Analyzing request and generating search queries...");

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn("Chat Graph: Missing API key, using raw user query for search.");
    return { searchQueries: [state.userQuery] };
  }

  const schema = z.object({
    queries: z.array(z.string()).describe("List of 3-5 specific search queries"),
    reasoning: z.string().describe("Brief explanation of why these queries were chosen"),
  });

  const prompt = `
User Request: "${state.userQuery}"

You are an expert developer agent. Break down this request into specific code search queries.
Focus on finding definitions, architecture patterns, and specific filenames if mentioned.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      "GenerateChatQueries"
    );

    onProgress(`Generated ${parsed.queries.length} search queries.`);
    const resolvedTotalTokens = totalTokens || promptTokens + completionTokens;
    return {
      searchQueries: parsed.queries,
      tokensUsed: resolvedTotalTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    logger.both.error("Chat Graph: Failed to generate queries, falling back to raw input.", error);
    return { searchQueries: [state.userQuery] };
  }
}

// --- Node 2: Vector Search ---
export async function vectorSearchNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  const queries = state.searchQueries.length > 0 ? state.searchQueries : [state.userQuery];
  const normalizedQueries = queries.map(q => q.trim()).filter(Boolean);
  if (normalizedQueries.length === 0) return { retrievedContext: [] };

  onProgress(`Searching codebase for: ${normalizedQueries.join(", ")}...`);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    logger.both.warn("Chat Graph: No workspace folder found, skipping retrieval.");
    return { retrievedContext: [] };
  }

  let repoId: string;
  try {
    repoId = await getRepoId(workspaceFolder);
  } catch (error) {
    logger.both.warn("Chat Graph: Failed to determine repo ID, skipping retrieval.", error);
    return { retrievedContext: [] };
  }

  try {
    const { adapter } = await getVectorDbAdapterForRepo(extensionContext, repoId);

    const allResults = await Promise.all(
      normalizedQueries.map(async (query) => {
        const vector = await embeddingService.embedText(query, "chat", true);
        return adapter.queryVectors({
          repoId,
          vector,
          topK: 5,
          groupBy: "filePath",
        });
      })
    );

    const rawMatches = allResults.flatMap((result) =>
      result.groupedMatches?.length ? result.groupedMatches : result.matches
    );

    const retrievedContext: RetrievedContextItem[] = [];
    for (const match of rawMatches) {
      const filePath = match.metadata?.filePath as string | undefined;
      if (!filePath) continue;
      const startLine = match.metadata?.startLine as number | undefined;
      const endLine = match.metadata?.endLine as number | undefined;
      const content = await loadSnippet(workspaceFolder, filePath, startLine, endLine);
      retrievedContext.push({
        filePath,
        content,
        score: match.score ?? 0,
        startLine,
        endLine,
      });
    }

    onProgress(`Found ${retrievedContext.length} relevant code snippets.`);
    return { retrievedContext };
  } catch (error) {
    logger.both.error("Chat Graph: Vector search failed", error);
    return { retrievedContext: [] };
  }
}

// --- Node 3: Evaluate & Plan ---
export async function evaluateNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (state.loopCount > 3) {
    onProgress("Max depth reached. Generating final answer.");
    return { nextAction: "ANSWER" as const };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn("Chat Graph: Missing API key, skipping evaluation.");
    return { nextAction: "ANSWER" as const };
  }

  onProgress("Evaluating search results...");

  const schema = z.object({
    analysis: z.string().describe("Critique of the current information."),
    nextAction: z.enum(["READ", "ANSWER"]).describe("READ for more file contents, ANSWER otherwise."),
    targetFiles: z.array(z.string()).optional().describe("Specific file paths to read fully"),
  });

  const contextSummary = state.retrievedContext
    .map((s) => `Snippet: ${s.filePath}\n${sliceSnippet(s.content ?? "", 200)}`)
    .join("\n\n");

  const readFilesSummary = Object.keys(state.fileContents).length
    ? Object.keys(state.fileContents).join(", ")
    : "None";

  const prompt = `
User Query: "${state.userQuery}"

We have gathered the following context:
${contextSummary || "No snippets found."}

Files already read fully: ${readFilesSummary}

Decide your next step:
1. If you see a relevant file but the snippet is cut off or insufficient, choose READ and target that file.
2. If you have enough information to answer the user thoroughly, choose ANSWER.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      "EvalChatContext"
    );

    if (parsed.nextAction === "READ" && parsed.targetFiles?.length) {
      const targets = parsed.targetFiles.filter((filePath) => !state.fileContents[filePath]);
      if (targets.length > 0) {
        onProgress(`Decided to read ${targets.length} files for more details.`);
        const resolvedTotalTokens = totalTokens || promptTokens + completionTokens;
        return {
          nextAction: "READ" as const,
          filesToRead: targets,
          tokensUsed: resolvedTotalTokens,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          costUsd: calculateGeminiCost(promptTokens, completionTokens),
          loopCount: 1,
        };
      }
    }

    return {
      nextAction: "ANSWER" as const,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    logger.both.error("Chat Graph: Evaluation failed, generating answer.", error);
    return { nextAction: "ANSWER" as const };
  }
}

// --- Node 4: Tool - Read File ---
export async function readFileNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return {};

  const newContents: Record<string, string> = {};
  for (const relPath of state.filesToRead) {
    onProgress(`Reading file: ${relPath}...`);
    try {
      const fullPath = path.resolve(workspaceFolder, relPath);
      if (!fullPath.startsWith(workspaceFolder + path.sep)) {
        logger.both.warn(`Chat Graph: Skipping path outside workspace: ${relPath}`);
        continue;
      }
      if (fs.existsSync(fullPath)) {
        const content = await fs.promises.readFile(fullPath, "utf-8");
        newContents[relPath] = content;
      }
    } catch (error) {
      logger.both.warn(`Chat Graph: Failed to read ${relPath}`, error);
    }
  }

  return { fileContents: newContents };
}

// --- Node 5: Generate Final Response ---
export async function generateResponseNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress("Formulating final response...");

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    const fallback = state.retrievedContext.length
      ? `I found ${state.retrievedContext.length} relevant snippets:\n` +
        state.retrievedContext.map(s => `- ${s.filePath}`).join("\n")
      : "I couldn't access an API key to generate a detailed response.";
    return {
      aiResponse: fallback,
      messages: [{ role: "assistant", content: fallback }],
    };
  }

  let context = "Retrieved Snippets:\n";
  context += state.retrievedContext
    .map((s) => `File: ${s.filePath}\n${s.content}`)
    .join("\n\n");

  context += "\n\nFull Files Read:\n";
  for (const [filePath, content] of Object.entries(state.fileContents)) {
    context += `File: ${filePath}\n${content}\n\n`;
  }

  const prompt = `
User Query: "${state.userQuery}"

Based ONLY on the context below, answer the user's question.
Cite specific files and lines where possible.

Context:
${context || "No context available."}
  `.trim();

  const { content, totalTokens, promptTokens, completionTokens } = await llmClient.generateText(
    apiKey,
    prompt,
    "ChatResponse"
  );
  const resolvedTotalTokens = totalTokens || promptTokens + completionTokens;

  return {
    aiResponse: content,
    messages: [{ role: "assistant", content }],
    tokensUsed: resolvedTotalTokens,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    costUsd: calculateGeminiCost(promptTokens, completionTokens),
  };
}
