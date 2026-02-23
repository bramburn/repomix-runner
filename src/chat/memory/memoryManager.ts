/**
 * MemoryManager - High-level orchestration for memory operations.
 * PRD 004: Memory Manager CRUD
 */
import type { Pool } from 'pg';
import { MemoryRepository } from '../db/memoryRepository.js';
import type {
  MemoryEntry,
  MemoryScope,
  MemoryCreateInput,
  MemoryUpdateInput,
} from './types.js';

/**
 * MemoryManager provides business logic on top of MemoryRepository.
 * Handles CRUD operations with validation and convenience methods.
 */
export class MemoryManager {
  private readonly repository: MemoryRepository;

  constructor(pool: Pool) {
    this.repository = new MemoryRepository(pool);
  }

  /**
   * Creates a new memory entry.
   */
  async create(input: MemoryCreateInput): Promise<MemoryEntry> {
    // Validate input
    if (!input.key || input.key.trim().length === 0) {
      throw new Error('Memory key cannot be empty');
    }
    if (!input.value || input.value.trim().length === 0) {
      throw new Error('Memory value cannot be empty');
    }
    if (input.key.length > 100) {
      throw new Error('Memory key cannot exceed 100 characters');
    }
    if (input.value.length > 10000) {
      throw new Error('Memory value cannot exceed 10000 characters');
    }

    return this.repository.createMemory({
      scope: input.scope,
      scopeId: input.scopeId,
      key: input.key.trim(),
      value: input.value.trim(),
      source: input.source,
      expiresAt: input.expiresAt ?? null,
    });
  }

  /**
   * Retrieves a memory entry by ID.
   */
  async get(id: string): Promise<MemoryEntry | null> {
    return this.repository.getMemoryById(id);
  }

  /**
   * Lists all memories for a given scope and scope ID.
   * Excludes expired memories.
   */
  async list(scope: MemoryScope, scopeId: string): Promise<MemoryEntry[]> {
    return this.repository.listMemoryByScope(scope, scopeId, false);
  }

  /**
   * Updates an existing memory entry.
   */
  async update(id: string, input: MemoryUpdateInput): Promise<MemoryEntry> {
    if (input.value !== undefined) {
      if (input.value.trim().length === 0) {
        throw new Error('Memory value cannot be empty');
      }
      if (input.value.length > 10000) {
        throw new Error('Memory value cannot exceed 10000 characters');
      }
    }

    return this.repository.updateMemory(id, {
      value: input.value?.trim(),
      expiresAt: input.expiresAt,
    });
  }

  /**
   * Deletes a memory entry by ID.
   */
  async delete(id: string): Promise<void> {
    return this.repository.deleteMemory(id);
  }

  /**
   * Searches memories by keyword matching on key and value.
   */
  async search(scope: MemoryScope, scopeId: string, query: string): Promise<MemoryEntry[]> {
    if (!query || query.trim().length === 0) {
      return this.list(scope, scopeId);
    }
    return this.repository.searchByKeyword(scope, scopeId, query.trim());
  }

  /**
   * Checks if a memory with the given key exists in the specified scope.
   */
  async exists(scope: MemoryScope, scopeId: string, key: string): Promise<boolean> {
    return this.repository.existsByKey(scope, scopeId, key);
  }

  /**
   * Gets all memories for both session and repo scopes.
   * Useful for memory injection into prompts.
   */
  async getAllForContext(threadId: string, repoId: string): Promise<{
    session: MemoryEntry[];
    repo: MemoryEntry[];
  }> {
    const [session, repo] = await Promise.all([
      this.list('session', threadId),
      this.list('repo', repoId),
    ]);

    return { session, repo };
  }

  /**
   * Deletes all memories for a given scope and scope ID.
   */
  async deleteAllByScope(scope: MemoryScope, scopeId: string): Promise<number> {
    return this.repository.deleteAllByScope(scope, scopeId);
  }
}
