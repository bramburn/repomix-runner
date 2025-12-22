/**
 * Represents a single chunk of text with metadata.
 */
export interface TextChunk {
  text: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  estimatedTokens?: number; // Token count for non-AST files
  symbolInfo?: {
    symbolName?: string;
    symbolType?: string;
    language?: string;
  }; // Optional semantic information from tree-sitter
}

import { encode } from 'gpt-tokenizer';
import { TreeSitterService, treeSitterService } from './treeSitterService';

/**
 * Configuration for text chunking.
 */
export interface ChunkingConfig {
  maxLines?: number;
  overlapLines?: number;
  useTokenEstimation?: boolean; // Enable token counting for non-AST files
  filePath?: string; // File path for language detection
  useSemanticChunking?: boolean; // Enable semantic chunking with tree-sitter
}

const DEFAULT_MAX_LINES = 60;
const DEFAULT_OVERLAP_LINES = 10;

/**
 * Estimates token count for text content (fast estimation)
 * Falls back to character-based estimation if needed
 */
export function estimateTokenCount(text: string): number {
  try {
    // Use gpt-tokenizer for accurate counting
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback to character-based estimation (1 token ≈ 4 characters for code)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Chunks code semantically based on functions, classes, and other code structures.
 * Uses tree-sitter AST to understand code boundaries and create meaningful chunks.
 *
 * @param text The source code to chunk
 * @param language Programming language
 * @param config Chunking configuration
 * @returns Array of TextChunk objects with semantic information
 */
async function chunkTextSemantically(
  text: string,
  language: string,
  config: ChunkingConfig = {}
): Promise<TextChunk[]> {
  const lines = text.split('\n');
  const chunks: TextChunk[] = [];

  try {
    // Extract symbols using tree-sitter
    const symbols = await treeSitterService.extractSymbols(text, language);

    if (symbols.length === 0) {
      // Fallback to line-based chunking if no symbols found
      return chunkTextByLines(text, config);
    }

    // Create chunks based on symbols (functions, classes, etc.)
    let chunkIndex = 0;

    // Handle code before first symbol
    if (symbols[0].startLine > 0) {
      const preludeText = lines.slice(0, symbols[0].startLine).join('\n');
      chunks.push({
        text: preludeText,
        chunkIndex: chunkIndex++,
        startLine: 0,
        endLine: symbols[0].startLine,
        estimatedTokens: config.useTokenEstimation ? estimateTokenCount(preludeText) : undefined,
        symbolInfo: {
          symbolType: 'prelude',
          language
        }
      });
    }

    // Create chunks for each symbol, combining small ones when needed
    const maxLines = config.maxLines ?? DEFAULT_MAX_LINES;
    let currentChunkLines: string[] = [];
    let currentChunkStartLine = 0;
    let currentSymbols: any[] = [];

    for (const symbol of symbols) {
      const symbolLines = lines.slice(symbol.startLine, symbol.endLine + 1);
      const combinedLines = [...currentChunkLines, ...symbolLines];

      // Check if adding this symbol would exceed max lines
      if (combinedLines.length > maxLines && currentChunkLines.length > 0) {
        // Emit current chunk
        const chunkText = currentChunkLines.join('\n');
        chunks.push({
          text: chunkText,
          chunkIndex: chunkIndex++,
          startLine: currentChunkStartLine,
          endLine: currentChunkStartLine + currentChunkLines.length - 1,
          estimatedTokens: config.useTokenEstimation ? estimateTokenCount(chunkText) : undefined,
          symbolInfo: {
            symbolName: currentSymbols[0]?.name,
            symbolType: currentSymbols.length === 1 ? currentSymbols[0].type : 'combined',
            language
          }
        });

        // Start new chunk with current symbol
        currentChunkLines = symbolLines;
        currentChunkStartLine = symbol.startLine;
        currentSymbols = [symbol];
      } else {
        // Add symbol to current chunk
        if (currentChunkLines.length === 0) {
          currentChunkStartLine = symbol.startLine;
        }
        currentChunkLines = combinedLines;
        currentSymbols.push(symbol);
      }
    }

    // Emit final chunk if there are remaining lines
    if (currentChunkLines.length > 0) {
      const chunkText = currentChunkLines.join('\n');
      chunks.push({
        text: chunkText,
        chunkIndex: chunkIndex++,
        startLine: currentChunkStartLine,
        endLine: currentChunkStartLine + currentChunkLines.length - 1,
        estimatedTokens: config.useTokenEstimation ? estimateTokenCount(chunkText) : undefined,
        symbolInfo: {
          symbolName: currentSymbols[0]?.name,
          symbolType: currentSymbols.length === 1 ? currentSymbols[0].type : 'combined',
          language
        }
      });
    }

    // Handle code after last symbol
    if (symbols[symbols.length - 1].endLine < lines.length - 1) {
      const epilogueStartLine = symbols[symbols.length - 1].endLine + 1;
      const epilogueText = lines.slice(epilogueStartLine).join('\n');
      chunks.push({
        text: epilogueText,
        chunkIndex: chunkIndex++,
        startLine: epilogueStartLine,
        endLine: lines.length - 1,
        estimatedTokens: config.useTokenEstimation ? estimateTokenCount(epilogueText) : undefined,
        symbolInfo: {
          symbolType: 'epilogue',
          language
        }
      });
    }

  } catch (error) {
    console.error('Semantic chunking failed, falling back to line-based:', error);
    return chunkTextByLines(text, config);
  }

  return chunks;
}

/**
 * Chunks text by lines (fallback method)
 */
function chunkTextByLines(
  text: string,
  config: ChunkingConfig = {}
): TextChunk[] {
  const maxLines = config.maxLines ?? DEFAULT_MAX_LINES;
  const overlapLines = config.overlapLines ?? DEFAULT_OVERLAP_LINES;
  const useTokenEstimation = config.useTokenEstimation ?? false;

  const lines = text.split('\n');
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (let startLine = 0; startLine < lines.length; startLine += (maxLines - overlapLines)) {
    const endLine = Math.min(startLine + maxLines, lines.length);
    const chunkLines = lines.slice(startLine, endLine);
    const chunkText = chunkLines.join('\n');

    const chunk: TextChunk = {
      text: chunkText,
      chunkIndex: chunkIndex++,
      startLine,
      endLine
    };

    // Add token estimation if requested (for non-AST files)
    if (useTokenEstimation) {
      chunk.estimatedTokens = estimateTokenCount(chunkText);
    }

    chunks.push(chunk);

    if (endLine >= lines.length) break;
  }

  return chunks;
}

/**
 * Chunks code into segments, using semantic chunking when possible.
 * Detects file type from extension and applies appropriate chunking strategy.
 *
 * @param text The text to chunk
 * @param config Chunking configuration
 * @returns Array of TextChunk objects
 */
export async function chunkText(
  text: string,
  config: ChunkingConfig = {}
): Promise<TextChunk[]> {
  const useSemanticChunking = config.useSemanticChunking ?? false;
  const filePath = config.filePath;

  if (useSemanticChunking && filePath) {
    // Detect language from file path
    const language = TreeSitterService.detectLanguage(filePath);

    if (language && TreeSitterService.isLanguageSupported(language)) {
      // Use semantic chunking for supported languages
      try {
        await treeSitterService.initialize();
        return await chunkTextSemantically(text, language, config);
      } catch (error) {
        console.warn(`Semantic chunking failed for ${language}, falling back to line-based:`, error);
      }
    }
  }

  // Fallback to line-based chunking
  return chunkTextByLines(text, config);
}

