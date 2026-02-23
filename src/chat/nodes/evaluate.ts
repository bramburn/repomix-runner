/**
 * evaluate node - Evaluates context and decides next action.
 */
import { z } from 'zod';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import {
  getApiKey,
  formatHistory,
  sliceSnippet,
  calculateGeminiCost,
  isLikelyPlanRequest,
  MAX_EVAL_LOOPS,
  type ProgressCallback,
} from './utils.js';

export async function evaluateNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (state.loopCount >= MAX_EVAL_LOOPS) {
    onProgress('Reached max search loops. Generating final response.');
    return { nextAction: 'ANSWER' as const };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn('Chat Graph: Missing API key, skipping evaluation.');
    return { nextAction: 'ANSWER' as const };
  }

  onProgress('Evaluating context and deciding next step...');

  const schema = z.object({
    reasoning: z.string().describe('Why you are making this decision.'),
    nextAction: z.enum(['SEARCH_MORE', 'REWRITE', 'ANSWER']),
    newQueries: z
      .array(z.string())
      .optional()
      .describe('Additional searches if snippets are insufficient.'),
    filesToUnlock: z
      .array(z.string())
      .optional()
      .describe('Relative file paths to read fully before rewriting.'),
  });

  const contextSummary = state.retrievedContext
    .slice(-30)
    .map((s) => `- ${s.filePath}: ${sliceSnippet(s.content ?? '', 200)}`)
    .join('\n');
  const historyStr = formatHistory(state.messages.slice(0, -1));

  const prompt = `
CURRENT PLAN (.repomix/plans):
${state.planContent || '(No plan exists yet)'}

Conversation History:
${historyStr || '(No prior conversation)'}

USER REQUEST:
"${state.userQuery}"

AVAILABLE CONTEXT (snippets / promise):
${contextSummary || 'No snippets found.'}

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
    const { parsed, totalTokens, promptTokens, completionTokens } =
      await llmClient.generateStructured(apiKey, schema, prompt, 'EvalPlanDrivenContext');

    const baseMetrics = {
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
      loopCount: 1,
    };

    if (parsed.nextAction === 'SEARCH_MORE') {
      const newQueries = (parsed.newQueries ?? []).map((q) => q.trim()).filter(Boolean);
      if (newQueries.length > 0) {
        onProgress(`Searching deeper with ${newQueries.length} additional queries.`);
        return {
          ...baseMetrics,
          nextAction: 'SEARCH_MORE' as const,
          searchQueries: newQueries,
        };
      }
      return { ...baseMetrics, nextAction: 'ANSWER' as const };
    }

    if (parsed.nextAction === 'REWRITE') {
      const unlocked = [
        ...new Set((parsed.filesToUnlock ?? []).map((p) => p.trim()).filter(Boolean)),
      ];
      return {
        ...baseMetrics,
        nextAction: 'REWRITE' as const,
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
        nextAction: 'REWRITE' as const,
        filesToLoad: [],
        retryCount: 0,
        lastToolError: null,
        lastToolCall: null,
      };
    }

    return {
      ...baseMetrics,
      nextAction: 'ANSWER' as const,
    };
  } catch (error) {
    logger.both.error('Chat Graph: Evaluation failed, generating answer.', error);
    return { nextAction: 'ANSWER' as const, loopCount: 1 };
  }
}
