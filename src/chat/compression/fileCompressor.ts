/**
 * Multi-level file compressor for context management.
 * PRD 003: Context Compression Strategy
 *
 * Compression Levels:
 * - Level 0: Full content (files < 200 tokens)
 * - Level 1: AST skeleton via compressFile()
 * - Level 2: Targeted extraction (specific symbols mentioned in goal)
 * - Level 3: LLM summary (unsupported languages or still too large)
 */

import { compressFileWithTokens, isSupportedExtension } from '../../core/compression/compressFile.js';
import { generateText } from '../../agent/llmClient.js';
import { countTokens } from './tokenBudget.js';
import type { CompressedFile, CompressionLevel } from './types.js';
import { extractTargetedSymbols, parseGoalForSymbols } from './targetedExtractor.js';
import { logger } from '../../shared/logger.js';

/** Threshold below which files are kept at full content (Level 0) */
const SMALL_FILE_THRESHOLD = 200;

/**
 * Compress a file using the appropriate compression level.
 *
 * @param filePath - Path to the file
 * @param content - File content
 * @param maxTokens - Maximum tokens allowed for this file
 * @param targetSymbols - Optional symbols to extract for Level 2
 * @param apiKey - Google API key for Level 3 LLM summary
 * @returns Compressed file result
 */
export async function compressFileForContext(
  filePath: string,
  content: string,
  maxTokens: number,
  targetSymbols?: string[],
  apiKey?: string
): Promise<CompressedFile> {
  const originalTokens = countTokens(content);

  // Level 0: Small files - keep full content
  if (originalTokens < SMALL_FILE_THRESHOLD) {
    return {
      filePath,
      originalContent: content,
      compressedContent: content,
      originalTokens,
      compressedTokens: originalTokens,
      compressionLevel: 0,
    };
  }

  // Level 1: Try AST compression for supported languages
  if (isSupportedExtension(filePath)) {
    const { compressed, tokenCount } = await compressFileWithTokens(filePath, content);

    if (compressed !== null) {
      // Check if compression actually helped
      if (tokenCount <= maxTokens) {
        return {
          filePath,
          originalContent: content,
          compressedContent: compressed,
          originalTokens,
          compressedTokens: tokenCount,
          compressionLevel: 1,
        };
      }

      // Level 2: Try targeted extraction if AST skeleton is still too large
      if (targetSymbols && targetSymbols.length > 0) {
        try {
          const targeted = await extractTargetedSymbols(filePath, content, targetSymbols);
          const targetedTokens = countTokens(targeted);

          if (targetedTokens <= maxTokens) {
            return {
              filePath,
              originalContent: content,
              compressedContent: targeted,
              originalTokens,
              compressedTokens: targetedTokens,
              compressionLevel: 2,
            };
          }
        } catch (error) {
          logger.both.warn(`Level 2 compression failed for ${filePath}: ${error}`);
        }
      }
    }
  }

  // Level 3: LLM summary as fallback
  if (apiKey) {
    try {
      const summary = await generateFileSummary(filePath, content, maxTokens, apiKey);
      const summaryTokens = countTokens(summary);

      return {
        filePath,
        originalContent: content,
        compressedContent: summary,
        originalTokens,
        compressedTokens: summaryTokens,
        compressionLevel: 3,
      };
    } catch (error) {
      logger.both.warn(`Level 3 compression failed for ${filePath}: ${error}`);
    }
  }

  // Fallback: Truncate to fit budget
  const truncated = truncateToTokenLimit(content, maxTokens);
  return {
    filePath,
    originalContent: content,
    compressedContent: truncated,
    originalTokens,
    compressedTokens: countTokens(truncated),
    compressionLevel: 3,
  };
}

/**
 * Generate an LLM summary of a file.
 */
async function generateFileSummary(
  filePath: string,
  content: string,
  maxTokens: number,
  apiKey: string
): Promise<string> {
  const prompt = `Summarize this code file in approximately ${Math.min(maxTokens, 200)} tokens.
Focus on:
- The file's purpose and main exports
- Key functions, classes, and interfaces
- Important dependencies and relationships

File: ${filePath}
\`\`\`
${truncateAtBoundary(content, 10000)}${content.length > 10000 ? '\n... (truncated)' : ''}
\`\`\`

Provide a concise technical summary.`;

  const { content: summary } = await generateText(apiKey, prompt, `File Summary: ${filePath}`);
  return `// Summary of ${filePath}\n${summary}`;
}

/**
 * Truncate content at a clean boundary (newline or space) to avoid
 * breaking words or UTF-8 characters.
 */
function truncateAtBoundary(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  // Look backward from maxLength to find newline or space
  for (let i = maxLength; i > Math.max(0, maxLength - 100); i--) {
    if (content[i] === '\n' || content[i] === ' ') {
      return content.slice(0, i);
    }
  }
  // No clean boundary found, slice at maxLength
  return content.slice(0, maxLength);
}

/**
 * Truncate content to fit within a token limit.
 */
function truncateToTokenLimit(content: string, maxTokens: number): string {
  const lines = content.split('\n');
  let result = '';
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line + '\n');
    if (currentTokens + lineTokens > maxTokens) {
      break;
    }
    result += line + '\n';
    currentTokens += lineTokens;
  }

  if (result.length < content.length) {
    result += '\n// ... (content truncated to fit token budget)';
  }

  return result;
}

/**
 * Compress multiple files for context, distributing budget among them.
 * Uses a two-pass allocation: first pass determines needs of small files,
 * second pass redistributes surplus to larger files.
 */
export async function compressFilesForContext(
  files: Array<{ filePath: string; content: string }>,
  totalBudget: number,
  goalText?: string,
  apiKey?: string
): Promise<CompressedFile[]> {
  if (files.length === 0) {
    return [];
  }

  const targetSymbols = goalText ? parseGoalForSymbols(goalText) : [];

  // Two-pass budget allocation:
  // Pass 1: Identify small files that need less than equal share
  const equalShare = Math.floor(totalBudget / files.length);
  const fileTokenCounts = files.map((f) => ({
    filePath: f.filePath,
    tokens: countTokens(f.content),
  }));

  let surplusBudget = 0;
  let largeFileCount = 0;

  for (const ftc of fileTokenCounts) {
    if (ftc.tokens < SMALL_FILE_THRESHOLD) {
      // Small file: will use Level 0 (full content), surplus goes to larger files
      surplusBudget += Math.max(0, equalShare - ftc.tokens);
    } else {
      largeFileCount++;
    }
  }

  // Pass 2: Redistribute surplus to large files
  const largeFileBudget =
    largeFileCount > 0
      ? equalShare + Math.floor(surplusBudget / largeFileCount)
      : equalShare;

  const results = await Promise.all(
    files.map((file) => {
      const tokens = countTokens(file.content);
      const budget = tokens < SMALL_FILE_THRESHOLD ? tokens : largeFileBudget;
      return compressFileForContext(
        file.filePath,
        file.content,
        budget,
        targetSymbols,
        apiKey
      );
    })
  );

  return results;
}

/**
 * Check if content appears to be binary.
 */
export function isBinaryContent(content: string): boolean {
  if (content.includes('\0')) {
    return true;
  }
  const nonPrintable = content.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g);
  if (nonPrintable && nonPrintable.length > content.length * 0.1) {
    return true;
  }
  return false;
}
