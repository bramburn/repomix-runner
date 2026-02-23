/**
 * compressContext node - Token-aware context compression.
 * PRD 003: Context Compression Strategy
 *
 * Sits between gatherContext and prepareGoal in the HITL workflow.
 * Checks if token usage exceeds the configured threshold and applies
 * multi-level compression (history summarization + file compression).
 */

import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { manageContext } from '../compression/contextManager.js';
import { createCompressionConfig, countTokens } from '../compression/tokenBudget.js';
import type { CompressionConfig } from '../compression/types.js';
import { logger } from '../../shared/logger.js';
import { getApiKey, type ProgressCallback } from './utils.js';

/**
 * Read compression settings from VS Code configuration.
 */
function getCompressionSettings(): { thresholdPercent: number; maxRecentMessages: number } {
  const config = vscode.workspace.getConfiguration('repomix.chat');
  return {
    thresholdPercent: config.get<number>('contextThresholdPercent', 80),
    maxRecentMessages: config.get<number>('maxRecentMessages', 10),
  };
}

/**
 * compressContext graph node.
 *
 * Evaluates current token usage and applies compression if the threshold
 * is exceeded. Uses reactive compression (only triggers when needed).
 */
export async function compressContextNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress('Evaluating context size...');

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn('compressContext: No API key, skipping compression.');
    return {
      compressionApplied: false,
      currentTokenCount: 0,
    };
  }

  // Read settings
  const settings = getCompressionSettings();
  const modelContextWindow = state.modelContextWindow || 200_000;

  const compressionConfig: CompressionConfig = createCompressionConfig(
    state.contextThresholdPercent || settings.thresholdPercent,
    state.maxRecentMessages || settings.maxRecentMessages,
    modelContextWindow,
    5 // messageGroupSize
  );

  // Convert state messages to the format expected by contextManager
  const chatMessages = (state.messages || []).map((m, i) => ({
    id: `msg-${i}`,
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    tokenCount: countTokens(m.content),
  }));

  // Convert retrieved context to file format
  const contextFiles = (state.retrievedContext || []).map((ctx) => ({
    filePath: ctx.filePath,
    content: ctx.content,
  }));

  // Run context manager
  const result = await manageContext(
    {
      messages: chatMessages,
      contextFiles,
      repoArchitecture: state.repoArchitecture || '',
      goalText: state.goalText || state.userQuery || '',
    },
    compressionConfig,
    apiKey
  );

  if (!result.compressionApplied) {
    onProgress('Context within budget, no compression needed.');
    return {
      compressionApplied: false,
      currentTokenCount: result.totalTokens,
    };
  }

  // Update retrieved context with compressed versions
  const compressedRetrievedContext = result.compressedFiles.map((cf) => {
    // Find the original context item to preserve score and line info
    const original = (state.retrievedContext || []).find(
      (ctx) => ctx.filePath === cf.filePath
    );
    return {
      filePath: cf.filePath,
      content: cf.compressedContent,
      score: original?.score ?? 0,
      startLine: original?.startLine,
      endLine: original?.endLine,
    };
  });

  const totalSaved = result.savings.historyTokensSaved + result.savings.fileTokensSaved;
  onProgress(
    `Context compressed: saved ${totalSaved} tokens ` +
    `(history: ${result.savings.historyTokensSaved}, files: ${result.savings.fileTokensSaved})`
  );

  return {
    retrievedContext: compressedRetrievedContext,
    compressedHistory: result.compressedHistory,
    compressionApplied: true,
    currentTokenCount: result.totalTokens,
  };
}
