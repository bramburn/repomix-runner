/**
 * generateQueries node - Generates search queries from user request.
 */
import { z } from 'zod';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import {
  getApiKey,
  formatHistory,
  calculateGeminiCost,
  type ProgressCallback,
} from './utils.js';

export async function generateQueriesNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress('Analyzing request and generating search queries...');

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn('Chat Graph: Missing API key, using raw user query for search.');
    return { searchQueries: [state.userQuery] };
  }

  const schema = z.object({
    queries: z.array(z.string()).describe('List of 3-5 specific search queries'),
    reasoning: z.string().describe('Brief explanation of why these queries were chosen'),
  });

  const historyStr = formatHistory(state.messages.slice(0, -1));
  const prompt = `
User Request: "${state.userQuery}"

Conversation History:
${historyStr || '(No prior conversation)'}

You are an expert developer agent. Break down this request into specific code search queries.
Focus on finding definitions, architecture patterns, and specific filenames if mentioned.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } =
      await llmClient.generateStructured(apiKey, schema, prompt, 'GenerateChatQueries');

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
    logger.both.error('Chat Graph: Failed to generate queries, falling back to raw input.', error);
    return { searchQueries: [state.userQuery] };
  }
}
