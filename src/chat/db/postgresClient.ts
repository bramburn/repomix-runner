import { Pool, PoolConfig } from 'pg';
import { logger } from '../../shared/logger.js';

let pool: Pool | null = null;

const MIGRATION_SQL = `
-- PRD 001: PostgreSQL Chat Storage - Initial Schema

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
);

CREATE INDEX IF NOT EXISTS idx_threads_repo_updated ON chat_threads(repo_id, updated_at DESC);

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
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, timestamp);

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
);

CREATE INDEX IF NOT EXISTS idx_memory_scope ON chat_memory(scope, scope_id);

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
);

CREATE INDEX IF NOT EXISTS idx_batch_thread ON batch_jobs(thread_id);
CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_jobs(status);

CREATE TABLE IF NOT EXISTS repo_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id TEXT NOT NULL UNIQUE,
  markdown_tree TEXT NOT NULL,
  folder_explanations JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  git_commit TEXT,
  tokens_used INTEGER
);
`;

async function runMigrations(p: Pool): Promise<void> {
  const client = await p.connect();
  try {
    // Check if tables already exist
    const result = await client.query(
      `SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_threads'
      ) AS exists`
    );

    if (result.rows[0].exists) {
      console.log('[PostgresClient] Tables already exist, skipping migration');
      return;
    }

    console.log('[PostgresClient] Running initial migration...');
    await client.query('BEGIN');
    await client.query(MIGRATION_SQL);
    await client.query('COMMIT');
    console.log('[PostgresClient] Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function initPool(connectionString: string): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  pool = new Pool(config);

  // Test connection and run migrations
  await runMigrations(pool);

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error(
      'PostgreSQL pool not initialized. Set "repomix.chat.postgresConnectionString" in VS Code settings.'
    );
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[PostgresClient] Pool closed');
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const p = getPool();
    const result = await p.query('SELECT version()');
    const version = result.rows[0].version as string;
    return { success: true, message: version };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message };
  }
}
