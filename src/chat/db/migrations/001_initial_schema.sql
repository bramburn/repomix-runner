-- PRD 001: PostgreSQL Chat Storage - Initial Schema
-- This file is for documentation/reference. The actual SQL is embedded in postgresClient.ts.

-- Chat threads (replaces threads.json)
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

-- Chat messages (replaces {threadId}.json files)
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
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, timestamp);

-- Memory entries (for Memory Manager CRUD - PRD 004)
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

-- Batch jobs (for Batch LLM Pipeline - PRD 005)
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

-- Repo architecture snapshots (for PRD 008)
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
