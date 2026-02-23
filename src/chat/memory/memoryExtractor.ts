/**
 * MemoryExtractor - LLM-based extraction of memorable facts from conversations.
 * PRD 004: Memory Manager CRUD
 */
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import type { MemoryEntry, MemoryScope, ConversationMessage, ExtractedMemory } from './types.js';

/**
 * Prompt template for memory extraction.
 * Based on PRD 004 specification.
 */
function buildExtractionPrompt(
  recentMessages: ConversationMessage[],
  existingMemories: MemoryEntry[]
): string {
  const existingKeys = existingMemories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
  const conversationText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `You are analyzing a conversation between a user and an AI assistant about a software project.

Extract any persistent facts that would be useful in future conversations about this project.

Categories to look for:
- User preferences (coding style, framework choices, naming conventions)
- Architectural decisions (patterns chosen, libraries selected, folder structure decisions)
- Project constraints (performance requirements, compatibility needs, deployment targets)
- Domain knowledge (business rules, data models, API contracts)

For each fact, provide:
- key: A short, descriptive identifier (snake_case, max 100 chars)
- value: The fact itself, written as a clear statement (max 500 chars)
- scope: Either "session" (specific to current task), "repo" (applies to whole project), or "global" (applies generally)

Only extract facts that are:
1. Explicitly stated or clearly implied by the user
2. Likely to be relevant in future conversations
3. Not already captured in existing memories

Respond ONLY with a JSON object in this exact format (no markdown, no explanations):
{
  "memories": [
    { "key": "example_key", "value": "Example fact statement", "scope": "repo" }
  ]
}

If no new facts should be extracted, respond with:
{ "memories": [] }

Existing memories (do not duplicate these):
${existingKeys || '(none)'}

Recent conversation:
${conversationText}`;
}

/**
 * Parses the LLM response and extracts memories.
 * Handles both clean JSON and markdown-wrapped JSON.
 */
function parseExtractionResponse(response: string): ExtractedMemory[] {
  try {
    // Try to extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.both.warn('[MemoryExtractor] No JSON found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      logger.both.warn('[MemoryExtractor] Invalid response structure');
      return [];
    }

    // Validate and sanitize each memory
    return parsed.memories
      .filter((m: any) => {
        const hasKey = typeof m.key === 'string' && m.key.trim().length > 0;
        const hasValue = typeof m.value === 'string' && m.value.trim().length > 0;
        const hasScope = ['session', 'repo', 'global'].includes(m.scope);
        return hasKey && hasValue && hasScope;
      })
      .map((m: any) => ({
        key: m.key.trim().slice(0, 100),
        value: m.value.trim().slice(0, 500),
        scope: m.scope as MemoryScope,
      }));
  } catch (error) {
    logger.both.warn('[MemoryExtractor] Failed to parse response:', error);
    return [];
  }
}

/**
 * Extracts memorable facts from a conversation using Gemini Flash.
 *
 * @param messages - Recent conversation messages
 * @param existingMemories - Already stored memories (to avoid duplicates)
 * @param apiKey - Google API key for Gemini
 * @returns Array of extracted memories ready for storage
 */
export async function extractMemories(
  messages: ConversationMessage[],
  existingMemories: MemoryEntry[],
  apiKey: string
): Promise<ExtractedMemory[]> {
  if (!apiKey) {
    logger.both.debug('[MemoryExtractor] No API key provided, skipping extraction');
    return [];
  }

  if (messages.length < 2) {
    logger.both.debug('[MemoryExtractor] Insufficient messages for extraction');
    return [];
  }

  // Limit to last 10 messages to keep context manageable
  const recentMessages = messages.slice(-10);

  const prompt = buildExtractionPrompt(recentMessages, existingMemories);

  try {
    const { content } = await llmClient.generateText(apiKey, prompt, 'MemoryExtraction');

    const extracted = parseExtractionResponse(content);

    // Filter out any memories that duplicate existing keys
    const existingKeySet = new Set(existingMemories.map((m) => m.key.toLowerCase()));
    const uniqueExtracted = extracted.filter(
      (m) => !existingKeySet.has(m.key.toLowerCase())
    );

    logger.both.info(`[MemoryExtractor] Extracted ${uniqueExtracted.length} new memories`);

    return uniqueExtracted;
  } catch (error) {
    logger.both.warn('[MemoryExtractor] Extraction failed:', error);
    return [];
  }
}
