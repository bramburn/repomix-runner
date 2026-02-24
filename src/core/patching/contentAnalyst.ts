import { distance } from 'fastest-levenshtein';
import { MatchResult } from './types.js';

// Default threshold: 0 to 1. 1.0 is exact match.
// 0.85 allows for minor whitespace/char differences.
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

// Number of windows to process before yielding to the event loop
const DEFAULT_CHUNK_SIZE = 100;

/**
 * Normalizes whitespace in text for better fuzzy matching.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/[ \t]+/g, ' ')   // Collapse multiple spaces/tabs to single space
    .trim();
}

/**
 * Quick pre-filter to skip windows that couldn't possibly match.
 * This avoids expensive Levenshtein calculations for obviously different windows.
 */
function quickCanMatch(windowLines: string[], searchLines: string[]): boolean {
  // Quick length check - windows should be same length as search
  if (windowLines.length !== searchLines.length) {
    return false;
  }

  // If search block is very small, skip additional filtering
  if (searchLines.length <= 2) {
    return true;
  }

  // Check first non-empty line starts with same character
  const windowFirstNonEmpty = windowLines.find(l => l.trim().length > 0);
  const searchFirstNonEmpty = searchLines.find(l => l.trim().length > 0);

  if (windowFirstNonEmpty && searchFirstNonEmpty) {
    const windowFirstChar = windowFirstNonEmpty.trim()[0];
    const searchFirstChar = searchFirstNonEmpty.trim()[0];
    // Allow match if both start with same character (common for code: function, class, etc.)
    if (windowFirstChar !== searchFirstChar) {
      return false;
    }
  }

  return true;
}

/**
 * Scans the file content to find the best fuzzy match for the search block.
 * Uses async processing with event loop yielding to prevent UI blocking on large files.
 */
export async function locatePatch(
  fileContent: string,
  searchBlock: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
  options?: { chunkSize?: number; onProgress?: (progress: number) => void }
): Promise<MatchResult | null> {
  const fileLines = fileContent.split('\n');
  const searchLines = searchBlock.split('\n');
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;

  // If search block is empty, we can't really match anything meaningfully
  if (searchLines.length === 0 || searchBlock.trim() === '') {
    return null;
  }

  const searchHeight = searchLines.length;
  let bestScore = -1;
  let bestMatch: MatchResult | null = null;

  // Pre-normalize search block once
  const normalizedSearch = normalizeWhitespace(searchBlock);

  // Calculate total iterations for progress reporting
  const totalIterations = Math.max(0, fileLines.length - searchHeight + 1);
  let processedCount = 0;

  // Sliding window approach with chunking
  for (let i = 0; i <= fileLines.length - searchHeight; i++) {
    // Extract the window from the file
    const windowLines = fileLines.slice(i, i + searchHeight);

    // Quick pre-filter to skip expensive calculations
    if (!quickCanMatch(windowLines, searchLines)) {
      processedCount++;
      continue;
    }

    const windowText = windowLines.join('\n');

    // Calculate similarity using normalized text for better matching
    const normalizedWindow = normalizeWhitespace(windowText);

    const dist = distance(normalizedWindow, normalizedSearch);
    const maxLen = Math.max(normalizedWindow.length, normalizedSearch.length);
    const score = 1 - (dist / maxLen);

    if (score > bestScore) {
      bestScore = score;

      // Determine indentation of the first line of the match
      const firstLine = windowLines[0];
      const indentMatch = firstLine.match(/^\s*/);
      const indentation = indentMatch ? indentMatch[0] : '';

      bestMatch = {
        startLine: i,
        endLine: i + searchHeight - 1,
        indentation,
        score
      };

      // Early termination: exact match found
      if (score === 1.0) {
        return bestMatch;
      }
    }

    processedCount++;

    // Yield to event loop periodically to prevent blocking
    if (processedCount % chunkSize === 0) {
      // Report progress if callback provided
      if (options?.onProgress) {
        options.onProgress(processedCount / totalIterations);
      }
      // Yield to event loop
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  // Report completion
  if (options?.onProgress) {
    options.onProgress(1.0);
  }

  // Only return if it meets our confidence threshold
  if (bestScore >= threshold && bestMatch) {
    return bestMatch;
  }

  return null;
}

/**
 * Synchronous version for backward compatibility with small files.
 * Use this when you know the file is small (< 100 lines) and want to avoid async overhead.
 */
export function locatePatchSync(
  fileContent: string,
  searchBlock: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): MatchResult | null {
  const fileLines = fileContent.split('\n');
  const searchLines = searchBlock.split('\n');

  // If search block is empty, we can't really match anything meaningfully
  if (searchLines.length === 0 || searchBlock.trim() === '') {
    return null;
  }

  const searchHeight = searchLines.length;
  let bestScore = -1;
  let bestMatch: MatchResult | null = null;

  // Pre-normalize search block once
  const normalizedSearch = normalizeWhitespace(searchBlock);

  // Sliding window approach
  for (let i = 0; i <= fileLines.length - searchHeight; i++) {
    // Extract the window from the file
    const windowLines = fileLines.slice(i, i + searchHeight);

    // Quick pre-filter to skip expensive calculations
    if (!quickCanMatch(windowLines, searchLines)) {
      continue;
    }

    const windowText = windowLines.join('\n');

    // Calculate similarity using normalized text for better matching
    const normalizedWindow = normalizeWhitespace(windowText);

    const dist = distance(normalizedWindow, normalizedSearch);
    const maxLen = Math.max(normalizedWindow.length, normalizedSearch.length);
    const score = 1 - (dist / maxLen);

    if (score > bestScore) {
      bestScore = score;

      // Determine indentation of the first line of the match
      const firstLine = windowLines[0];
      const indentMatch = firstLine.match(/^\s*/);
      const indentation = indentMatch ? indentMatch[0] : '';

      bestMatch = {
        startLine: i,
        endLine: i + searchHeight - 1,
        indentation,
        score
      };

      // Early termination: exact match found
      if (score === 1.0) {
        return bestMatch;
      }
    }
  }

  // Only return if it meets our confidence threshold
  if (bestScore >= threshold && bestMatch) {
    return bestMatch;
  }

  return null;
}

/**
 * Adjusts the replacement block to match the indentation of the found context.
 * * @param replaceBlock The raw replacement text from the LLM
 * @param targetIndentation The indentation string found in the actual file (e.g. "    ")
 */
export function repairIndentation(replaceBlock: string, targetIndentation: string): string {
  if (!targetIndentation) {
    return replaceBlock;
  }

  const lines = replaceBlock.split('\n');
  
  // Heuristic: If the replace block already looks like it starts with the target indentation,
  // we might not want to double-indent. 
  // However, usually LLMs output the block starting at 0 indent relative to the snippet.
  // We blindly apply the target indentation to all lines that aren't empty.
  
  const indentedLines = lines.map(line => {
    if (line.trim().length === 0) {
      return line; // Don't indent empty lines
    }
    return targetIndentation + line;
  });

  return indentedLines.join('\n');
}