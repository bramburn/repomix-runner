import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { logger } from '../shared/logger.js';

let checkpointerInstance: PostgresSaver | null = null;

/**
 * Creates a PostgreSQL-backed LangGraph checkpointer for HITL workflow state persistence.
 * Uses the existing PG pool from PRD 001 to store graph checkpoints.
 *
 * The checkpointer enables:
 * - Graph state persistence across extension restarts
 * - Resume from interrupt points after user input
 * - Multi-step HITL workflows with human review checkpoints
 */
export async function createCheckpointer(pool: Pool): Promise<PostgresSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  logger.both.info('[Checkpointer] Creating PostgreSQL checkpointer...');

  // Create the PostgresSaver with the connection pool
  // Note: PostgresSaver expects a connection pool or connection string
  checkpointerInstance = PostgresSaver.fromConnString(
    // Extract connection string from pool config
    // The pool stores the connection info internally
    pool.options.connectionString || ''
  );

  // Setup creates the checkpoint tables if they don't exist
  await checkpointerInstance.setup();

  logger.both.info('[Checkpointer] PostgreSQL checkpointer ready');

  return checkpointerInstance;
}

/**
 * Gets the existing checkpointer instance.
 * Throws if createCheckpointer hasn't been called first.
 */
export function getCheckpointer(): PostgresSaver {
  if (!checkpointerInstance) {
    throw new Error(
      'Checkpointer not initialized. Call createCheckpointer(pool) first.'
    );
  }
  return checkpointerInstance;
}

/**
 * Resets the checkpointer instance (for testing).
 */
export function resetCheckpointer(): void {
  checkpointerInstance = null;
}
