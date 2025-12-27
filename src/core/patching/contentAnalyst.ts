import { distance } from 'fastest-levenshtein';
import { MatchResult } from './types.js';

// Threshold: 0 to 1. 1.0 is exact match. 
// 0.8 allows for minor whitespace/char differences.
const SIMILARITY_THRESHOLD = 0.85;

/**
 * Scans the file content to find the best fuzzy match for the search block.
 */
export function locatePatch(fileContent: string, searchBlock: string): MatchResult | null {
  const fileLines = fileContent.split('\n');
  const searchLines = searchBlock.split('\n');
  
  // If search block is empty, we can't really match anything meaningfully
  if (searchLines.length === 0 || searchBlock.trim() === '') {
    return null;
  }

  const searchHeight = searchLines.length;
  let bestScore = -1;
  let bestMatch: MatchResult | null = null;

  // Sliding window approach
  for (let i = 0; i <= fileLines.length - searchHeight; i++) {
    // Extract the window from the file
    const windowLines = fileLines.slice(i, i + searchHeight);
    const windowText = windowLines.join('\n');
    
    // Calculate similarity
    const dist = distance(windowText, searchBlock);
    const maxLen = Math.max(windowText.length, searchBlock.length);
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
    }
  }

  // Only return if it meets our confidence threshold
  if (bestScore >= SIMILARITY_THRESHOLD && bestMatch) {
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