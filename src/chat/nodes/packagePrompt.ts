/**
 * packagePrompt node - Assembles final prompt payload for batch submission.
 * Enhanced with token budget validation (PRD 003).
 */
import { ChatState, type OutputInstruction } from '../state.js';
import { buildBatchPrompt } from '../prompts/outputInstructions.js';
import { countTokens, calculateBudget, CLAUDE_OPUS_BUDGET } from '../compression/tokenBudget.js';
import { logger } from '../../shared/logger.js';
import type { ProgressCallback } from './utils.js';

/**
 * Infers the output instruction type from the goal text.
 */
function inferOutputInstruction(goalText: string): OutputInstruction {
  const lowerGoal = goalText.toLowerCase();

  if (
    lowerGoal.includes('plan') ||
    lowerGoal.includes('roadmap') ||
    lowerGoal.includes('strategy')
  ) {
    return 'plan';
  }

  if (
    lowerGoal.includes('review') ||
    lowerGoal.includes('audit') ||
    lowerGoal.includes('check')
  ) {
    return 'code_review';
  }

  // Default to code_change for implementation tasks
  return 'code_change';
}

export async function packagePromptNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  onProgress('Assembling prompt package...');

  const outputInstruction = inferOutputInstruction(state.goalText);

  // Build context files array from retrieved context
  const contextFiles = state.retrievedContext.map((ctx) => ({
    path: ctx.filePath,
    content: ctx.content,
  }));

  // Assemble the package payload
  const packagePayload = {
    goal: state.goalText,
    contextFiles,
    repoArchitecture: state.repoArchitecture,
    dependencies: state.dependencies,
    outputInstruction,
  };

  // Also build the full prompt for reference/display
  const fullPrompt = buildBatchPrompt(packagePayload);

  // Token budget validation (PRD 003)
  const promptTokens = countTokens(fullPrompt);
  const modelWindow = state.modelContextWindow || CLAUDE_OPUS_BUDGET.contextWindow;
  const budget = calculateBudget(modelWindow, state.contextThresholdPercent || 80);

  if (promptTokens > budget.total) {
    logger.both.warn(
      `[packagePrompt] Prompt exceeds budget: ${promptTokens} tokens > ${budget.total} budget. ` +
      `Compression may not have been sufficient.`
    );
  } else {
    logger.both.info(
      `[packagePrompt] Prompt token usage: ${promptTokens}/${budget.total} ` +
      `(${Math.round((promptTokens / budget.total) * 100)}% of budget)`
    );
  }

  onProgress(`Package ready (${outputInstruction} mode, ${promptTokens} tokens). Awaiting approval...`);

  return {
    packagePayload,
    workflowPhase: 'send_review' as const,
  };
}
