/**
 * Conversation history summarizer.
 * PRD 003: Context Compression Strategy
 *
 * Summarizes older conversation messages into compressed segments
 * using Gemini 2.5 Flash, preserving key decisions and context.
 */

import { generateText } from '../../agent/llmClient.js';
import { countTokens } from './tokenBudget.js';
import type { CompressedSegment, ChatMessage } from './types.js';
import { logger } from '../../shared/logger.js';

const SUMMARIZATION_PROMPT = `Summarize this conversation segment. Preserve:
- Key decisions made
- File paths mentioned
- Code changes discussed
- User preferences expressed
- Technical requirements and constraints

Output a concise paragraph that captures the essential information.

Conversation segment:
`;

/**
 * Summarize older conversation history, keeping recent messages in full.
 *
 * @param messages - All messages in the thread
 * @param maxRecentMessages - Number of recent messages to keep in full
 * @param groupSize - Number of messages per summarization group
 * @param maxTokens - Maximum tokens for all summaries combined
 * @param apiKey - Google API key for Gemini Flash
 * @returns Compressed segments, recent messages kept in full, and flagged original messages
 */
export async function summarizeHistory(
  messages: ChatMessage[],
  maxRecentMessages: number,
  groupSize: number,
  maxTokens: number,
  apiKey: string
): Promise<{
  summaries: CompressedSegment[];
  recentMessages: ChatMessage[];
  /** Original messages with isCompressed/compressedInto flags set (for DB persistence) */
  flaggedOriginals: ChatMessage[];
}> {
  // If we have fewer messages than the threshold, no summarization needed
  if (messages.length <= maxRecentMessages) {
    return {
      summaries: [],
      recentMessages: messages,
      flaggedOriginals: [],
    };
  }

  // Split into older messages (to summarize) and recent messages (to keep)
  const cutoffIndex = messages.length - maxRecentMessages;
  const olderMessages = messages.slice(0, cutoffIndex);
  const recentMessages = messages.slice(cutoffIndex);

  // Group older messages for batch summarization
  const groups = groupMessages(olderMessages, groupSize);

  // Calculate per-group token budget
  const perGroupBudget = Math.floor(maxTokens / Math.max(groups.length, 1));

  // Summarize each group
  const summaries: CompressedSegment[] = [];
  const flaggedOriginals: ChatMessage[] = [];

  for (const group of groups) {
    let summary: CompressedSegment;
    try {
      summary = await summarizeMessageGroup(group, perGroupBudget, apiKey);
    } catch (error) {
      logger.both.warn(`Failed to summarize message group: ${error}`);
      // On failure, create a simple fallback summary
      summary = createFallbackSummary(group);
    }
    summaries.push(summary);

    // Flag original messages as compressed (PRD 003: preserve in DB with flag)
    for (const msg of group) {
      flaggedOriginals.push({
        ...msg,
        isCompressed: true,
        compressedInto: summary.id,
      });
    }
  }

  return {
    summaries,
    recentMessages,
    flaggedOriginals,
  };
}

/**
 * Group messages into batches for summarization.
 */
function groupMessages(messages: ChatMessage[], groupSize: number): ChatMessage[][] {
  const groups: ChatMessage[][] = [];

  for (let i = 0; i < messages.length; i += groupSize) {
    groups.push(messages.slice(i, i + groupSize));
  }

  return groups;
}

/**
 * Summarize a single group of messages using Gemini Flash.
 */
async function summarizeMessageGroup(
  messages: ChatMessage[],
  maxTokens: number,
  apiKey: string
): Promise<CompressedSegment> {
  // Format messages for the prompt
  const formattedMessages = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  const prompt = SUMMARIZATION_PROMPT + formattedMessages;

  const { content: summary } = await generateText(
    apiKey,
    prompt,
    'History Summarization'
  );

  const tokenCount = countTokens(summary);

  return {
    id: crypto.randomUUID(),
    originalMessageIds: messages.map((m) => m.id).filter(Boolean),
    summary: `[Summary] ${summary}`,
    tokenCount,
    messageCount: messages.length,
    createdAt: new Date(),
  };
}

/**
 * Create a fallback summary without using an LLM.
 * Used when the LLM call fails.
 */
function createFallbackSummary(messages: ChatMessage[]): CompressedSegment {
  // Extract key information heuristically
  const filePaths = new Set<string>();
  const keyPhrases: string[] = [];

  for (const msg of messages) {
    // Extract file paths
    const pathMatches = msg.content.match(/[\w./\\-]+\.\w{1,10}/g);
    if (pathMatches) {
      pathMatches.forEach((p) => filePaths.add(p));
    }

    // Take first sentence of user messages as key phrases
    if (msg.role === 'user') {
      const firstSentence = msg.content.split(/[.!?\n]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 10) {
        keyPhrases.push(firstSentence);
      }
    }
  }

  const parts: string[] = ['[Summary]'];

  if (keyPhrases.length > 0) {
    parts.push(`Topics discussed: ${keyPhrases.slice(0, 3).join('; ')}`);
  }

  if (filePaths.size > 0) {
    parts.push(`Files mentioned: ${Array.from(filePaths).slice(0, 5).join(', ')}`);
  }

  parts.push(`(${messages.length} messages summarized)`);

  const summary = parts.join(' ');

  return {
    id: crypto.randomUUID(),
    originalMessageIds: messages.map((m) => m.id).filter(Boolean),
    summary,
    tokenCount: countTokens(summary),
    messageCount: messages.length,
    createdAt: new Date(),
  };
}

/**
 * Convert compressed segments to system messages for prompt assembly.
 */
export function segmentsToSystemMessages(
  segments: CompressedSegment[]
): Array<{ role: 'system'; content: string }> {
  return segments.map((segment) => ({
    role: 'system' as const,
    content: segment.summary,
  }));
}
