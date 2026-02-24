/**
 * Targeted symbol extraction for Level 2 compression.
 * PRD 003: Context Compression Strategy
 *
 * Extracts only the functions, classes, and types mentioned in the goal text
 * from a source file, reducing token usage while preserving relevance.
 */

/**
 * Parse goal text to identify potential symbol names (functions, classes, types).
 *
 * @param goalText - The user's goal or task description
 * @returns Array of symbol names found in the goal
 */
export function parseGoalForSymbols(goalText: string): string[] {
  if (!goalText) {
    return [];
  }

  // Match identifiers: PascalCase, camelCase, snake_case
  const identifierPattern = /\b([A-Z][a-zA-Z0-9]+|[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+|[a-z]+[A-Z][a-zA-Z0-9]*)\b/g;
  const matches = goalText.match(identifierPattern) || [];

  // Also match backtick-quoted identifiers (e.g., `myFunction`)
  const backtickPattern = /`([a-zA-Z_][a-zA-Z0-9_]*)`/g;
  let backtickMatch: RegExpExecArray | null;
  while ((backtickMatch = backtickPattern.exec(goalText)) !== null) {
    matches.push(backtickMatch[1]);
  }

  // Filter out common English words that happen to match patterns
  const commonWords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'will',
    'should', 'could', 'would', 'make', 'like', 'just', 'when', 'what',
    'which', 'about', 'into', 'file', 'code', 'function', 'class', 'method',
    'type', 'interface', 'implement', 'create', 'update', 'delete', 'add',
    'remove', 'change', 'fix', 'bug', 'feature', 'test', 'use', 'using',
    'need', 'want', 'each', 'also', 'then', 'than', 'some', 'only',
    'after', 'before', 'between', 'because', 'through',
  ]);

  const unique = [...new Set(matches)].filter(
    (m) => m.length > 2 && !commonWords.has(m.toLowerCase())
  );

  return unique;
}

/**
 * Extract targeted symbols and their surrounding context from a source file.
 *
 * @param filePath - Path to the file (for header comment)
 * @param content - Full file content
 * @param symbols - Symbol names to search for
 * @returns Extracted content containing only relevant sections
 */
export async function extractTargetedSymbols(
  filePath: string,
  content: string,
  symbols: string[]
): Promise<string> {
  if (!symbols.length) {
    return extractImportsAndExports(content);
  }

  const lines = content.split('\n');
  const relevantLineSet = new Set<number>();
  const contextRadius = 5; // lines of context around each match

  // Always include imports (first N lines that are imports)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export type') ||
      trimmed.startsWith('export interface') ||
      trimmed.startsWith('from ') ||
      trimmed.startsWith('require(') ||
      trimmed.startsWith('module.exports') ||
      trimmed === ''
    ) {
      relevantLineSet.add(i);
    } else if (i > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
      // Stop scanning for imports once we hit non-import code
      break;
    }
  }

  // Find lines containing target symbols and add context
  for (let i = 0; i < lines.length; i++) {
    for (const symbol of symbols) {
      if (lines[i].includes(symbol)) {
        // Add the matching line and surrounding context
        for (
          let j = Math.max(0, i - contextRadius);
          j <= Math.min(lines.length - 1, i + contextRadius);
          j++
        ) {
          relevantLineSet.add(j);
        }

        // Expand to include complete block (find matching braces)
        const blockEnd = findBlockEnd(lines, i);
        if (blockEnd > i) {
          for (let j = i; j <= Math.min(blockEnd, i + 50); j++) {
            relevantLineSet.add(j);
          }
        }
        break;
      }
    }
  }

  if (relevantLineSet.size === 0) {
    return extractImportsAndExports(content);
  }

  // Build output with extracted sections
  const sortedLines = [...relevantLineSet].sort((a, b) => a - b);
  const parts: string[] = [];
  let lastLine = -2;

  parts.push(`// Targeted extraction from ${filePath}`);
  parts.push(`// Symbols: ${symbols.join(', ')}\n`);

  for (const lineNum of sortedLines) {
    if (lineNum - lastLine > 1 && lastLine >= 0) {
      parts.push('  // ... (lines omitted)');
    }
    parts.push(lines[lineNum]);
    lastLine = lineNum;
  }

  if (lastLine < lines.length - 1) {
    parts.push('  // ... (remaining lines omitted)');
  }

  return parts.join('\n');
}

/**
 * Find the end of a code block starting near the given line.
 */
function findBlockEnd(lines: string[], startLine: number): number {
  let braceDepth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length && i < startLine + 100; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        braceDepth++;
        foundOpen = true;
      } else if (ch === '}') {
        braceDepth--;
        if (foundOpen && braceDepth === 0) {
          return i;
        }
      }
    }
  }

  return startLine;
}

/**
 * Extract only import and export statements from file content.
 * Used as a minimal fallback when no target symbols are found.
 */
function extractImportsAndExports(content: string): string {
  const lines = content.split('\n');
  const relevant = lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export ') ||
      trimmed.startsWith('from ') ||
      trimmed.startsWith('require(') ||
      trimmed.startsWith('module.exports')
    );
  });

  if (relevant.length === 0) {
    return '// No imports or exports found';
  }

  return relevant.join('\n');
}
