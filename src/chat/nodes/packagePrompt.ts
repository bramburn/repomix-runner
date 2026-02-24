/**
 * packagePrompt node - Assembles final prompt payload for batch submission.
 * Enhanced with context compression via manageContext (PRD 003).
 */
import { ChatState, type OutputInstruction } from '../state.js';
import { buildBatchPrompt } from '../prompts/outputInstructions.js';
import {
  countTokens,
  calculateBudget,
  isCompressionNeeded,
  createCompressionConfig,
  CLAUDE_OPUS_BUDGET,
} from '../compression/tokenBudget.js';
import { manageContext, buildCompressedContext } from '../compression/contextManager.js';
import { segmentsToSystemMessages } from '../compression/historySummarizer.js';
import type { ChatMessage } from '../compression/types.js';
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

/**
 * Convert state messages to ChatMessage format for compression.
 */
function stateToChatMessages(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): ChatMessage[] {
  return messages.map((m, i) => ({
    id: `msg-${i}`,
    role: m.role,
    content: m.content,
    tokenCount: countTokens(m.content),
  }));
}

export async function packagePromptNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback,
  apiKey?: string
) {
  onProgress('Assembling prompt package...');

  const outputInstruction = inferOutputInstruction(state.goalText);
  const modelWindow = state.modelContextWindow || CLAUDE_OPUS_BUDGET.contextWindow;
  const thresholdPercent = state.contextThresholdPercent || 80;
  const maxRecentMessages = state.maxRecentMessages || 10;

  // Build context files array from retrieved context
  let contextFiles = state.retrievedContext.map((ctx) => ({
    path: ctx.filePath,
    content: ctx.content,
  }));

  // --- PRD 003: Run contextManager before assembling final prompt ---
  // Check if total context exceeds threshold and compress if needed
  const allContentTokens =
    countTokens(state.goalText) +
    countTokens(state.repoArchitecture) +
    contextFiles.reduce((sum, f) => sum + countTokens(f.content), 0) +
    (state.messages || []).reduce((sum, m) => sum + countTokens(m.content), 0);

  let compressionApplied = state.compressionApplied || false;
  let compressedHistory = state.compressedHistory || [];

  if (isCompressionNeeded(allContentTokens, modelWindow, thresholdPercent)) {
    onProgress('Context exceeds threshold — compressing...');
    logger.both.info(
      `[packagePrompt] Context ${allContentTokens} tokens exceeds ` +
      `${thresholdPercent}% of ${modelWindow}. Running compression.`
    );

    try {
      const config = createCompressionConfig(
        thresholdPercent,
        maxRecentMessages,
        modelWindow,
        5 // messageGroupSize
      );

      const chatMessages = stateToChatMessages(state.messages || []);

      const compressionResult = await manageContext(
        {
          messages: chatMessages,
          contextFiles: contextFiles.map((f) => ({
            filePath: f.path,
            content: f.content,
          })),
          repoArchitecture: state.repoArchitecture,
          goalText: state.goalText,
        },
        config,
        apiKey || ''
      );

      if (compressionResult.compressionApplied) {
        // Update context files with compressed versions
        contextFiles = compressionResult.compressedFiles.map((cf) => ({
          path: cf.filePath,
          content: cf.compressedContent,
        }));

        compressedHistory = compressionResult.compressedHistory;
        compressionApplied = true;

        logger.both.info(
          `[packagePrompt] Compression saved ${compressionResult.savings.historyTokensSaved + compressionResult.savings.fileTokensSaved} tokens ` +
          `(history: ${compressionResult.savings.historyTokensSaved}, files: ${compressionResult.savings.fileTokensSaved})`
        );
        onProgress('Compression complete. Assembling package...');
      }
    } catch (error) {
      logger.both.warn(`[packagePrompt] Compression failed, using raw context: ${error}`);
    }
  }

  // Assemble the package payload
  const packagePayload = {
    goal: state.goalText,
    contextFiles,
    repoArchitecture: state.repoArchitecture,
    dependencies: state.dependencies,
    outputInstruction,
  };

  // Build the full prompt for reference/display
  const fullPrompt = buildBatchPrompt(packagePayload);

  // Final token budget validation
  const promptTokens = countTokens(fullPrompt);
  const budget = calculateBudget(modelWindow, thresholdPercent);

  if (promptTokens > budget.total) {
    logger.both.warn(
      `[packagePrompt] Prompt still exceeds budget after compression: ` +
      `${promptTokens} tokens > ${budget.total} budget.`
    );
  } else {
    logger.both.info(
      `[packagePrompt] Prompt token usage: ${promptTokens}/${budget.total} ` +
      `(${Math.round((promptTokens / budget.total) * 100)}% of budget)`
    );
  }

  onProgress(
    `Package ready (${outputInstruction} mode, ${promptTokens} tokens` +
    `${compressionApplied ? ', compressed' : ''}). Awaiting approval...`
  );

  return {
    packagePayload,
    compressionApplied,
    compressedHistory,
    currentTokenCount: promptTokens,
    workflowPhase: 'send_review' as const,
  };
}
