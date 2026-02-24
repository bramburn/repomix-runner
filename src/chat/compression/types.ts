/**
 * Type definitions for the context compression pipeline.
 * PRD 003: Context Compression Strategy
 */

/**
 * Compression level applied to file content.
 * - 0: Full content (files < 200 tokens)
 * - 1: AST skeleton via compressFile()
 * - 2: Targeted extraction (specific functions/classes mentioned in goal)
 * - 3: LLM summary (unsupported languages or still too large)
 */
export type CompressionLevel = 0 | 1 | 2 | 3;

/**
 * Token budget allocation for different context categories.
 */
export interface TokenBudget {
  /** Total available tokens after threshold applied */
  total: number;
  /** Reserved tokens for system prompt */
  systemPrompt: number;
  /** Budget for conversation history summaries */
  conversationSummaries: number;
  /** Budget for recent messages kept in full */
  recentMessages: number;
  /** Budget for file context */
  fileContext: number;
  /** Reserved tokens for repo architecture markdown (anchored) */
  repoArchitecture: number;
  /** Reserved tokens for LLM output generation */
  outputReserve: number;
}

/**
 * Result of compressing a single file.
 */
export interface CompressedFile {
  /** Original file path */
  filePath: string;
  /** Original file content before compression */
  originalContent: string;
  /** Compressed content (may equal original if Level 0) */
  compressedContent: string;
  /** Token count of original content */
  originalTokens: number;
  /** Token count of compressed content */
  compressedTokens: number;
  /** Compression level applied */
  compressionLevel: CompressionLevel;
}

/**
 * A compressed segment of conversation history.
 */
export interface CompressedSegment {
  /** Unique identifier for this segment */
  id: string;
  /** IDs of original messages that were compressed into this segment */
  originalMessageIds: string[];
  /** Summarized content of the messages */
  summary: string;
  /** Token count of the summary */
  tokenCount: number;
  /** Number of messages compressed */
  messageCount: number;
  /** When this compression was created */
  createdAt: Date;
}

/**
 * Configuration for compression behavior.
 */
export interface CompressionConfig {
  /** Percentage of context window that triggers compression (default: 80) */
  contextThresholdPercent: number;
  /** Number of recent messages to keep in full before summarizing (default: 10) */
  maxRecentMessages: number;
  /** Model's maximum context window size in tokens */
  modelContextWindow: number;
  /** Number of messages to group together for summarization (default: 5) */
  messageGroupSize: number;
}

/**
 * Result of a compression operation.
 */
export interface CompressionResult {
  /** Compressed history segments (if any) */
  compressedHistory: CompressedSegment[];
  /** Compressed file contexts */
  compressedFiles: CompressedFile[];
  /** Total tokens after compression */
  totalTokens: number;
  /** Whether any compression was actually applied */
  compressionApplied: boolean;
  /** Token savings breakdown */
  savings: {
    /** Tokens saved from history compression */
    historyTokensSaved: number;
    /** Tokens saved from file compression */
    fileTokensSaved: number;
  };
}

/**
 * Model-specific budget configuration.
 */
export interface ModelBudgetConfig {
  /** Model identifier */
  modelId: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Percentage allocations for each category */
  allocations: {
    /** System prompt allocation (fixed tokens) */
    systemPrompt: number;
    /** Output buffer allocation (fixed tokens) */
    outputBuffer: number;
    /** Conversation history percentage of remaining budget */
    conversationHistory: number;
    /** Recent messages percentage of remaining budget */
    recentMessages: number;
    /** File context percentage of remaining budget */
    fileContext: number;
    /** Repo architecture allocation (fixed tokens) */
    repoArchitecture: number;
  };
}

/**
 * Chat message structure for compression operations.
 */
export interface ChatMessage {
  /** Message unique identifier */
  id: string;
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Token count of the message */
  tokenCount?: number;
  /** Whether this message is compressed */
  isCompressed?: boolean;
  /** ID of the summary message this was compressed into */
  compressedInto?: string;
}

/**
 * Retrieved context item with compression metadata.
 */
export interface RetrievedContextWithCompression {
  /** Original file path */
  filePath: string;
  /** Content (may be compressed) */
  content: string;
  /** Vector search relevance score */
  score: number;
  /** Start line in original file */
  startLine?: number;
  /** End line in original file */
  endLine?: number;
  /** Compression level applied (if any) */
  compressionLevel?: CompressionLevel;
  /** Original token count before compression */
  originalTokens?: number;
  /** Compressed token count */
  compressedTokens?: number;
}
