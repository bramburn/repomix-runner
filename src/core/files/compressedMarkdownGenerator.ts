import * as path from 'path';
import * as fs from 'fs';
import { encode } from 'gpt-tokenizer';
import { compressFile } from '../compression/index.js';
import { isBinaryFile } from './markdownGenerator.js';

/**
 * Generates compressed markdown by concatenating files through AST compression.
 * Falls back to full content for unsupported languages.
 */
export async function generateCompressedMarkdownContent(
  cwd: string,
  relativeFiles: string[]
): Promise<{ concatenated: string; tokenCount: number }> {
  const entries: string[] = [];

  for (const relativeFile of relativeFiles) {
    const fullPath = path.join(cwd, relativeFile);

    if (!fs.existsSync(fullPath)) {
      entries.push(`## ${relativeFile}\n\n> File not found`);
      continue;
    }

    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats || !stats.isFile()) {
      entries.push(`## ${relativeFile}\n\n> Not a file`);
      continue;
    }

    if (isBinaryFile(relativeFile)) {
      console.log(`[Repomix] Skipping binary file: ${relativeFile}`);
      continue;
    }

    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      
      // Attempt compression - falls back to full content if unsupported
      const compressed = await compressFile(relativeFile, content);
      const outputContent = compressed ?? content;
      
      entries.push(`<file path="${relativeFile}">${outputContent}</file>`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      entries.push(`## ${relativeFile}\n\n> Error reading file: ${errorMsg}`);
    }
  }

  if (entries.length === 0) {
    throw new Error('No text files could be read (all files may be binary)');
  }

  const concatenated = entries.join('\n\n');
  const tokenCount = await calculateTokenCount(concatenated);

  return { concatenated, tokenCount };
}

/**
 * Calculates token count for content using GPT tokenizer
 */
async function calculateTokenCount(content: string): Promise<number> {
  try {
    const tokens = encode(content);
    return tokens.length;
  } catch (error) {
    throw new Error(`Failed to calculate token count: ${error instanceof Error ? error.message : String(error)}`);
  }
}