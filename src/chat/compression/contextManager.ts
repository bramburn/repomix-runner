/**
 * Context manager orchestrator.
 * PRD 003: Context Compression Strategy
 *
 * Main orchestrator that monitors token usage against a configurable threshold
 * and triggers compression when needed (reactive mode).
 */

import { countTokens, calculateBudget, isCompressionNeeded, allocateFileBudget } from './tokenBudget.js';
import { summarizeHistory, segmentsToSystemMessages } from './historySummarizer.js';
import { compressFilesForContext, isBinaryContent } from './fileCompressor.js';
import type {
  CompressionConfig,
  CompressionResult,
  CompressedFile,
  CompressedSegment,
  ChatMessage,
  TokenBudget,
} from './types.js';
import { logger } from '../../shared/logger.js';

/**
 * Manage context compression for a workflow state.
 *
 * This is the main entry point for compression. It:
 * 1. Calculates current token usage
 * 2. Checks if compression is needed (reactive trigger)
 * 3. If needed, orchestrates history + file compression
 * 4. Returns compression results
 *
 * @param params - Context to compress
 * @param config - Compression configuration
 * @param apiKey - Google API key for Gemini Flash
 * @returns Compression results with updated content
 */
export async function manageContext(
  params: {
    messages: ChatMessage[];
    contextFiles: Array<{ filePath: string; content: string }>;
    repoArchitecture: string;
    goalText?: string;
    systemPrompt?: string;
  },
  config: CompressionConfig,
  apiKey: string
): Promise<CompressionResult> {
  const { messages, contextFiles, repoArchitecture, goalText, systemPrompt } = params;

  // Calculate current total token count
  const systemPromptTokens = countTokens(systemPrompt ?? '');
  const historyTokens = messages.reduce((sum, m) => sum + countTokens(m.content), 0);
  const fileTokens = contextFiles.reduce((sum, f) => sum + countTokens(f.content), 0);
  const architectureTokens = countTokens(repoArchitecture);
  const goalTokens = countTokens(goalText ?? '');
  const currentTotalTokens =
    systemPromptTokens + historyTokens + fileTokens + architectureTokens + goalTokens;

  logger.both.info(
    `[ContextManager] Current tokens: ${currentTotalTokens} ` +
    `(history: ${historyTokens}, files: ${fileTokens}, arch: ${architectureTokens})`
  );

  // Check if compression is needed (reactive trigger)
  if (!isCompressionNeeded(currentTotalTokens, config.modelContextWindow, config.contextThresholdPercent)) {
    logger.both.info('[ContextManager] Compression not needed, within threshold.');
    return {
      compressedHistory: [],
      compressedFiles: contextFiles.map((f) => ({
        filePath: f.filePath,
        originalContent: f.content,
        compressedContent: f.content,
        originalTokens: countTokens(f.content),
        compressedTokens: countTokens(f.content),
        compressionLevel: 0 as const,
      })),
      totalTokens: currentTotalTokens,
      compressionApplied: false,
      savings: { historyTokensSaved: 0, fileTokensSaved: 0 },
    };
  }

  logger.both.info(
    `[ContextManager] Compression triggered at ${currentTotalTokens} tokens ` +
    `(threshold: ${config.contextThresholdPercent}% of ${config.modelContextWindow})`
  );

  // Calculate token budget
  const budget = calculateBudget(config.modelContextWindow, config.contextThresholdPercent);

  // --- History Compression ---
  let compressedHistory: CompressedSegment[] = [];
  let historyTokensSaved = 0;

  if (historyTokens > budget.conversationSummaries + budget.recentMessages) {
    logger.both.info('[ContextManager] Compressing conversation history...');
    const historyResult = await summarizeHistory(
      messages,
      config.maxRecentMessages,
      config.messageGroupSize,
      budget.conversationSummaries,
      apiKey
    );
    compressedHistory = historyResult.summaries;

    const compressedHistoryTokens =
      compressedHistory.reduce((sum, s) => sum + s.tokenCount, 0) +
      historyResult.recentMessages.reduce((sum, m) => sum + countTokens(m.content), 0);

    historyTokensSaved = Math.max(0, historyTokens - compressedHistoryTokens);
    logger.both.info(`[ContextManager] History compressed: saved ${historyTokensSaved} tokens`);
  }

  // --- File Compression ---
  let compressedFiles: CompressedFile[] = [];
  let fileTokensSaved = 0;

  // Filter out binary content
  const textFiles = contextFiles.filter((f) => !isBinaryContent(f.content));

  if (textFiles.length > 0) {
    logger.both.info(`[ContextManager] Compressing ${textFiles.length} context files...`);
    compressedFiles = await compressFilesForContext(
      textFiles,
      budget.fileContext,
      goalText,
      apiKey
    );

    const compressedFileTokens = compressedFiles.reduce((sum, f) => sum + f.compressedTokens, 0);
    fileTokensSaved = Math.max(0, fileTokens - compressedFileTokens);
    logger.both.info(`[ContextManager] Files compressed: saved ${fileTokensSaved} tokens`);
  }

  // Calculate final total
  const compressedHistoryTotal = compressedHistory.reduce((sum, s) => sum + s.tokenCount, 0);
  const recentMessagesTotal = messages
    .slice(Math.max(0, messages.length - config.maxRecentMessages))
    .reduce((sum, m) => sum + countTokens(m.content), 0);
  const compressedFilesTotal = compressedFiles.reduce((sum, f) => sum + f.compressedTokens, 0);
  const totalTokens =
    systemPromptTokens + compressedHistoryTotal + recentMessagesTotal +
    compressedFilesTotal + architectureTokens + goalTokens;

  logger.both.info(
    `[ContextManager] Compression complete. ` +
    `Before: ${currentTotalTokens}, After: ${totalTokens}, ` +
    `Saved: ${currentTotalTokens - totalTokens} tokens`
  );

  return {
    compressedHistory,
    compressedFiles,
    totalTokens,
    compressionApplied: true,
    savings: {
      historyTokensSaved,
      fileTokensSaved,
    },
  };
}

/**
 * Build a compressed context array suitable for prompt assembly.
 * Merges summaries and recent messages in chronological order.
 */
export function buildCompressedContext(
  summaries: CompressedSegment[],
  recentMessages: ChatMessage[]
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  // Add summaries first (as system messages)
  for (const segment of summaries) {
    result.push({ role: 'system', content: segment.summary });
  }

  // Add recent messages
  for (const msg of recentMessages) {
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}
