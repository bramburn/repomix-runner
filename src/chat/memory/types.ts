/**
 * Memory Manager Types - PRD 004
 * Core type definitions for the persistent memory system.
 */

/**
 * Memory scope defines the visibility of a memory entry.
 * - session: Thread-specific memories (scopeId = threadId)
 * - repo: Repository-wide memories (scopeId = repoId)
 */
export type MemoryScope = 'session' | 'repo';

/**
 * Memory source indicates how the memory was created.
 * - user: Manually created/edited by the user
 * - auto: Automatically extracted by LLM from conversation
 */
export type MemorySource = 'user' | 'auto';

/**
 * A memory entry stored in the chat_memory table.
 */
export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  scopeId: string;
  key: string;
  value: string;
  source: MemorySource;
  createdAt: number; // milliseconds epoch
  updatedAt: number; // milliseconds epoch
  expiresAt: number | null; // milliseconds epoch, null = never expires
}

/**
 * Input for creating a new memory entry.
 */
export interface MemoryCreateInput {
  scope: MemoryScope;
  scopeId: string;
  key: string;
  value: string;
  source: MemorySource;
  expiresAt?: Date | null;
}

/**
 * Input for updating an existing memory entry.
 */
export interface MemoryUpdateInput {
  value?: string;
  expiresAt?: Date | null;
}

/**
 * Message type from conversation history for memory extraction.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Result from LLM memory extraction.
 */
export interface ExtractedMemory {
  key: string;
  value: string;
  scope: MemoryScope;
}
