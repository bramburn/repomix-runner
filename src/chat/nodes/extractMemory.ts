/**
 * extractMemory node - Extracts memorable facts from conversation after completion.
 * PRD 004: Memory Manager CRUD
 *
 * This node runs after generateSummary and extracts facts that should be
 * remembered for future conversations. It is non-blocking and catches all
 * errors to ensure the workflow completes even if extraction fails.
 */
import type { ExtensionContext } from 'vscode';
import type { Pool } from 'pg';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { getApiKey, type ProgressCallback } from './utils.js';
import { MessageRepository } from '../db/messageRepository.js';
import { MemoryManager } from '../memory/memoryManager.js';
import { extractMemories } from '../memory/memoryExtractor.js';
import { formatMemoriesForDisplay } from '../memory/memoryInjector.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getCwd } from '../../config/getCwd.js';
import type { ConversationMessage } from '../memory/types.js';

/**
 * Minimum messages required for memory extraction.
 * Extraction is skipped if the thread has fewer messages.
 */
const MIN_MESSAGES_FOR_EXTRACTION = 4;

export async function extractMemoryNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  pgPool: Pool,
  onProgress: ProgressCallback
): Promise<Partial<typeof ChatState.State>> {
  try {
    onProgress('Analyzing conversation for memorable facts...');

    // Check if API key is available
    const apiKey = await getApiKey(extensionContext);
    if (!apiKey) {
      logger.both.debug('[extractMemory] No API key available, skipping extraction');
      onProgress('Memory extraction skipped (no API key)');
      return {};
    }

    // Load messages from the thread
    const messageRepository = new MessageRepository(pgPool);
    const messages = await messageRepository.getMessages(state.threadId);

    if (messages.length < MIN_MESSAGES_FOR_EXTRACTION) {
      logger.both.debug(
        `[extractMemory] Only ${messages.length} messages, need ${MIN_MESSAGES_FOR_EXTRACTION} for extraction`
      );
      onProgress('Memory extraction skipped (insufficient context)');
      return {};
    }

    // Convert to conversation message format
    const conversationMessages: ConversationMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Get repo ID for repo-scoped memories
    const repoId = await getRepoId(getCwd());

    // Get existing memories to avoid duplicates
    const memoryManager = new MemoryManager(pgPool);
    const { session, repo } = await memoryManager.getAllForContext(state.threadId, repoId);
    const existingMemories = [...session, ...repo];

    // Extract new memories using LLM
    const extractedMemories = await extractMemories(
      conversationMessages,
      existingMemories,
      apiKey
    );

    if (extractedMemories.length === 0) {
      logger.both.debug('[extractMemory] No new memories extracted');
      onProgress('No new facts to remember');
      return {};
    }

    // Store extracted memories
    let storedCount = 0;
    for (const memory of extractedMemories) {
      try {
        const scopeId =
          memory.scope === 'session'
            ? state.threadId
            : memory.scope === 'repo'
              ? repoId
              : 'global';

        await memoryManager.create({
          scope: memory.scope,
          scopeId,
          key: memory.key,
          value: memory.value,
          source: 'auto',
        });
        storedCount++;
      } catch (error) {
        // Log but don't fail - might be duplicate key
        logger.both.debug(`[extractMemory] Failed to store memory "${memory.key}":`, error);
      }
    }

    logger.both.info(`[extractMemory] Stored ${storedCount} new memories`);
    onProgress(`Remembered ${storedCount} fact${storedCount === 1 ? '' : 's'}`);

    // Format memories for state display
    const updatedMemories = await memoryManager.getAllForContext(state.threadId, repoId);
    const activeMemories = formatMemoriesForDisplay([
      ...updatedMemories.session,
      ...updatedMemories.repo,
    ]);

    return {
      activeMemories,
    };
  } catch (error) {
    // Non-blocking: log and continue
    logger.both.warn('[extractMemory] Extraction failed (non-blocking):', error);
    onProgress('Memory extraction unavailable');
    return {};
  }
}
