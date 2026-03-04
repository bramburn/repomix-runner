-- Up Migration

-- Add source column to chat_memory for provenance tracking
ALTER TABLE chat_memory
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'auto'));
