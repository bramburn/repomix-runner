import { Pool, PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { logger } from '../../shared/logger.js';

let pool: Pool | null = null;
let poolPromise: Promise<Pool> | null = null;

// Migration version identifiers
const MIGRATION_001_INITIAL = '001_initial_schema';
const MIGRATION_002_MEMORY_SOURCE = '002_memory_source';

// SQL for migration 002: Add source column to chat_memory
const MIGRATION_002_SQL = `
  ALTER TABLE chat_memory 
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'auto'))
`;

// Individual table creation statements for better error isolation
const TABLE_STATEMENTS = {
  schemaMigrations: `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  chatThreads: `
    CREATE TABLE IF NOT EXISTS chat_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repo_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total_tokens INTEGER DEFAULT 0,
      total_cost_usd NUMERIC(10,6) DEFAULT 0,
      preview TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
    )
  `,
  chatThreadsIndex: `
    CREATE INDEX IF NOT EXISTS idx_threads_repo_updated ON chat_threads(repo_id, updated_at DESC)
  `,
  chatMessages: `
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      model TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      tokens_total INTEGER,
      cost_usd NUMERIC(10,6),
      context_files TEXT[],
      tool_calls JSONB,
      metadata JSONB,
      is_compressed BOOLEAN DEFAULT FALSE,
      original_content TEXT,
      compressed_into UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
      compression_metadata JSONB
    )
  `,
  chatMessagesIndex: `
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, timestamp)
  `,
  chatMemory: `
    CREATE TABLE IF NOT EXISTS chat_memory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope TEXT NOT NULL CHECK (scope IN ('session', 'repo', 'global')),
      scope_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      embedding_vector FLOAT8[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      UNIQUE(scope, scope_id, key)
    )
  `,
  chatMemoryIndex: `
    CREATE INDEX IF NOT EXISTS idx_memory_scope ON chat_memory(scope, scope_id)
  `,
  batchJobs: `
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID REFERENCES chat_threads(id),
      batch_api_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'submitted', 'processing', 'completed', 'failed', 'cancelled')),
      package_type TEXT NOT NULL CHECK (package_type IN ('plan', 'code_change', 'code_review')),
      prompt_payload JSONB NOT NULL,
      response_payload JSONB,
      tokens_input INTEGER,
      tokens_output INTEGER,
      cost_usd NUMERIC(10,6),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      error_message TEXT,
      metadata JSONB
    )
  `,
  batchJobsIndexes: `
    CREATE INDEX IF NOT EXISTS idx_batch_thread ON batch_jobs(thread_id);
    CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_jobs(status)
  `,
  repoArchitecture: `
    CREATE TABLE IF NOT EXISTS repo_architecture (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repo_id TEXT NOT NULL UNIQUE,
      markdown_tree TEXT NOT NULL,
      folder_explanations JSONB,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      git_commit TEXT,
      tokens_used INTEGER
    )
  `
};

interface TableStatus {
  chatThreads: boolean;
  chatMessages: boolean;
  chatMemory: boolean;
  batchJobs: boolean;
  repoArchitecture: boolean;
}

/**
 * Check if each required table exists individually
 */
async function checkTablesExist(client: PoolClient): Promise<TableStatus> {
  const tables = ['chat_threads', 'chat_messages', 'chat_memory', 'batch_jobs', 'repo_architecture'];
  const status: any = {};

  for (const tableName of tables) {
    const result = await client.query(
      `SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = $1
      ) AS exists`,
      [tableName]
    );
    // Convert snake_case to camelCase for the status object
    const key = tableName.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    status[key] = result.rows[0].exists;
  }

  return status as TableStatus;
}

/**
 * Check if migration has already been applied
 */
async function isMigrationApplied(client: PoolClient, version: string): Promise<boolean> {
  try {
    const result = await client.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version]
    );
    return result.rows.length > 0;
  } catch (error) {
    // schema_migrations table might not exist yet
    return false;
  }
}

/**
 * Record that a migration has been applied
 */
async function recordMigration(client: PoolClient, version: string): Promise<void> {
  await client.query(
    'INSERT INTO schema_migrations (version) VALUES ($1)',
    [version]
  );
}

/**
 * Run migration 002: Add source column to chat_memory table.
 * This migration is idempotent and can be run multiple times safely.
 */
async function runMigration002(client: PoolClient): Promise<void> {
  const alreadyApplied = await isMigrationApplied(client, MIGRATION_002_MEMORY_SOURCE);
  if (alreadyApplied) {
    logger.both.debug('[PostgresClient] Migration 002 already applied, skipping');
    return;
  }

  logger.both.info('[PostgresClient] Running migration 002: Add source column to chat_memory...');

  await client.query('BEGIN');
  try {
    await client.query(MIGRATION_002_SQL);
    await recordMigration(client, MIGRATION_002_MEMORY_SOURCE);
    await client.query('COMMIT');
    logger.both.info('[PostgresClient] Migration 002 completed successfully');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.both.error('[PostgresClient] Migration 002 failed:', error);
    throw error;
  }
}

async function runMigrations(p: Pool): Promise<void> {
  const client = await p.connect();
  
  try {
    // First, create schema_migrations table outside transaction (it's idempotent)
    await client.query(TABLE_STATEMENTS.schemaMigrations);
    
    // Check if initial migration has already been applied
    const initialApplied = await isMigrationApplied(client, MIGRATION_001_INITIAL);
    if (initialApplied) {
      logger.both.info('[PostgresClient] Initial migration already applied');
      // Run subsequent migrations
      await runMigration002(client);
      return;
    }

    // Check each table individually to handle partial failures
    const tables = await checkTablesExist(client);
    const allTablesExist = Object.values(tables).every(status => status === true);
    
    if (allTablesExist) {
      // All tables exist but migration wasn't recorded - record it now
      await client.query('BEGIN');
      await recordMigration(client, MIGRATION_001_INITIAL);
      await client.query('COMMIT');
      logger.both.info('[PostgresClient] All tables exist, initial migration recorded');
      // Run subsequent migrations
      await runMigration002(client);
      return;
    }

    // Some tables are missing - need to run migration
    logger.both.info('[PostgresClient] Running initial migration...');
    logger.both.debug('[PostgresClient] Table status:', tables);

    await client.query('BEGIN');
    
    try {
      // Create each table conditionally based on existence check
      if (!tables.chatThreads) {
        await client.query(TABLE_STATEMENTS.chatThreads);
        await client.query(TABLE_STATEMENTS.chatThreadsIndex);
      }
      
      if (!tables.chatMessages) {
        await client.query(TABLE_STATEMENTS.chatMessages);
        await client.query(TABLE_STATEMENTS.chatMessagesIndex);
      }
      
      if (!tables.chatMemory) {
        await client.query(TABLE_STATEMENTS.chatMemory);
        await client.query(TABLE_STATEMENTS.chatMemoryIndex);
      }
      
      if (!tables.batchJobs) {
        await client.query(TABLE_STATEMENTS.batchJobs);
        await client.query(TABLE_STATEMENTS.batchJobsIndexes);
      }
      
      if (!tables.repoArchitecture) {
        await client.query(TABLE_STATEMENTS.repoArchitecture);
      }
      
      // Record successful migration
      await recordMigration(client, MIGRATION_001_INITIAL);
      
      await client.query('COMMIT');
      logger.both.info('[PostgresClient] Initial migration completed successfully');

      // Run subsequent migrations
      await runMigration002(client);
    } catch (migrationError) {
      // Re-throw to be caught by outer try-catch for rollback
      throw migrationError;
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.both.error('[PostgresClient] Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function initPool(connectionString: string): Promise<Pool> {
  const startTime = Date.now();
  console.log('[PostgreSQL] Starting pool initialization...');

  if (!poolPromise) {
    console.log('[PostgreSQL] Creating new pool promise...');
    poolPromise = _initPoolImpl(connectionString);
  }

  try {
    const result = await poolPromise;
    console.log(`[PostgreSQL] Pool initialized in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.error(`[PostgreSQL] Pool initialization failed after ${Date.now() - startTime}ms:`, error);
    poolPromise = null;
    pool = null;
    throw error;
  }
}

async function _initPoolImpl(connectionString: string): Promise<Pool> {
  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  pool = new Pool(config);
  pool.on('error', (error) => {
    logger.both.error('[PostgresClient] Unexpected idle client error:', error);
  });

  // Test connection and run migrations
  await runMigrations(pool);

  return pool;
}

function isRetryablePoolError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('connection terminated') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error(
      'PostgreSQL pool not initialized. Configure the PostgreSQL connection string in the Repomix Runner Control Panel settings.'
    );
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    poolPromise = null;
    logger.both.info('[PostgresClient] Pool closed');
  }
}

export async function queryWithRetry<T extends QueryResultRow = any>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  const activePool = getPool();
  try {
    return await activePool.query<T>(text, values);
  } catch (error) {
    if (!isRetryablePoolError(error)) {
      throw error;
    }
    logger.both.warn('[PostgresClient] Query failed, retrying once:', error);
    await sleep(250);
    return activePool.query<T>(text, values);
  }
}

/**
 * Verify that all required tables exist and migration is properly recorded
 */
export async function verifyMigration(): Promise<{
  success: boolean;
  missingTables: string[];
  message: string;
}> {
  const client = await getPool().connect();
  
  try {
    // Check schema_migrations table exists
    const schemaMigrationsResult = await client.query(
      `SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'schema_migrations'
      ) AS exists`
    );

    if (!schemaMigrationsResult.rows[0].exists) {
      return {
        success: false,
        missingTables: ['schema_migrations'],
        message: 'schema_migrations table does not exist'
      };
    }

    // Check if migrations are recorded
    const migration001Applied = await isMigrationApplied(client, MIGRATION_001_INITIAL);
    const migration002Applied = await isMigrationApplied(client, MIGRATION_002_MEMORY_SOURCE);
    
    // Check all required tables
    const tables = await checkTablesExist(client);
    const missingTables: string[] = [];
    
    const tableNames: Array<keyof TableStatus> = ['chatThreads', 'chatMessages', 'chatMemory', 'batchJobs', 'repoArchitecture'];
    const tableToDbName: Record<string, string> = {
      chatThreads: 'chat_threads',
      chatMessages: 'chat_messages',
      chatMemory: 'chat_memory',
      batchJobs: 'batch_jobs',
      repoArchitecture: 'repo_architecture'
    };

    for (const tableName of tableNames) {
      if (!tables[tableName]) {
        missingTables.push(tableToDbName[tableName]);
      }
    }

    if (missingTables.length > 0) {
      return {
        success: false,
        missingTables,
        message: `Missing tables: ${missingTables.join(', ')}`
      };
    }

    if (!migration001Applied) {
      return {
        success: false,
        missingTables: [],
        message: 'Migration 001 (initial schema) not recorded in schema_migrations table'
      };
    }

    if (!migration002Applied) {
      return {
        success: false,
        missingTables: [],
        message: 'Migration 002 (memory source) not recorded in schema_migrations table'
      };
    }

    return {
      success: true,
      missingTables: [],
      message: 'All tables exist and all migrations are properly recorded'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      missingTables: [],
      message: `Verification failed: ${errorMessage}`
    };
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!pool) {
    return {
      success: false,
      message:
        'PostgreSQL is not configured yet. Set the connection string in the Repomix Runner Control Panel → Settings tab.',
    };
  }

  try {
    const result = await queryWithRetry('SELECT version()');
    const version = result.rows[0].version as string;
    
    // Also verify migration status
    const verification = await verifyMigration();
    
    return { 
      success: true, 
      message: `${version}\nMigration Status: ${verification.message}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}

/**
 * Test a PostgreSQL connection string without using the global pool.
 * This is useful for testing a new connection string before initializing the pool.
 */
export async function testConnectionString(connectionString: string): Promise<{ success: boolean; message: string }> {
  if (!connectionString || connectionString.trim().length === 0) {
    return {
      success: false,
      message: 'Connection string is empty',
    };
  }

  let tempPool: Pool | null = null;
  try {
    const config: PoolConfig = {
      connectionString,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    };

    tempPool = new Pool(config);

    // Try to connect and run a simple query
    const result = await tempPool.query('SELECT version()');
    const version = result.rows[0].version as string;

    // Verify migrations on this connection
    const client = await tempPool.connect();
    try {
      const migration001Applied = await isMigrationApplied(client, MIGRATION_001_INITIAL);
      const migration002Applied = await isMigrationApplied(client, MIGRATION_002_MEMORY_SOURCE);
      
      const tables = await checkTablesExist(client);
      const allTablesExist = Object.values(tables).every(status => status === true);
      
      let migrationStatus = '';
      if (!allTablesExist) {
        migrationStatus = '\n⚠️ Tables need to be created (will be created on first use)';
      } else if (!migration001Applied || !migration002Applied) {
        migrationStatus = '\n⚠️ Migrations need to be recorded (will be applied on first use)';
      } else {
        migrationStatus = '\n✅ All migrations applied';
      }
      
      return {
        success: true,
        message: `${version}${migrationStatus}`,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message,
    };
  } finally {
    if (tempPool) {
      await tempPool.end();
    }
  }
}
