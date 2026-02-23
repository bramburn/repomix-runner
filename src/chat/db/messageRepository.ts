import { Pool } from 'pg';
import { ThreadMessage } from '../../types/chat.js';

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  timestamp: Date;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number | null;
  cost_usd: string | null;
  context_files: string[] | null;
  tool_calls: unknown | null;
  metadata: unknown | null;
}

function safePreview(content: string, maxLength = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function rowToMessage(row: MessageRow): ThreadMessage {
  const message: ThreadMessage = {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    timestamp: new Date(row.timestamp).getTime(),
  };

  if (row.model) {
    message.model = row.model;
  }

  if (row.tokens_input !== null || row.tokens_output !== null || row.tokens_total !== null) {
    message.tokens = {
      input: row.tokens_input ?? 0,
      output: row.tokens_output ?? 0,
      total: row.tokens_total ?? 0,
    };
  }

  if (row.context_files && row.context_files.length > 0) {
    message.contextFiles = row.context_files;
  }

  if (row.tool_calls) {
    message.toolCalls = row.tool_calls as ThreadMessage['toolCalls'];
  }

  return message;
}

export class MessageRepository {
  constructor(private readonly pool: Pool) {}

  async saveMessage(threadId: string, message: ThreadMessage): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO chat_messages (id, thread_id, role, content, timestamp, model, tokens_input, tokens_output, tokens_total, cost_usd, context_files, tool_calls)
         VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), $6, $7, $8, $9, $10, $11, $12)`,
        [
          message.id,
          threadId,
          message.role,
          message.content,
          message.timestamp,
          message.model ?? null,
          message.tokens?.input ?? null,
          message.tokens?.output ?? null,
          message.tokens?.total ?? null,
          null, // cost_usd - calculated separately
          message.contextFiles && message.contextFiles.length > 0 ? message.contextFiles : null,
          message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        ]
      );

      // Update thread: updated_at, preview, auto-title on first user message, token totals
      const updates: string[] = ['updated_at = NOW()'];
      const updateValues: unknown[] = [];
      let paramIdx = 1;

      // Always update preview
      updates.push(`preview = $${paramIdx++}`);
      updateValues.push(safePreview(message.content));

      // Update total_tokens if message has token info
      if (message.tokens?.total) {
        updates.push(`total_tokens = total_tokens + $${paramIdx++}`);
        updateValues.push(message.tokens.total);
      }

      // Auto-title: set title to first user message content if still default
      if (message.role === 'user') {
        updates.push(
          `title = CASE WHEN title = 'New Chat' THEN $${paramIdx++} ELSE title END`
        );
        updateValues.push(safePreview(message.content, 50));
      }

      updateValues.push(threadId);

      await client.query(
        `UPDATE chat_threads SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        updateValues
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM chat_messages
       WHERE thread_id = $1
       ORDER BY timestamp ASC`,
      [threadId]
    );
    return result.rows.map(rowToMessage);
  }

  async deleteMessage(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM chat_messages WHERE id = $1`, [id]);
  }
}
