import { ChatState } from "./state";
import { logger } from "../shared/logger";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getVectorDbAdapterForRepo } from "../core/indexing/vectorDb/factory.js";
import { embeddingService } from "../core/indexing/embeddingService.js";
import { getRepoId } from "../utils/repoIdentity.js";

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

async function loadSnippet(repoRoot: string, filePath: string, startLine?: number, endLine?: number) {
  const fullPath = path.join(repoRoot, filePath);
  if (!fs.existsSync(fullPath)) return "";
  const content = await fs.promises.readFile(fullPath, "utf-8");
  if (!startLine || !endLine || startLine < 1 || endLine < startLine) {
    return sliceSnippet(content, 400);
  }
  const lines = content.split(/\r?\n/);
  const slice = lines.slice(startLine - 1, endLine);
  return sliceSnippet(slice.join("\n"), 400);
}

/**
 * Retrieval node that searches the vector database for relevant code.
 */
export async function vectorSearchNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext
) {
  const query = (state.userQuery ?? "").trim();
  if (!query) return { retrievedContext: [] };

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
    const vector = await embeddingService.embedText(query, "chat", true);
    const results = await adapter.queryVectors({
      repoId,
      vector,
      topK: 5,
      groupBy: "filePath",
      groupSize: 1,
    });

    const matches = results.groupedMatches?.length
      ? results.groupedMatches
      : results.matches;

    const retrievedContext: RetrievedContextItem[] = [];
    for (const match of matches) {
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

    logger.both.info(`Chat Graph: Retrieved ${retrievedContext.length} snippets.`);
    return { retrievedContext };
  } catch (error) {
    logger.both.error("Chat Graph: Vector search failed", error);
    return { retrievedContext: [] };
  }
}

/**
 * Hello World node that echoes the user's input.
 * This is a simple demonstration node for the chat graph.
 */
export async function helloWorldNode(state: typeof ChatState.State) {
  logger.both.info(`Chat Graph Received: ${state.userQuery}`);

  let response = `Hello World! I received: "${state.userQuery}"`;
  if (state.retrievedContext.length > 0) {
    response += `\n\nI found ${state.retrievedContext.length} relevant snippets:\n`;
    response += state.retrievedContext
      .slice(0, 3)
      .map((item, index) => {
        const lineInfo =
          item.startLine && item.endLine ? ` (lines ${item.startLine}-${item.endLine})` : "";
        const snippet = item.content ? `\n\`\`\`\n${item.content}\n\`\`\`` : "";
        return `\n[${index + 1}] ${item.filePath}${lineInfo}${snippet}`;
      })
      .join("\n");
  } else {
    response += `\n\nI searched the workspace but didn't find relevant snippets.`;
  }

  const fakeTokensUsed = 42900;
  const fakeCostUsd = 0.18;

  return {
    aiResponse: response,
    messages: [{ role: "assistant", content: response }],
    tokensUsed: fakeTokensUsed,
    costUsd: fakeCostUsd,
  };
}
