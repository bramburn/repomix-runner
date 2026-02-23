/**
 * Shared utilities and constants for chat graph nodes.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionContext } from 'vscode';

// Constants
export const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
export const GEMINI_2_5_FLASH_INPUT_PER_M = 0.3;
export const GEMINI_2_5_FLASH_OUTPUT_PER_M = 2.5;
export const TOKENS_PER_MILLION = 1_000_000;
export const MAX_EVAL_LOOPS = 4;
export const MAX_EDIT_RETRIES = 3;
export const MAX_SNIPPET_CHARS = 1000;
export const MAX_FILE_CHARS_FOR_PLAN = 50000;

/**
 * Retrieved context item structure.
 */
export type RetrievedContextItem = {
  filePath: string;
  content: string;
  score: number;
  startLine?: number;
  endLine?: number;
};

/**
 * Plan edit call structure.
 */
export type PlanEditCall = {
  targetText: string;
  replacementText: string;
};

/**
 * Slices text to a maximum character count with ellipsis.
 */
export function sliceSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...`;
}

/**
 * Formats conversation history for prompts.
 */
export function formatHistory(
  messages: Array<{ role?: string; content?: string }>,
  maxCount = 10
): string {
  return messages
    .slice(-maxCount)
    .filter((m) => m.role !== 'system' && typeof m.content === 'string')
    .map((m) => `${String(m.role ?? 'unknown').toUpperCase()}: ${m.content}`)
    .join('\n');
}

/**
 * Checks if a user query is likely a plan request.
 */
export function isLikelyPlanRequest(userQuery: string): boolean {
  const query = userQuery.trim().toLowerCase();
  if (!query) {
    return false;
  }
  if (/^(hi|hello|hey|thanks|thank you|yo|sup)[!. ]*$/.test(query)) {
    return false;
  }
  return /\b(plan|roadmap|implementation|implement|build|create|add|update|change|refactor|improve|fix|migrate|feature|task|steps?)\b/.test(
    query
  );
}

/**
 * Calculates Gemini API cost based on tokens.
 */
export function calculateGeminiCost(promptTokens: number, completionTokens: number): number {
  const inputCost = (promptTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_INPUT_PER_M;
  const outputCost = (completionTokens / TOKENS_PER_MILLION) * GEMINI_2_5_FLASH_OUTPUT_PER_M;
  return inputCost + outputCost;
}

/**
 * Loads a code snippet from a file.
 */
export async function loadSnippet(
  repoRoot: string,
  filePath: string,
  startLine?: number,
  endLine?: number
): Promise<string> {
  const fullPath = path.resolve(repoRoot, filePath);
  if (!fullPath.startsWith(repoRoot + path.sep)) {
    return '';
  }
  if (!fs.existsSync(fullPath)) {
    return '';
  }
  const content = await fs.promises.readFile(fullPath, 'utf-8');
  if (!startLine || !endLine || startLine < 1 || endLine < startLine) {
    return sliceSnippet(content, MAX_SNIPPET_CHARS);
  }
  const lines = content.split(/\r?\n/);
  const slice = lines.slice(startLine - 1, endLine);
  return sliceSnippet(slice.join('\n'), MAX_SNIPPET_CHARS);
}

/**
 * Gets the Google Gemini API key from secrets.
 */
export async function getApiKey(extensionContext: ExtensionContext): Promise<string> {
  return (await extensionContext.secrets.get(SECRET_GOOGLE_GEMINI)) ?? '';
}

/**
 * Gets the workspace root folder path.
 */
export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

/**
 * Progress callback type for UI updates.
 */
export type ProgressCallback = (message: string) => void;
