import { Pool } from 'pg';
import { logger } from '../../shared/logger.js';
import type { MemoryScope, MemorySource, MemoryEntry } from '../memory/types.js';

/**
 * Database row structure for chat_memory table.
 */
interface MemoryRow {
  id: string;
  scope: MemoryScope;
  scope_id: string;
  key: string;
  value: string;
  source: MemorySource;
  embedding_vector: number[] | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
}

/**
 * Maps a database row to a MemoryEntry object.
 */
function mapRowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    key: row.key,
    value: row.value,
    source: row.source,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    expiresAt: row.expires_at ? row.expires_at.getTime() : null,
  };
}

/**
 * MemoryRepository - CRUD operations for chat_memory table.
 */
export class MemoryRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Creates a new memory entry.
   * @throws Error if a memory with the same (scope, scope_id, key) already exists.
   */
  async createMemory(data: {
    scope: MemoryScope;
    scopeId: string;
    key: string;
    value: string;
    source: MemorySource;
    embeddingVector?: number[] | null;
    expiresAt?: Date | null;
  }): Promise<MemoryEntry> {
    try {
      const result = await this.pool.query<MemoryRow>(
        `INSERT INTO chat_memory (scope, scope_id, key, value, source, embedding_vector, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          data.scope,
          data.scopeId,
          data.key,
          data.value,
          data.source,
          data.embeddingVector ?? null,
          data.expiresAt ?? null,
        ]
      );
      return mapRowToEntry(result.rows[0]);
    } catch (error: unknown) {
      // Handle unique constraint violation
      if (
        error instanceof Error &&
        error.message.includes('duplicate key value violates unique constraint')
      ) {
        throw new Error(
          `A memory with key "${data.key}" already exists in ${data.scope} scope for this ${data.scope === 'session' ? 'thread' : 'repository'}.`
        );
      }
      logger.both.error('[MemoryRepository] createMemory failed:', error);
      throw error;
    }
  }

  /**
   * Retrieves a memory entry by ID.
   */
  async getMemoryById(id: string): Promise<MemoryEntry | null> {
    const result = await this.pool.query<MemoryRow>(
      'SELECT * FROM chat_memory WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToEntry(result.rows[0]);
  }

  /**
   * Retrieves a memory entry by scope, scopeId, and key.
   * Returns null if not found.
   */
  async getMemory(
    scope: MemoryScope,
    scopeId: string,
    key: string
  ): Promise<MemoryEntry | null> {
    const result = await this.pool.query<MemoryRow>(
      'SELECT * FROM chat_memory WHERE scope = $1 AND scope_id = $2 AND key = $3 LIMIT 1',
      [scope, scopeId, key]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToEntry(result.rows[0]);
  }

  /**
   * Lists all memories for a given scope and scope ID.
   * Excludes expired memories by default.
   */
  async listMemoryByScope(
    scope: MemoryScope,
    scopeId: string,
    includeExpired = false
  ): Promise<MemoryEntry[]> {
    let query = `
      SELECT * FROM chat_memory 
      WHERE scope = $1 AND scope_id = $2
    `;

    if (!includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query<MemoryRow>(query, [scope, scopeId]);
    return result.rows.map(mapRowToEntry);
  }

  /**
   * Alias for listMemoryByScope to match PRD 001 specification.
   */
  async listMemories(
    scope: MemoryScope,
    scopeId: string,
    includeExpired = false
  ): Promise<MemoryEntry[]> {
    return this.listMemoryByScope(scope, scopeId, includeExpired);
  }

  /**
   * Updates an existing memory entry.
   * At least one field must be provided.
   */
  async updateMemory(
    id: string,
    patch: {
      value?: string;
      embeddingVector?: number[] | null;
      expiresAt?: Date | null;
    }
  ): Promise<MemoryEntry> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (patch.value !== undefined) {
      setClauses.push(`value = $${paramIndex++}`);
      values.push(patch.value);
    }

    if (patch.embeddingVector !== undefined) {
      setClauses.push(`embedding_vector = $${paramIndex++}`);
      values.push(patch.embeddingVector);
    }

    if (patch.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIndex++}`);
      values.push(patch.expiresAt);
    }

    if (setClauses.length === 0) {
      throw new Error('At least one field must be provided to update');
    }

    // Always update updated_at
    setClauses.push('updated_at = NOW()');

    values.push(id);

    const query = `
      UPDATE chat_memory 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query<MemoryRow>(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Memory with id "${id}" not found`);
    }

    return mapRowToEntry(result.rows[0]);
  }

  /**
   * Deletes a memory entry by ID.
   */
  async deleteMemory(id: string): Promise<void> {
    const result = await this.pool.query('DELETE FROM chat_memory WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      logger.both.warn(`[MemoryRepository] Memory with id "${id}" not found for deletion`);
    }
  }

  /**
   * Searches memories by keyword matching on key and value.
   * Uses case-insensitive ILIKE search.
   */
  /**
   * Escapes LIKE wildcard characters (%, _, \) in user input.
   */
  private escapeLikePattern(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }

  /**
   * Searches memories by keyword matching on key and value.
   * Uses case-insensitive ILIKE search with properly escaped wildcards.
   */
  async searchByKeyword(
    scope: MemoryScope,
    scopeId: string,
    query: string
  ): Promise<MemoryEntry[]> {
    const escapedQuery = this.escapeLikePattern(query);
    const searchPattern = `%${escapedQuery}%`;

    const result = await this.pool.query<MemoryRow>(
      `SELECT * FROM chat_memory 
       WHERE scope = $1 AND scope_id = $2 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (key ILIKE $3 OR value ILIKE $3)
       ORDER BY created_at DESC`,
      [scope, scopeId, searchPattern]
    );

    return result.rows.map(mapRowToEntry);
  }

  /**
   * Deletes all memories for a given scope and scope ID.
   * Useful for cleanup when a thread or repo is deleted.
   */
  async deleteAllByScope(scope: MemoryScope, scopeId: string): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM chat_memory WHERE scope = $1 AND scope_id = $2',
      [scope, scopeId]
    );

    return result.rowCount ?? 0;
  }

  /**
   * Checks if a memory with the given key exists in the specified scope.
   */
  async existsByKey(scope: MemoryScope, scopeId: string, key: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM chat_memory WHERE scope = $1 AND scope_id = $2 AND key = $3 LIMIT 1',
      [scope, scopeId, key]
    );

    return result.rows.length > 0;
  }

  /**
   * Upserts a memory entry - creates if not exists, updates if does.
   * Uses ON CONFLICT to handle the unique constraint on (scope, scope_id, key).
   */
  async upsertMemory(data: {
    scope: MemoryScope;
    scopeId: string;
    key: string;
    value: string;
    source: MemorySource;
    embeddingVector?: number[] | null;
    expiresAt?: Date | null;
  }): Promise<MemoryEntry> {
    try {
      const result = await this.pool.query<MemoryRow>(
        `INSERT INTO chat_memory (scope, scope_id, key, value, source, embedding_vector, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (scope, scope_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           source = EXCLUDED.source,
           embedding_vector = EXCLUDED.embedding_vector,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
         RETURNING *`,
        [
          data.scope,
          data.scopeId,
          data.key,
          data.value,
          data.source,
          data.embeddingVector ?? null,
          data.expiresAt ?? null,
        ]
      );
      return mapRowToEntry(result.rows[0]);
    } catch (error: unknown) {
      logger.both.error('[MemoryRepository] upsertMemory failed:', error);
      throw error;
    }
  }
}
