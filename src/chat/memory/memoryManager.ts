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
  private static readonly THREAD_ID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(pool: Pool) {
    this.repository = new MemoryRepository(pool);
  }

  private normalizeScopeId(scope: MemoryScope, scopeId: string): string {
    const normalizedScopeId = (scopeId ?? '').trim();
    if (!normalizedScopeId) {
      throw new Error('Memory scopeId cannot be empty');
    }

    if (scope === 'session' && !MemoryManager.THREAD_ID_REGEX.test(normalizedScopeId)) {
      throw new Error('Session memories require a valid threadId UUID as scopeId');
    }

    if (scope === 'global' && normalizedScopeId !== 'global') {
      throw new Error('Global memories must use scopeId "global"');
    }

    return normalizedScopeId;
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

    const scopeId = this.normalizeScopeId(input.scope, input.scopeId);

    return this.repository.createMemory({
      scope: input.scope,
      scopeId,
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
    const normalizedScopeId = this.normalizeScopeId(scope, scopeId);
    return this.repository.listMemoryByScope(scope, normalizedScopeId, false);
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
    const normalizedScopeId = this.normalizeScopeId(scope, scopeId);
    if (!query || query.trim().length === 0) {
      return this.list(scope, normalizedScopeId);
    }
    return this.repository.searchByKeyword(scope, normalizedScopeId, query.trim());
  }

  /**
   * Checks if a memory with the given key exists in the specified scope.
   */
  async exists(scope: MemoryScope, scopeId: string, key: string): Promise<boolean> {
    const normalizedScopeId = this.normalizeScopeId(scope, scopeId);
    return this.repository.existsByKey(scope, normalizedScopeId, key);
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
    const normalizedScopeId = this.normalizeScopeId(scope, scopeId);
    return this.repository.deleteAllByScope(scope, normalizedScopeId);
  }
}
