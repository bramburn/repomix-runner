-- PRD: Code Enrichment Feature
-- Migration to add code_enrichments table for storing LLM-generated symbol summaries

CREATE TABLE IF NOT EXISTS code_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL CHECK (symbol_type IN ('function', 'method', 'class', 'interface', 'type')),
  summary TEXT NOT NULL,
  signature TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  git_commit TEXT,
  UNIQUE(file_path, symbol_name, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_enrichments_file ON code_enrichments(file_path, repo_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_symbol ON code_enrichments(symbol_name, repo_id);

COMMENT ON COLUMN code_enrichments.file_path IS 'Absolute or relative path to the source file';
COMMENT ON COLUMN code_enrichments.repo_id IS 'Repository identifier for multi-repo support';
COMMENT ON COLUMN code_enrichments.symbol_name IS 'Name of the function/method/class/etc';
COMMENT ON COLUMN code_enrichments.symbol_type IS 'Type of symbol (function, method, class, interface, type)';
COMMENT ON COLUMN code_enrichments.summary IS 'LLM-generated one-line description of what the symbol does';
COMMENT ON COLUMN code_enrichments.signature IS 'Full function/method signature for matching during compression';
COMMENT ON COLUMN code_enrichments.line_start IS 'Starting line number in the source file';
COMMENT ON COLUMN code_enrichments.line_end IS 'Ending line number in the source file';
COMMENT ON COLUMN code_enrichments.git_commit IS 'Git commit hash when enrichment was generated (for cache invalidation)';
