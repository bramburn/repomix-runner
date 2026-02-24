import { Pool } from 'pg';
import { Thread } from '../../types/chat.js';

const DEFAULT_THREAD_TITLE = 'New Chat';
const MAX_THREAD_TITLE_LENGTH = 200;

interface ThreadRow {
  id: string;
  repo_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  total_tokens: number;
  total_cost_usd: string;
  preview: string;
  status: string;
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    totalTokens: row.total_tokens ?? 0,
    preview: row.preview ?? '',
  };
}

function assertNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

function normalizeTitle(title: string): string {
  const trimmed = assertNonEmpty(title, 'title');
  if (trimmed.length > MAX_THREAD_TITLE_LENGTH) {
    throw new Error(`title must be ${MAX_THREAD_TITLE_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function assertNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}

function assertNonNegativeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
  return value;
}

export class ThreadRepository {
  constructor(private readonly pool: Pool) {}

  async createThread(repoId: string, title: string = DEFAULT_THREAD_TITLE): Promise<Thread> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');
    const normalizedTitle = normalizeTitle(title);
    const result = await this.pool.query<ThreadRow>(
      `INSERT INTO chat_threads (repo_id, title)
       VALUES ($1, $2)
       RETURNING *`,
      [normalizedRepoId, normalizedTitle]
    );
    return rowToThread(result.rows[0]);
  }

  async getThreads(repoId: string): Promise<Thread[]> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');
    const result = await this.pool.query<ThreadRow>(
      `SELECT * FROM chat_threads
       WHERE repo_id = $1 AND status = 'active'
       ORDER BY updated_at DESC`,
      [normalizedRepoId]
    );
    return result.rows.map(rowToThread);
  }

  async getThread(id: string): Promise<Thread | null> {
    const normalizedId = assertNonEmpty(id, 'id');
    const result = await this.pool.query<ThreadRow>(
      `SELECT * FROM chat_threads WHERE id = $1`,
      [normalizedId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return rowToThread(result.rows[0]);
  }

  async updateThread(
    id: string,
    patch: Partial<{
      title: string;
      preview: string;
      totalTokens: number;
      totalCostUsd: number;
    }>
  ): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (patch.title !== undefined) {
      sets.push(`title = $${paramIndex++}`);
      values.push(normalizeTitle(patch.title));
    }
    if (patch.preview !== undefined) {
      sets.push(`preview = $${paramIndex++}`);
      values.push(patch.preview);
    }
    if (patch.totalTokens !== undefined) {
      sets.push(`total_tokens = $${paramIndex++}`);
      values.push(assertNonNegativeInteger(patch.totalTokens, 'totalTokens'));
    }
    if (patch.totalCostUsd !== undefined) {
      sets.push(`total_cost_usd = $${paramIndex++}`);
      values.push(assertNonNegativeNumber(patch.totalCostUsd, 'totalCostUsd'));
    }

    if (sets.length === 0) {
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(normalizedId);

    await this.pool.query(
      `UPDATE chat_threads SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async renameThread(id: string, title: string): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    const trimmed = normalizeTitle(title);
    await this.pool.query(
      `UPDATE chat_threads SET title = $1, updated_at = NOW() WHERE id = $2`,
      [trimmed, normalizedId]
    );
  }

  async archiveThread(id: string): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    await this.pool.query(
      `UPDATE chat_threads SET status = 'archived', updated_at = NOW() WHERE id = $1`,
      [normalizedId]
    );
  }

  async unarchiveThread(id: string): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    await this.pool.query(
      `UPDATE chat_threads SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [normalizedId]
    );
  }

  async searchThreads(
    repoId: string,
    query: string,
    showArchived: boolean = false
  ): Promise<Array<Thread & { isArchived: boolean }>> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');
    const trimmedQuery = query.trim();
    const likeQuery = `%${trimmedQuery}%`;

    const result = await this.pool.query<ThreadRow>(
      `SELECT * FROM chat_threads
       WHERE repo_id = $1
         AND status != 'deleted'
         AND ($2 = '' OR title ILIKE $3 OR preview ILIKE $3)
         AND ($4::boolean OR status = 'active')
       ORDER BY updated_at DESC`,
      [normalizedRepoId, trimmedQuery, likeQuery, showArchived]
    );

    return result.rows.map((row) => ({
      ...rowToThread(row),
      isArchived: row.status === 'archived',
    }));
  }

  async deleteThread(id: string): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    await this.pool.query(
      `UPDATE chat_threads SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [normalizedId]
    );
  }
}
