/**
 * generateResponse node - Generates the final response.
 */
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import * as llmClient from '../../agent/llmClient.js';
import {
  getApiKey,
  formatHistory,
  sliceSnippet,
  calculateGeminiCost,
  type ProgressCallback,
} from './utils.js';

export async function generateResponseNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress('Formulating final response...');

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    const fallback = state.planUpdated
      ? `I updated the plan at ${state.planPath || '.repomix/plans'}.`
      : state.lastToolError
        ? `I could not apply the plan edit: ${state.lastToolError}`
        : state.retrievedContext.length
          ? `I found ${state.retrievedContext.length} relevant snippets:\n` +
            state.retrievedContext.map((s) => `- ${s.filePath}`).join('\n')
          : "I couldn't access an API key to generate a detailed response.";

    return {
      aiResponse: fallback,
      messages: [{ role: 'assistant', content: fallback }],
    };
  }

  const snippets = state.retrievedContext
    .slice(-25)
    .map((s) => `File: ${s.filePath}\n${sliceSnippet(s.content, 400)}`)
    .join('\n\n');

  const rewriteFiles = Object.keys(state.targetFileContents).join(', ') || 'None';
  const errorSummary = state.lastToolError
    ? `Last tool error: ${state.lastToolError}`
    : 'No tool errors.';
  const historyStr = formatHistory(state.messages.slice(0, -1));

  const prompt = `
You are Repomix Agent, an expert software architect.

User Query: "${state.userQuery}"

Conversation History:
${historyStr || '(No prior conversation)'}

STATUS:
- Plan updated this turn: ${state.planUpdated ? 'YES' : 'NO'}
- Plan path: ${state.planPath || '(unavailable)'}
- Errors: ${errorSummary}

CURRENT PLAN CONTENT (Hidden from user, for your reference only):
${sliceSnippet(state.planContent || '(No plan)', 5000)}

CONTEXT:
${snippets || 'No snippets found.'}

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
    'ChatResponse'
  );
  const resolvedTotalTokens = totalTokens || promptTokens + completionTokens;

  return {
    aiResponse: content,
    messages: [{ role: 'assistant', content }],
    tokensUsed: resolvedTotalTokens,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    costUsd: calculateGeminiCost(promptTokens, completionTokens),
  };
}
