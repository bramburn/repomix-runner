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
  is_compressed: boolean | null;
  original_content: string | null;
  compressed_into: string | null;
  compression_metadata: unknown | null;
}

function safePreview(content: string, maxLength = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function assertNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
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
    const normalizedThreadId = assertNonEmpty(threadId, 'threadId');
    const role = message.role;
    if (role !== 'user' && role !== 'assistant') {
      throw new Error('message.role must be either "user" or "assistant".');
    }
    assertNonEmpty(message.content, 'message.content');
    const content = message.content;
    if (!Number.isFinite(message.timestamp)) {
      throw new Error('message.timestamp must be a valid epoch milliseconds number.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO chat_messages (id, thread_id, role, content, timestamp, model, tokens_input, tokens_output, tokens_total, cost_usd, context_files, tool_calls)
         VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), $6, $7, $8, $9, $10, $11, $12)`,
        [
          message.id,
          normalizedThreadId,
          role,
          content,
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

      await client.query(
        `UPDATE chat_threads
         SET updated_at = NOW(),
             preview = $1,
             total_tokens = total_tokens + $2
         WHERE id = $3`,
        [safePreview(content), message.tokens?.total ?? 0, normalizedThreadId]
      );

      if (role === 'user') {
        await client.query(
          `UPDATE chat_threads
           SET title = CASE WHEN title = 'New Chat' THEN $1 ELSE title END
           WHERE id = $2`,
          [safePreview(content, 50), normalizedThreadId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    const normalizedThreadId = assertNonEmpty(threadId, 'threadId');
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM chat_messages
       WHERE thread_id = $1
       ORDER BY timestamp ASC`,
      [normalizedThreadId]
    );
    return result.rows.map(rowToMessage);
  }

  async deleteMessage(id: string): Promise<void> {
    const normalizedId = assertNonEmpty(id, 'id');
    await this.pool.query(`DELETE FROM chat_messages WHERE id = $1`, [normalizedId]);
  }

  /**
   * Get uncompressed messages for a thread (for prompt building).
   * Excludes messages that have been compressed into summaries.
   */
  async getUncompressedMessages(threadId: string): Promise<ThreadMessage[]> {
    const normalizedThreadId = assertNonEmpty(threadId, 'threadId');
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM chat_messages
       WHERE thread_id = $1
         AND (is_compressed IS NULL OR is_compressed = false)
       ORDER BY timestamp ASC`,
      [normalizedThreadId]
    );
    return result.rows.map(rowToMessage);
  }

  /**
   * Mark messages as compressed and link them to a summary message.
   */
  async markMessagesAsCompressed(
    messageIds: string[],
    summaryMessageId: string,
    metadata?: { tokensSaved?: number; compressionTimestamp?: Date }
  ): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const messageId of messageIds) {
        await client.query(
          `UPDATE chat_messages
           SET is_compressed = true,
               original_content = CASE WHEN original_content IS NULL THEN content ELSE original_content END,
               compressed_into = $1,
               compression_metadata = $2
           WHERE id = $3`,
          [summaryMessageId, metadata ? JSON.stringify(metadata) : null, messageId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save a summary message (system role) that represents compressed messages.
   */
  async saveSummaryMessage(
    threadId: string,
    summaryContent: string,
    originalMessageIds: string[],
    tokenCount: number
  ): Promise<string> {
    const normalizedThreadId = assertNonEmpty(threadId, 'threadId');
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    await this.pool.query(
      `INSERT INTO chat_messages (id, thread_id, role, content, timestamp, tokens_total, metadata)
       VALUES ($1, $2, 'system', $3, to_timestamp($4::double precision / 1000), $5, $6)`,
      [
        id,
        normalizedThreadId,
        summaryContent,
        timestamp,
        tokenCount,
        JSON.stringify({
          isSummary: true,
          originalMessageIds,
          originalMessageCount: originalMessageIds.length,
        }),
      ]
    );

    return id;
  }

  /**
   * Get summary messages for a thread.
   */
  async getSummaryMessages(threadId: string): Promise<ThreadMessage[]> {
    const normalizedThreadId = assertNonEmpty(threadId, 'threadId');
    const result = await this.pool.query<MessageRow>(
      `SELECT * FROM chat_messages
       WHERE thread_id = $1
         AND role = 'system'
         AND metadata->>'isSummary' = 'true'
       ORDER BY timestamp ASC`,
      [normalizedThreadId]
    );
    return result.rows.map(rowToMessage);
  }
}
