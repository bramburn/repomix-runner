import type { FileEdit } from '../state.js';
import type { ParsedBatchResponse, ParseDiagnostic } from './types.js';

interface JsonCodeChangeResponse {
  changes?: Array<{
    filePath?: string;
    action?: 'create' | 'edit' | 'delete';
    content?: string;
    searchReplace?: Array<{ search?: string; replace?: string }>;
  }>;
}

/**
 * Extracts text between start and end tags using string splitting.
 * Handles CDATA sections and basic nesting by tracking tag depth.
 */
function extractTagContent(block: string, tagName: string): string | null {
  const startTag = `<${tagName}>`;
  const endTag = `</${tagName}>`;

  const startIndex = block.indexOf(startTag);
  if (startIndex === -1) {
    return null;
  }

  const contentStart = startIndex + startTag.length;
  let endIndex = block.indexOf(endTag, contentStart);

  if (endIndex === -1) {
    return null;
  }

  // Handle CDATA wrapper: <content><![CDATA[...]]></content>
  let content = block.slice(contentStart, endIndex);
  const cdataStart = '<![CDATA[';
  const cdataEnd = ']]>';

  if (content.trimStart().startsWith(cdataStart)) {
    const cdataContentStart = content.indexOf(cdataStart) + cdataStart.length;
    const cdataContentEnd = content.lastIndexOf(cdataEnd);
    if (cdataContentEnd > cdataContentStart) {
      content = content.slice(cdataContentStart, cdataContentEnd);
    }
  }

  return content;
}

/**
 * Finds all file_change blocks using string splitting instead of regex.
 * More robust against unescaped XML characters in content.
 */
function findFileChangeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const startTag = '<file_change>';
  const endTag = '</file_change>';

  let searchStart = 0;
  while (true) {
    const startIndex = content.indexOf(startTag, searchStart);
    if (startIndex === -1) {
      break;
    }

    const blockContentStart = startIndex + startTag.length;
    const endIndex = content.indexOf(endTag, blockContentStart);

    if (endIndex === -1) {
      // Malformed: found start but no end
      break;
    }

    const block = content.slice(startIndex, endIndex + endTag.length);
    blocks.push(block);
    searchStart = endIndex + endTag.length;
  }

  return blocks;
}

function parseXmlLikeFileChanges(content: string): { edits: FileEdit[]; diagnostics: ParseDiagnostic[] } {
  const edits: FileEdit[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  const blocks = findFileChangeBlocks(content);

  if (blocks.length === 0) {
    diagnostics.push({ stage: 'block_detection', details: 'No <file_change> blocks found in response' });
    return { edits, diagnostics };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    const path = extractTagContent(block, 'path');
    const action = extractTagContent(block, 'action');
    const fileContent = extractTagContent(block, 'content');

    if (!path) {
      diagnostics.push({ stage: 'path_extraction', details: `Block ${i + 1}: Missing or invalid <path> tag` });
      continue;
    }

    if (!action) {
      diagnostics.push({ stage: 'action_extraction', details: `Block ${i + 1}: Missing or invalid <action> tag` });
      continue;
    }

    const trimmedAction = action.trim() as 'create' | 'edit' | 'delete';
    if (!['create', 'edit', 'delete'].includes(trimmedAction)) {
      diagnostics.push({
        stage: 'action_validation',
        details: `Block ${i + 1}: Invalid action "${action.trim()}", expected create|edit|delete`,
      });
      continue;
    }

    edits.push({
      filePath: path.trim(),
      action: trimmedAction,
      content: (fileContent ?? '').trim(),
      approved: false,
    });
  }

  if (edits.length === 0 && blocks.length > 0) {
    diagnostics.push({
      stage: 'edit_construction',
      details: `Found ${blocks.length} block(s) but none were valid`,
    });
  }

  return { edits, diagnostics };
}

function parseJsonCodeChanges(content: string): FileEdit[] {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]) as JsonCodeChangeResponse;
  if (!Array.isArray(parsed.changes)) {
    return [];
  }

  return parsed.changes
    .filter((change) => change.filePath && change.action)
    .map((change) => ({
      filePath: change.filePath!,
      action: change.action as 'create' | 'edit' | 'delete',
      content: change.content ?? '',
      searchReplace: Array.isArray(change.searchReplace)
        ? change.searchReplace
            .filter((entry) => typeof entry.search === 'string' && typeof entry.replace === 'string')
            .map((entry) => ({ search: entry.search!, replace: entry.replace! }))
        : undefined,
      approved: false,
    }));
}

export function parseBatchResponse(content: string): ParsedBatchResponse {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      fileEdits: [],
      parseWarnings: ['Empty batch response content.'],
      usedFallback: false,
      rawResponse: content,
    };
  }

  const { edits: xmlEdits, diagnostics } = parseXmlLikeFileChanges(trimmed);
  if (xmlEdits.length > 0) {
    return {
      fileEdits: xmlEdits,
      parseWarnings: [],
      usedFallback: false,
      rawResponse: content,
      parseDiagnostics: diagnostics,
    };
  }

  // XML parsing attempted but failed - include diagnostics
  const xmlWarnings = diagnostics.map((d) => `${d.stage}: ${d.details}`);

  try {
    const jsonEdits = parseJsonCodeChanges(trimmed);
    if (jsonEdits.length > 0) {
      return {
        fileEdits: jsonEdits,
        parseWarnings: ['Used JSON fallback parser instead of <file_change> format.', ...xmlWarnings],
        usedFallback: true,
        rawResponse: content,
        parseDiagnostics: diagnostics,
      };
    }
  } catch (error) {
    return {
      fileEdits: [],
      parseWarnings: [
        `Failed to parse batch response as JSON fallback: ${error instanceof Error ? error.message : String(error)}`,
        ...xmlWarnings,
      ],
      usedFallback: true,
      rawResponse: content,
      parseDiagnostics: diagnostics,
    };
  }

  return {
    fileEdits: [],
    parseWarnings: [
      'No parseable <file_change> blocks or JSON changes array found. Surface raw response for manual review.',
      ...xmlWarnings,
    ],
    usedFallback: true,
    rawResponse: content,
    parseDiagnostics: diagnostics,
  };
}
