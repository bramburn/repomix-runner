/**
 * Token budget calculator and allocator.
 * PRD 003: Context Compression Strategy
 */

import { encode } from 'gpt-tokenizer';
import type { TokenBudget, ModelBudgetConfig, CompressionConfig } from './types.js';

/**
 * Count tokens in a text string using gpt-tokenizer.
 * Falls back to character-based estimation if encoding fails.
 */
export function countTokens(text: string): number {
  if (!text) {
    return 0;
  }
  try {
    return encode(text).length;
  } catch {
    // Fallback: estimate ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in multiple texts and return the total.
 */
export function countTokensMultiple(texts: string[]): number {
  return texts.reduce((sum, text) => sum + countTokens(text), 0);
}

// --- Model-Specific Budget Configurations ---

/**
 * Budget configuration for Gemini 2.5 Flash (interactive chat).
 */
export const GEMINI_FLASH_BUDGET: ModelBudgetConfig = {
  modelId: 'gemini-2.5-flash',
  contextWindow: 1_000_000, // 1M tokens
  allocations: {
    systemPrompt: 2000,
    outputBuffer: 8000,
    conversationHistory: 0.15, // 15%
    recentMessages: 0.25, // 25%
    fileContext: 0.55, // 55%
    repoArchitecture: 1000,
  },
};

/**
 * Budget configuration for Claude Opus 4 (batch processing).
 */
export const CLAUDE_OPUS_BUDGET: ModelBudgetConfig = {
  modelId: 'claude-opus-4',
  contextWindow: 200_000, // 200K tokens
  allocations: {
    systemPrompt: 2000,
    outputBuffer: 16000,
    conversationHistory: 0.10, // 10%
    recentMessages: 0.20, // 20%
    fileContext: 0.65, // 65%
    repoArchitecture: 1000,
  },
};

/**
 * Get model budget config by model ID.
 */
export function getModelBudgetConfig(modelId: string): ModelBudgetConfig {
  switch (modelId) {
    case 'gemini-2.5-flash':
    case 'gemini-flash':
      return GEMINI_FLASH_BUDGET;
    case 'claude-opus-4':
    case 'claude-opus':
      return CLAUDE_OPUS_BUDGET;
    default:
      // Default to Claude Opus (more conservative)
      return CLAUDE_OPUS_BUDGET;
  }
}

/**
 * Calculate token budget allocation based on model context window and threshold.
 *
 * @param modelContextWindow - Maximum context window in tokens
 * @param thresholdPercent - Percentage of context window to use (default 80)
 * @param modelConfig - Optional model-specific budget configuration
 * @returns Token budget allocation for each category
 */
export function calculateBudget(
  modelContextWindow: number,
  thresholdPercent: number = 80,
  modelConfig?: ModelBudgetConfig
): TokenBudget {
  // Use provided config or default to Claude Opus (conservative)
  const config = modelConfig ?? CLAUDE_OPUS_BUDGET;

  // Calculate total available tokens after threshold
  const total = Math.floor((modelContextWindow * thresholdPercent) / 100);

  // Fixed allocations
  const systemPrompt = config.allocations.systemPrompt;
  const outputReserve = config.allocations.outputBuffer;
  const repoArchitecture = config.allocations.repoArchitecture;

  // Remaining budget after fixed allocations
  const remaining = total - systemPrompt - outputReserve - repoArchitecture;

  // Percentage-based allocations from remaining
  const conversationSummaries = Math.floor(remaining * config.allocations.conversationHistory);
  const recentMessages = Math.floor(remaining * config.allocations.recentMessages);
  const fileContext = Math.floor(remaining * config.allocations.fileContext);

  return {
    total,
    systemPrompt,
    conversationSummaries,
    recentMessages,
    fileContext,
    outputReserve,
  };
}

/**
 * Calculate per-file budget allocation.
 *
 * @param totalFileBudget - Total tokens available for file context
 * @param fileCount - Number of files to allocate budget for
 * @param minPerFile - Minimum tokens per file (default 100)
 * @returns Tokens allocated per file
 */
export function allocateFileBudget(
  totalFileBudget: number,
  fileCount: number,
  minPerFile: number = 100
): number {
  if (fileCount <= 0) {
    return 0;
  }

  const perFile = Math.floor(totalFileBudget / fileCount);

  // Ensure minimum allocation
  return Math.max(perFile, minPerFile);
}

/**
 * Check if compression is needed based on current token usage.
 *
 * @param currentTokens - Current total token count
 * @param contextWindow - Model's context window size
 * @param thresholdPercent - Threshold percentage that triggers compression
 * @returns True if compression should be applied
 */
export function isCompressionNeeded(
  currentTokens: number,
  contextWindow: number,
  thresholdPercent: number
): boolean {
  const threshold = Math.floor((contextWindow * thresholdPercent) / 100);
  return currentTokens >= threshold;
}

/**
 * Calculate token savings from compression.
 *
 * @param originalTokens - Original token count
 * @param compressedTokens - Compressed token count
 * @returns Token savings (positive number) or 0 if no savings
 */
export function calculateSavings(originalTokens: number, compressedTokens: number): number {
  return Math.max(0, originalTokens - compressedTokens);
}

/**
 * Calculate compression ratio.
 *
 * @param originalTokens - Original token count
 * @param compressedTokens - Compressed token count
 * @returns Ratio as a decimal (0.0 to 1.0, where 0.5 means 50% reduction)
 */
export function calculateCompressionRatio(
  originalTokens: number,
  compressedTokens: number
): number {
  if (originalTokens <= 0) {
    return 0;
  }
  return 1 - compressedTokens / originalTokens;
}

/**
 * Create a default compression config with VS Code settings.
 */
export function createCompressionConfig(
  contextThresholdPercent: number = 80,
  maxRecentMessages: number = 10,
  modelContextWindow: number = 200_000,
  messageGroupSize: number = 5
): CompressionConfig {
  return {
    contextThresholdPercent,
    maxRecentMessages,
    modelContextWindow,
    messageGroupSize,
  };
}
