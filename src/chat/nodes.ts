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
import { PlanService } from "../services/planService.js";
import type { ProgressCallback } from "./graph";
import { GitService } from "../git/GitService.js";

const SECRET_GOOGLE_GEMINI = "repomix.agent.googleApiKey";
const GEMINI_2_5_FLASH_INPUT_PER_M = 0.3;
const GEMINI_2_5_FLASH_OUTPUT_PER_M = 2.5;
const TOKENS_PER_MILLION = 1_000_000;
const MAX_EVAL_LOOPS = 4;
const MAX_EDIT_RETRIES = 3;
const MAX_SNIPPET_CHARS = 1000;
const MAX_FILE_CHARS_FOR_PLAN = 50000;

type RetrievedContextItem = {
  filePath: string;
  content: string;
  score: number;
  startLine?: number;
  endLine?: number;
};

type PlanEditCall = {
  targetText: string;
  replacementText: string;
};

function sliceSnippet(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...`;
}

function formatHistory(
  messages: Array<{ role?: string; content?: string }>,
  maxCount = 10
): string {
  return messages
    .slice(-maxCount)
    .filter((m) => m.role !== "system" && typeof m.content === "string")
    .map((m) => `${String(m.role ?? "unknown").toUpperCase()}: ${m.content}`)
    .join("\n");
}

function isLikelyPlanRequest(userQuery: string): boolean {
  const query = userQuery.trim().toLowerCase();
  if (!query) {
    return false;
  }
  if (/^(hi|hello|hey|thanks|thank you|yo|sup)[!. ]*$/.test(query)) {
    return false;
  }
  return /\b(plan|roadmap|implementation|implement|build|create|add|update|change|refactor|improve|fix|migrate|feature|task|steps?)\b/.test(query);
}

function calculateGeminiCost(promptTokens: number, completionTokens: number) {
  const inputCost = (promptTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_INPUT_PER_M;
  const outputCost = (completionTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_OUTPUT_PER_M;
  return inputCost + outputCost;
}

async function loadSnippet(repoRoot: string, filePath: string, startLine?: number, endLine?: number) {
  const fullPath = path.resolve(repoRoot, filePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    return "";
  }
  if (!fs.existsSync(fullPath)) {
    return "";
  }
  const content = await fs.promises.readFile(fullPath, "utf-8");
  if (!startLine || !endLine || startLine < 1 || endLine < startLine) {
    return sliceSnippet(content, MAX_SNIPPET_CHARS);
  }
  const lines = content.split(/\r?\n/);
  const slice = lines.slice(startLine - 1, endLine);
  return sliceSnippet(slice.join("\n"), MAX_SNIPPET_CHARS);
}

async function getApiKey(extensionContext: ExtensionContext): Promise<string> {
  return (await extensionContext.secrets.get(SECRET_GOOGLE_GEMINI)) ?? "";
}

function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
}

async function executePlanEdits(
  planService: PlanService,
  threadId: string,
  edits: PlanEditCall[]
): Promise<void> {
  for (const edit of edits) {
    await planService.updatePlanPart(threadId, edit.targetText, edit.replacementText);
  }
}

export async function loadPlanNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    logger.both.warn("Chat Graph: Missing threadId; skipping plan load.");
    return { planContent: "", planPath: "" };
  }

  onProgress("Loading persistent plan...");
  const planService = new PlanService(extensionContext);
  const planContent = await planService.loadPlan(state.threadId);
  const planPath = planService.getPlanPath(state.threadId);

  return {
    planContent,
    planPath,
    planUpdated: false,
    retryCount: 0,
    lastToolError: null,
    lastToolCall: null,
  };
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

  const historyStr = formatHistory(state.messages.slice(0, -1));
  const prompt = `
User Request: "${state.userQuery}"

Conversation History:
${historyStr || "(No prior conversation)"}

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
  const normalizedQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (normalizedQueries.length === 0) {
    return { retrievedContext: [] };
  }

  onProgress(`Searching codebase for: ${normalizedQueries.join(", ")}...`);

  const workspaceFolder = getWorkspaceRoot();
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
    const gitService = new GitService();
    const branchName = await gitService.getCurrentBranch(workspaceFolder);

    const allResults = await Promise.all(
      normalizedQueries.map(async (query) => {
        const vector = await embeddingService.embedText(query, "chat", true);
        return adapter.queryVectors({
          repoId,
          vector,
          topK: 5,
          groupBy: "filePath",
          branchName,
        });
      })
    );

    const rawMatches = allResults.flatMap((result) =>
      result.groupedMatches?.length ? result.groupedMatches : result.matches
    );

    const retrievedContext: RetrievedContextItem[] = [];
    for (const match of rawMatches) {
      const filePath = match.metadata?.filePath as string | undefined;
      if (!filePath) {
        continue;
      }
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

// --- Node 3: Evaluate & Decide ---
export async function evaluateNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (state.loopCount >= MAX_EVAL_LOOPS) {
    onProgress("Reached max search loops. Generating final response.");
    return { nextAction: "ANSWER" as const };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn("Chat Graph: Missing API key, skipping evaluation.");
    return { nextAction: "ANSWER" as const };
  }

  onProgress("Evaluating context and deciding next step...");

  const schema = z.object({
    reasoning: z.string().describe("Why you are making this decision."),
    nextAction: z.enum(["SEARCH_MORE", "REWRITE", "ANSWER"]),
    newQueries: z.array(z.string()).optional().describe("Additional searches if snippets are insufficient."),
    filesToUnlock: z.array(z.string()).optional().describe("Relative file paths to read fully before rewriting."),
  });

  const contextSummary = state.retrievedContext
    .slice(-30)
    .map((s) => `- ${s.filePath}: ${sliceSnippet(s.content ?? "", 200)}`)
    .join("\n");
  const historyStr = formatHistory(state.messages.slice(0, -1));

  const prompt = `
CURRENT PLAN (.repomix/plans):
${state.planContent || "(No plan exists yet)"}

Conversation History:
${historyStr || "(No prior conversation)"}

USER REQUEST:
"${state.userQuery}"

AVAILABLE CONTEXT (snippets / promise):
${contextSummary || "No snippets found."}

DECISION RULES:
1. SEARCH_MORE: If snippets are not sufficient to understand the architecture or implementation details.
2. REWRITE:
   - If you need to CREATE a new plan (because none exists).
   - If you need to UPDATE the existing plan based on the user request.
   - Provide filesToUnlock if you need to read specific files fully before writing.
3. ANSWER: Only for greetings, pure conversation, or when no plan work is needed.

CRITICAL: If the user asks for implementation work and no plan exists, choose REWRITE to create the initial plan.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      "EvalPlanDrivenContext"
    );

    const baseMetrics = {
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
      loopCount: 1,
    };

    if (parsed.nextAction === "SEARCH_MORE") {
      const newQueries = (parsed.newQueries ?? []).map((q) => q.trim()).filter(Boolean);
      if (newQueries.length > 0) {
        onProgress(`Searching deeper with ${newQueries.length} additional queries.`);
        return {
          ...baseMetrics,
          nextAction: "SEARCH_MORE" as const,
          searchQueries: newQueries,
        };
      }
      return { ...baseMetrics, nextAction: "ANSWER" as const };
    }

    if (parsed.nextAction === "REWRITE") {
      const unlocked = [...new Set((parsed.filesToUnlock ?? []).map((p) => p.trim()).filter(Boolean))];
      return {
        ...baseMetrics,
        nextAction: "REWRITE" as const,
        filesToLoad: unlocked,
        retryCount: 0,
        lastToolError: null,
        lastToolCall: null,
      };
    }

    // Safety override: if no plan exists and the query implies implementation work,
    // force creation path even when the model returned ANSWER.
    const noPlanExists = !state.planContent || state.planContent.trim().length === 0;
    if (noPlanExists && isLikelyPlanRequest(state.userQuery)) {
      return {
        ...baseMetrics,
        nextAction: "REWRITE" as const,
        filesToLoad: [],
        retryCount: 0,
        lastToolError: null,
        lastToolCall: null,
      };
    }

    return {
      ...baseMetrics,
      nextAction: "ANSWER" as const,
    };
  } catch (error) {
    logger.both.error("Chat Graph: Evaluation failed, generating answer.", error);
    return { nextAction: "ANSWER" as const, loopCount: 1 };
  }
}

// --- Node 4: Load full files for rewrite ---
export async function loadForRewriteNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder || state.filesToLoad.length === 0) {
    return { targetFileContents: {} };
  }

  const contents: Record<string, string> = {};
  for (const relPath of state.filesToLoad) {
    onProgress(`Loading file for plan rewrite: ${relPath}`);
    try {
      const fullPath = path.resolve(workspaceFolder, relPath);
      if (!fullPath.startsWith(workspaceFolder + path.sep)) {
        logger.both.warn(`Chat Graph: Skipping path outside workspace: ${relPath}`);
        continue;
      }
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const content = await fs.promises.readFile(fullPath, "utf-8");
      contents[relPath] = sliceSnippet(content, MAX_FILE_CHARS_FOR_PLAN);
    } catch (error) {
      logger.both.warn(`Chat Graph: Failed loading ${relPath} for plan rewrite`, error);
    }
  }

  return { targetFileContents: contents };
}

// --- Node 5: Surgical plan edit ---
export async function editPlanNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    return {
      planUpdated: false,
      nextAction: "ANSWER" as const,
    };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn("Chat Graph: Missing API key, cannot rewrite plan.");
    return {
      planUpdated: false,
      nextAction: "ANSWER" as const,
    };
  }

  const planService = new PlanService(extensionContext);
  const isNewPlan = !state.planContent || state.planContent.trim().length === 0;

  if (isNewPlan) {
    onProgress("Creating initial plan...");

    const contextStr = Object.entries(state.targetFileContents)
      .map(([filePath, content]) => `FILE: ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join("\n\n");
    const historyStr = formatHistory(state.messages.slice(0, -1));

    const createPrompt = `
You are an expert software architect.
USER REQUEST: "${state.userQuery}"

Conversation History:
${historyStr || "(No prior conversation)"}

FULL CONTEXT:
${contextStr || "No specific files loaded."}

TASK:
Create a comprehensive step-by-step implementation plan in Markdown.
- Use checkboxes (- [ ]) for executable steps.
- Include a "Verification" section.
- Be specific about files and implementation details when possible.
    `.trim();

    try {
      const { content, totalTokens, promptTokens, completionTokens } = await llmClient.generateText(
        apiKey,
        createPrompt,
        "CreatePlan"
      );

      await planService.updatePlan(state.threadId, content);

      return {
        planContent: content,
        planUpdated: true,
        planIsNew: isNewPlan,
        nextAction: "ANSWER" as const,
        retryCount: 0,
        lastToolError: null,
        lastToolCall: null,
        tokensUsed: totalTokens || promptTokens + completionTokens,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        costUsd: calculateGeminiCost(promptTokens, completionTokens),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.both.error("Chat Graph: Plan creation failed", error);
      return {
        planUpdated: false,
        nextAction: "ANSWER" as const,
        lastToolError: errorMessage,
      };
    }
  }

  onProgress("Applying surgical plan edits...");

  const schema = z.object({
    edits: z.array(z.object({
      thoughts: z.string().optional(),
      targetText: z.string(),
      replacementText: z.string(),
    })),
  });

  const prompt = `
ORIGINAL PLAN:
\`\`\`markdown
${state.planContent || "(No existing plan yet)"}
\`\`\`

USER REQUEST:
"${state.userQuery}"

FULL CONTEXT (requested files):
${Object.entries(state.targetFileContents)
  .map(([filePath, content]) => `FILE: ${filePath}\n\`\`\`\n${content}\n\`\`\``)
  .join("\n\n") || "No full files loaded."}

TASK: Perform SURGICAL edits, do not rewrite the whole file.
Rules:
1. Return one or more edits with EXACT targetText blocks from ORIGINAL PLAN.
2. targetText must be unique in the file.
3. replacementText is the updated markdown for that block.
4. Include enough context in targetText (header + bullets) to avoid ambiguity.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      "EditPlan"
    );

    const edits = parsed.edits
      .map((edit) => ({
        targetText: edit.targetText,
        replacementText: edit.replacementText,
      }))
      .filter((edit) => edit.targetText.trim().length > 0);

    if (edits.length === 0) {
      return {
        planUpdated: false,
        nextAction: "ANSWER" as const,
        retryCount: 0,
      };
    }

    await executePlanEdits(planService, state.threadId, edits);
    const newPlanContent = await planService.loadPlan(state.threadId);
    return {
      planContent: newPlanContent,
      planUpdated: true,
      planIsNew: isNewPlan,
      nextAction: "ANSWER" as const,
      retryCount: 0,
      lastToolError: null,
      lastToolCall: edits,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.both.warn("Chat Graph: Plan edit failed; entering repair loop.", error);
    return {
      planUpdated: false,
      nextAction: "RETRY_EDIT" as const,
      retryCount: state.retryCount + 1,
      lastToolError: errorMessage,
    };
  }
}

// --- Node 6: Retry/repair loop for failed plan edits ---
export async function repairEditNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    return { nextAction: "ANSWER" as const };
  }

  if (state.retryCount > MAX_EDIT_RETRIES) {
    onProgress("Plan edit retries exhausted.");
    return {
      nextAction: "ANSWER" as const,
      planUpdated: false,
    };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    return { nextAction: "ANSWER" as const };
  }

  onProgress(`Retrying plan edit (${state.retryCount}/${MAX_EDIT_RETRIES})...`);

  const schema = z.object({
    edits: z.array(z.object({
      targetText: z.string(),
      replacementText: z.string(),
    })),
  });

  const prompt = `
SYSTEM: A previous plan edit failed.
ERROR: "${state.lastToolError || "Unknown tool error"}"

ORIGINAL PLAN:
\`\`\`markdown
${state.planContent || "(No existing plan yet)"}
\`\`\`

USER REQUEST: "${state.userQuery}"

Fix the failed edit by returning corrected surgical edits.
Tips:
- If not found, copy targetText EXACTLY including whitespace/newlines.
- If ambiguous, include a larger unique block.
  `.trim();

  const planService = new PlanService(extensionContext);
  try {
    const { parsed, totalTokens, promptTokens, completionTokens } = await llmClient.generateStructured(
      apiKey,
      schema,
      prompt,
      "RepairPlanEdit"
    );

    const edits = parsed.edits
      .map((edit) => ({
        targetText: edit.targetText,
        replacementText: edit.replacementText,
      }))
      .filter((edit) => edit.targetText.trim().length > 0);

    if (edits.length === 0) {
      throw new Error("Repair step produced no valid edits.");
    }

    await executePlanEdits(planService, state.threadId, edits);
    const newPlanContent = await planService.loadPlan(state.threadId);
    return {
      planContent: newPlanContent,
      planUpdated: true,
      nextAction: "ANSWER" as const,
      retryCount: 0,
      lastToolError: null,
      lastToolCall: edits,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (state.retryCount >= MAX_EDIT_RETRIES) {
      return {
        nextAction: "ANSWER" as const,
        planUpdated: false,
        lastToolError: errorMessage,
      };
    }
    return {
      nextAction: "RETRY_EDIT" as const,
      retryCount: state.retryCount + 1,
      lastToolError: errorMessage,
      planUpdated: false,
    };
  }
}

// --- Node 7: Generate Final Response ---
export async function generateResponseNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress("Formulating final response...");

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    const fallback = state.planUpdated
      ? `I updated the plan at ${state.planPath || ".repomix/plans"}.`
      : state.lastToolError
        ? `I could not apply the plan edit: ${state.lastToolError}`
        : state.retrievedContext.length
          ? `I found ${state.retrievedContext.length} relevant snippets:\n` +
            state.retrievedContext.map((s) => `- ${s.filePath}`).join("\n")
          : "I couldn't access an API key to generate a detailed response.";

    return {
      aiResponse: fallback,
      messages: [{ role: "assistant", content: fallback }],
    };
  }

  const snippets = state.retrievedContext
    .slice(-25)
    .map((s) => `File: ${s.filePath}\n${sliceSnippet(s.content, 400)}`)
    .join("\n\n");

  const rewriteFiles = Object.keys(state.targetFileContents).join(", ") || "None";
  const errorSummary = state.lastToolError ? `Last tool error: ${state.lastToolError}` : "No tool errors.";
  const historyStr = formatHistory(state.messages.slice(0, -1));

  const prompt = `
You are Repomix Agent, an expert software architect.

User Query: "${state.userQuery}"

Conversation History:
${historyStr || "(No prior conversation)"}

STATUS:
- Plan updated this turn: ${state.planUpdated ? "YES" : "NO"}
- Plan path: ${state.planPath || "(unavailable)"}
- Errors: ${errorSummary}

CURRENT PLAN CONTENT (Hidden from user, for your reference only):
${sliceSnippet(state.planContent || "(No plan)", 5000)}

CONTEXT:
${snippets || "No snippets found."}

Files fully loaded for rewrite: ${rewriteFiles}

INSTRUCTIONS:
1. If "Plan updated this turn" is YES:
   - DO NOT output the plan content.
   - DO NOT repeat the plan steps.
   - Confirm the action in one short sentence.
   - Add exactly one extra sentence summarizing what changed at a high level.
2. If "Plan updated this turn" is NO:
   - Answer the user's question directly based on context.
3. If there were errors, explain them briefly.
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
