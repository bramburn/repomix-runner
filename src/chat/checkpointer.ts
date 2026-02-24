import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { logger } from '../shared/logger.js';

let checkpointerInstance: PostgresSaver | null = null;

/**
 * Creates a PostgreSQL-backed LangGraph checkpointer for HITL workflow state persistence.
 * Accepts either a connection string directly or extracts it from environment.
 *
 * The checkpointer enables:
 * - Graph state persistence across extension restarts
 * - Resume from interrupt points after user input
 * - Multi-step HITL workflows with human review checkpoints
 */
export async function createCheckpointer(connectionStringOrPool: string | Pool): Promise<PostgresSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  logger.both.info('[Checkpointer] Creating PostgreSQL checkpointer...');

  if (typeof connectionStringOrPool === 'string') {
    // Direct connection string
    checkpointerInstance = PostgresSaver.fromConnString(connectionStringOrPool);
  } else {
    // Extract connection string from Pool config
    // pg.Pool stores config in various internal properties depending on version
    const pool = connectionStringOrPool;
    const config = (pool as any).options ?? {};
    const connString =
      config.connectionString ??
      buildConnectionString(config);

    if (!connString) {
      throw new Error(
        'Checkpointer: Unable to extract connection string from Pool. ' +
        'Pass the connection string directly to createCheckpointer().'
      );
    }

    checkpointerInstance = PostgresSaver.fromConnString(connString);
  }

  // Setup creates the checkpoint tables if they don't exist
  await checkpointerInstance.setup();

  logger.both.info('[Checkpointer] PostgreSQL checkpointer ready');

  return checkpointerInstance;
}

/**
 * Attempts to build a connection string from individual pool config properties.
 */
function buildConnectionString(config: Record<string, any>): string {
  const host = config.host ?? 'localhost';
  const port = config.port ?? 5432;
  const database = config.database;
  const user = config.user;
  const password = config.password;

  if (!database || !user) {
    return '';
  }

  const encodedPassword = password ? `:${encodeURIComponent(password)}` : '';
  return `postgresql://${user}${encodedPassword}@${host}:${port}/${database}`;
}

/**
 * Gets the existing checkpointer instance.
 * Throws if createCheckpointer hasn't been called first.
 */
export function getCheckpointer(): PostgresSaver {
  if (!checkpointerInstance) {
    throw new Error(
      'Checkpointer not initialized. Call createCheckpointer() first.'
    );
  }
  return checkpointerInstance;
}

/**
 * Resets the checkpointer instance (for testing or cleanup).
 */
export function resetCheckpointer(): void {
  checkpointerInstance = null;
}
