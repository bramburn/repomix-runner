import { LanguageParser } from './LanguageParser.js';
import type { CaptureLike, CompressionOptions, ParsedChunk } from './types.js';

const CHUNK_SEPARATOR = '\n⋮----\n';

function detectLanguage(filePath: string): 'typescript' | 'javascript' | null {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

  const languageByExtension: Record<string, 'typescript' | 'javascript'> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
  };

  return languageByExtension[extension] ?? null;
}

function dedupeChunks(chunks: ParsedChunk[]): ParsedChunk[] {
  const seen = new Set<string>();
  const deduped: ParsedChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.startIndex}:${chunk.endIndex}:${chunk.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(chunk);
  }

  return deduped;
}

function mergeAdjacentChunks(chunks: ParsedChunk[], sourceCode: string): ParsedChunk[] {
  if (!chunks.length) {
    return chunks;
  }

  const sorted = [...chunks].sort((a, b) => a.startIndex - b.startIndex);
  const merged: ParsedChunk[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    const gapText = sourceCode.slice(previous.endIndex, current.startIndex);
    const isAdjacent =
      current.startIndex <= previous.endIndex ||
      (gapText.trim() === '' && gapText.length <= 4);

    if (!isAdjacent) {
      merged.push(current);
      continue;
    }

    previous.endIndex = Math.max(previous.endIndex, current.endIndex);
    if (previous.text !== current.text) {
      previous.text = `${previous.text}\n${current.text}`;
    }
  }

  return merged;
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
    rawCaptures.sort((a, b) => a.node.startIndex - b.node.startIndex);

    const chunks: ParsedChunk[] = [];
    const processedRanges: Array<{ start: number; end: number }> = [];

    for (const capture of rawCaptures) {
      const isNested = processedRanges.some(
        range => capture.node.startIndex >= range.start && capture.node.endIndex <= range.end
      );

      if (isNested) {
        continue;
      }

      const parsed = strategy.parseCapture(capture, { sourceCode: fileContent }, options);
      if (!parsed) {
        continue;
      }

      chunks.push(parsed);
      processedRanges.push({ start: parsed.startIndex, end: parsed.endIndex });
    }

    const deduped = dedupeChunks(chunks);
    const merged = mergeAdjacentChunks(deduped, fileContent);

    if (merged.length === 0) {
      return null;
    }

    return merged.map(chunk => chunk.text).join(CHUNK_SEPARATOR);
  } catch (error) {
    console.error('Compression failed:', error);
    return null;
  }
}
