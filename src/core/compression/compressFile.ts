import { encode } from 'gpt-tokenizer';
import { LanguageParser } from './LanguageParser.js';
import type { CaptureLike, CompressionOptions, BodyReplacement } from './types.js';

/**
 * Result of compression with token information.
 */
export interface CompressionWithTokens {
  /** Compressed content, or null if compression not supported */
  compressed: string | null;
  /** Token count of the result (compressed content or original if compression failed) */
  tokenCount: number;
}

/**
 * Count tokens in a text string using gpt-tokenizer.
 * Falls back to character-based estimation if encoding fails.
 */
function countTokens(text: string): number {
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

function detectLanguage(filePath: string): 'typescript' | 'javascript' | 'dart' | 'python' | 'csharp' | 'rust' | null {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

  const languageByExtension: Record<string, 'typescript' | 'javascript' | 'dart' | 'python' | 'csharp' | 'rust'> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    dart: 'dart',
    py: 'python',
    cs: 'csharp',
    rs: 'rust',
  };

  return languageByExtension[extension] ?? null;
}

export async function compressFile(
  filePath: string,
  fileContent: string,
  options?: CompressionOptions
): Promise<string | null> {
  const language = detectLanguage(filePath);
  if (!language) {
    return null;
  }

  const parserService = LanguageParser.getInstance();

  try {
    const parser = await parserService.getParserForLang(language);
    const query = await parserService.getQueryForLang(language);
    const strategy = parserService.getStrategyForLang(language);

    if (!parser || !query || !strategy) {
      return null;
    }

    const tree = parser.parse(fileContent);
    const rawCaptures = query.captures(tree.rootNode) as CaptureLike[];

    if (rawCaptures.length === 0) {
      return null;
    }

    // Process in reverse order to preserve indices when replacing
    rawCaptures.sort((a, b) => b.node.startIndex - a.node.startIndex);

    let result = fileContent;
    let hasReplacements = false;

    for (const capture of rawCaptures) {
      const replacement = strategy.getBodyReplacement(capture, { sourceCode: fileContent }, options);
      if (!replacement) {
        continue;
      }

      // Verify the indices are still valid
      if (replacement.bodyStartIndex < 0 || replacement.bodyEndIndex > result.length) {
        continue;
      }

      result =
        result.slice(0, replacement.bodyStartIndex) +
        replacement.replacementText +
        result.slice(replacement.bodyEndIndex);
      hasReplacements = true;
    }

    // If we found captures but none had bodies to replace (e.g., imports, exports only),
    // return the original content rather than null to avoid triggering fallback to full code
    return result;
  } catch (error) {
    console.error('Compression failed:', error);
    return null;
  }
}

/**
 * Compress a file and return both the compressed content and token count.
 * This is useful for token budget management in the compression pipeline.
 *
 * @param filePath - Path to the file (used for language detection)
 * @param fileContent - Raw file content to compress
 * @param options - Optional compression options
 * @returns Object with compressed content and token count
 */
export async function compressFileWithTokens(
  filePath: string,
  fileContent: string,
  options?: CompressionOptions
): Promise<CompressionWithTokens> {
  const compressed = await compressFile(filePath, fileContent, options);

  if (compressed !== null) {
    return {
      compressed,
      tokenCount: countTokens(compressed),
    };
  }

  // Compression not supported or failed - return null with original token count
  return {
    compressed: null,
    tokenCount: countTokens(fileContent),
  };
}

/**
 * Get list of supported language extensions.
 */
export function getSupportedExtensions(): string[] {
  return ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'dart', 'py', 'cs', 'rs'];
}

/**
 * Check if a file extension is supported for AST compression.
 */
export function isSupportedExtension(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return getSupportedExtensions().includes(extension);
}
