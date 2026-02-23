import { Pool } from 'pg';

/**
 * Batch job status enumeration.
 */
export type BatchJobStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Package type enumeration.
 */
export type PackageType = 'plan' | 'code_change' | 'code_review';

/**
 * Batch job entity from database.
 */
export interface BatchJob {
  id: string;
  threadId: string | null;
  batchApiId: string | null;
  status: BatchJobStatus;
  packageType: PackageType;
  promptPayload: object;
  responsePayload: object | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: number | null;
  createdAt: number;
  submittedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
  metadata: object | null;
}

/**
 * BatchRepository - CRUD for batch_jobs table.
 * Manages batch job records for the HITL workflow.
 */
export class BatchRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Creates a new batch job record.
   */
  async createBatchJob(data: {
    threadId?: string;
    packageType: PackageType;
    promptPayload: object;
    metadata?: object;
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO batch_jobs (thread_id, package_type, prompt_payload, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [data.threadId || null, data.packageType, JSON.stringify(data.promptPayload), data.metadata ? JSON.stringify(data.metadata) : null]
    );
    return result.rows[0].id as string;
  }

  /**
   * Gets a batch job by ID.
   */
  async getBatchJob(id: string): Promise<BatchJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM batch_jobs WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Lists batch jobs, optionally filtered by thread ID.
   */
  async listBatchJobs(threadId?: string): Promise<BatchJob[]> {
    let query = 'SELECT * FROM batch_jobs';
    const params: string[] = [];

    if (threadId) {
      query += ' WHERE thread_id = $1';
      params.push(threadId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Updates a batch job with partial data.
   */
  async updateBatchJob(
    id: string,
    patch: {
      batchApiId?: string;
      status?: BatchJobStatus;
      packageType?: PackageType;
      promptPayload?: object;
      responsePayload?: object;
      tokensInput?: number;
      tokensOutput?: number;
      costUsd?: number;
      submittedAt?: Date;
      completedAt?: Date;
      errorMessage?: string;
      metadata?: object;
    }
  ): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (patch.batchApiId !== undefined) {
      updates.push(`batch_api_id = $${paramIndex++}`);
      values.push(patch.batchApiId);
    }
    if (patch.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(patch.status);
    }
    if (patch.packageType !== undefined) {
      updates.push(`package_type = $${paramIndex++}`);
      values.push(patch.packageType);
    }
    if (patch.promptPayload !== undefined) {
      updates.push(`prompt_payload = $${paramIndex++}`);
      values.push(JSON.stringify(patch.promptPayload));
    }
    if (patch.responsePayload !== undefined) {
      updates.push(`response_payload = $${paramIndex++}`);
      values.push(JSON.stringify(patch.responsePayload));
    }
    if (patch.tokensInput !== undefined) {
      updates.push(`tokens_input = $${paramIndex++}`);
      values.push(patch.tokensInput);
    }
    if (patch.tokensOutput !== undefined) {
      updates.push(`tokens_output = $${paramIndex++}`);
      values.push(patch.tokensOutput);
    }
    if (patch.costUsd !== undefined) {
      updates.push(`cost_usd = $${paramIndex++}`);
      values.push(patch.costUsd);
    }
    if (patch.submittedAt !== undefined) {
      updates.push(`submitted_at = $${paramIndex++}`);
      values.push(patch.submittedAt);
    }
    if (patch.completedAt !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(patch.completedAt);
    }
    if (patch.errorMessage !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(patch.errorMessage);
    }
    if (patch.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(patch.metadata));
    }

    if (updates.length === 0) {
      return;
    }

    values.push(id);
    await this.pool.query(
      `UPDATE batch_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Gets all pending batches (for external poller).
   */
  async getPendingBatches(): Promise<BatchJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM batch_jobs 
       WHERE status IN ('submitted', 'processing') 
       ORDER BY created_at ASC`
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Gets batches by status.
   */
  async getBatchesByStatus(status: BatchJobStatus): Promise<BatchJob[]> {
    const result = await this.pool.query(
      `SELECT * FROM batch_jobs WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Deletes a batch job.
   */
  async deleteBatchJob(id: string): Promise<void> {
    await this.pool.query('DELETE FROM batch_jobs WHERE id = $1', [id]);
  }

  /**
   * Maps a database row to a BatchJob object.
   */
  private mapRow(row: Record<string, unknown>): BatchJob {
    return {
      id: row.id as string,
      threadId: row.thread_id as string | null,
      batchApiId: row.batch_api_id as string | null,
      status: row.status as BatchJobStatus,
      packageType: row.package_type as PackageType,
      promptPayload: row.prompt_payload as object,
      responsePayload: row.response_payload as object | null,
      tokensInput: row.tokens_input as number | null,
      tokensOutput: row.tokens_output as number | null,
      costUsd: row.cost_usd !== null ? Number(row.cost_usd) : null,
      createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string).getTime() : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string).getTime() : null,
      errorMessage: row.error_message as string | null,
      metadata: row.metadata as object | null,
    };
  }
}
