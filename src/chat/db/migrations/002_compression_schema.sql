-- Up Migration

-- Migration to add compression tracking columns to chat_messages table
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_content TEXT,
ADD COLUMN IF NOT EXISTS compressed_into UUID REFERENCES chat_messages(id),
ADD COLUMN IF NOT EXISTS compression_metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_messages_compressed ON chat_messages(thread_id, is_compressed);
CREATE INDEX IF NOT EXISTS idx_messages_compressed_into ON chat_messages(compressed_into) WHERE compressed_into IS NOT NULL;

COMMENT ON COLUMN chat_messages.is_compressed IS 'True if this message has been compressed into a summary';
COMMENT ON COLUMN chat_messages.original_content IS 'Original content before compression (for recovery)';
COMMENT ON COLUMN chat_messages.compressed_into IS 'ID of the summary message this message was compressed into';
COMMENT ON COLUMN chat_messages.compression_metadata IS 'Metadata about the compression operation (timestamp, tokens saved, etc.)';
