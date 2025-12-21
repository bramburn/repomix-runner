import { encoding_for_model } from 'tiktoken';

/**
 * Represents a single chunk of text with metadata.
 */
export interface TextChunk {
  text: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
}

/**
 * Configuration for text chunking.
 */
export interface ChunkingConfig {
  chunkTokens?: number;
  overlapTokens?: number;
}

const DEFAULT_CHUNK_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 100;

/**
 * Tokenizer interface for flexibility in token counting.
 * Allows swapping between tiktoken and custom implementations.
 */
export interface Tokenizer {
  encode(text: string): number[];
  decode(tokens: number[]): string;
}

/**
 * Creates a Tiktoken-based tokenizer using the o200k_base encoding.
 */
export function createTiktokenTokenizer(): Tokenizer {
  const enc = encoding_for_model('gpt-4o');
  return {
    encode: (text: string) => Array.from(enc.encode(text)),
    decode: (tokens: number[]) => {
      // tiktoken.decode returns Uint8Array, convert to string
      const decoded = enc.decode(new Uint32Array(tokens)) as any;
      if (typeof decoded === 'string') return decoded;
      // If it's Uint8Array, convert to string
      return new TextDecoder().decode(decoded);
    }
  };
}

/**
 * Chunks text into overlapping segments based on token count.
 *
 * @param text The text to chunk
 * @param config Chunking configuration (chunkTokens, overlapTokens)
 * @param tokenizer Optional tokenizer; defaults to tiktoken o200k_base
 * @returns Array of TextChunk objects
 */
export function chunkText(
  text: string,
  config: ChunkingConfig = {},
  tokenizer?: Tokenizer
): TextChunk[] {
  const chunkTokens = config.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const overlapTokens = config.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  if (!tokenizer) {
    tokenizer = createTiktokenTokenizer();
  }

  const tokens = tokenizer.encode(text);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let currentPos = 0;

  while (currentPos < tokens.length) {
    // Determine chunk end
    const chunkEnd = Math.min(currentPos + chunkTokens, tokens.length);
    const chunkTokens_ = tokens.slice(currentPos, chunkEnd);
    const chunkText = tokenizer.decode(chunkTokens_);

    // Find actual character offsets in original text
    const startOffset = text.indexOf(chunkText, currentPos > 0 ? text.length / tokens.length * currentPos : 0);
    const endOffset = startOffset + chunkText.length;

    chunks.push({
      text: chunkText,
      chunkIndex,
      startOffset: Math.max(0, startOffset),
      endOffset: Math.min(text.length, endOffset),
      tokenCount: chunkTokens_.length
    });

    // Move to next chunk with overlap
    currentPos = chunkEnd - overlapTokens;
    if (currentPos <= 0) break;
    chunkIndex++;
  }

  return chunks;
}

