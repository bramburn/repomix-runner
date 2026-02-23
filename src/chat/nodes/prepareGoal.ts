/**
 * prepareGoal node - Gemini synthesizes a goal from user query + context.
 */
import type { ExtensionContext } from 'vscode';
import type { Pool } from 'pg';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import { buildGoalPrompt, parseGoalResponse } from '../prompts/goalPrompt.js';
import { getApiKey, calculateGeminiCost, type ProgressCallback } from './utils.js';
import { MemoryManager } from '../memory/memoryManager.js';
import { injectMemories } from '../memory/memoryInjector.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getCwd } from '../../config/getCwd.js';

export async function prepareGoalNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  pgPool: Pool,
  onProgress: ProgressCallback
) {
  onProgress('Synthesizing goal from request and context...');

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn('prepareGoal: Missing API key, using raw user query as goal.');
    return {
      goalText: state.userQuery,
      workflowPhase: 'goal_review' as const,
    };
  }

  // Inject relevant memories (PRD 004)
  let memoryContext = '';
  try {
    const repoId = await getRepoId(getCwd());
    const memoryManager = new MemoryManager(pgPool);
    memoryContext = await injectMemories(state.threadId, repoId, memoryManager);
    if (memoryContext) {
      logger.both.debug('prepareGoal: Injecting memory context');
    }
  } catch (error) {
    logger.both.warn('prepareGoal: Memory injection failed (non-blocking):', error);
  }

  const prompt = buildGoalPrompt({
    userQuery: state.userQuery,
    retrievedContext: state.retrievedContext,
    repoArchitecture: state.repoArchitecture,
    dependencies: state.dependencies,
    memoryContext,
  });

  try {
    const { content, totalTokens, promptTokens, completionTokens } = await llmClient.generateText(
      apiKey,
      prompt,
      'PrepareGoal'
    );

    const parsed = parseGoalResponse(content);

    onProgress('Goal synthesized. Awaiting review...');

    return {
      goalText: parsed.goalText,
      workflowPhase: 'goal_review' as const,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    logger.both.error('prepareGoal: Goal synthesis failed', error);
    return {
      goalText: state.userQuery,
      workflowPhase: 'goal_review' as const,
    };
  }
}
