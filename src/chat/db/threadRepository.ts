import { Pool } from 'pg';
import { Thread } from '../../types/chat.js';

const DEFAULT_THREAD_TITLE = 'New Chat';

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

export class ThreadRepository {
  constructor(private readonly pool: Pool) {}

  async createThread(repoId: string, title: string = DEFAULT_THREAD_TITLE): Promise<Thread> {
    const result = await this.pool.query<ThreadRow>(
      `INSERT INTO chat_threads (repo_id, title)
       VALUES ($1, $2)
       RETURNING *`,
      [repoId, title]
    );
    return rowToThread(result.rows[0]);
  }

  async getThreads(repoId: string): Promise<Thread[]> {
    const result = await this.pool.query<ThreadRow>(
      `SELECT * FROM chat_threads
       WHERE repo_id = $1 AND status = 'active'
       ORDER BY updated_at DESC`,
      [repoId]
    );
    return result.rows.map(rowToThread);
  }

  async getThread(id: string): Promise<Thread | null> {
    const result = await this.pool.query<ThreadRow>(
      `SELECT * FROM chat_threads WHERE id = $1`,
      [id]
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
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (patch.title !== undefined) {
      sets.push(`title = $${paramIndex++}`);
      values.push(patch.title);
    }
    if (patch.preview !== undefined) {
      sets.push(`preview = $${paramIndex++}`);
      values.push(patch.preview);
    }
    if (patch.totalTokens !== undefined) {
      sets.push(`total_tokens = $${paramIndex++}`);
      values.push(patch.totalTokens);
    }
    if (patch.totalCostUsd !== undefined) {
      sets.push(`total_cost_usd = $${paramIndex++}`);
      values.push(patch.totalCostUsd);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE chat_threads SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async renameThread(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await this.pool.query(
      `UPDATE chat_threads SET title = $1, updated_at = NOW() WHERE id = $2`,
      [trimmed, id]
    );
  }

  async deleteThread(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM chat_threads WHERE id = $1`, [id]);
  }
}
