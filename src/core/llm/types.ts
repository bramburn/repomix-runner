import { z } from 'zod';

/**
 * Model definition with metadata
 */
export interface ModelDefinition {
  id: string;
  name: string;
  contextWindow: number;
  pricing?: {
    input: number;  // per 1M tokens
    output: number; // per 1M tokens
  };
  capabilities?: string[];
}

/**
 * Rate limit information for a provider
 */
export interface RateLimitInfo {
  requestsPerMinute: number;
  tokensPerMinute: number;
  currentUsage: {
    requests: number;
    tokens: number;
  };
  resetTime?: Date;
}

/**
 * Provider capabilities declaration
 */
export interface ProviderCapabilities {
  supportsTextGeneration: boolean;
  supportsEmbeddings: boolean;
  supportsStructuredOutput: boolean;
  maxContextTokens: number;
  supportedModels: ModelDefinition[];
}

/**
 * Text generation response
 */
export interface TextResponse {
  content: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  finishReason?: string;
}

/**
 * Structured generation response
 */
export interface StructuredResponse<T> {
  parsed: T;
  raw: any;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
}

/**
 * Options for text generation
 */
export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
}

/**
 * LLM Provider interface - all providers must implement this
 */
export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  
  // Core methods
  generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse>;
  generateStructured<T>(schema: z.ZodType<T>, prompt: string, options?: GenerationOptions): Promise<StructuredResponse<T>>;
  embedText(text: string): Promise<number[]>;
  embedTexts(texts: string[]): Promise<number[][]>;
  
  // Metadata
  getModelInfo(): ModelInfo;
  getRateLimits(): RateLimitInfo;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;
}

/**
 * Model information
 */
export interface ModelInfo {
  modelId: string;
  modelName: string;
  provider: string;
  contextWindow: number;
  embeddingDimension?: number;
}

/**
 * Usage statistics for tracking
 */
export interface UsageStatistics {
  provider: string;
  totalRequests: number;
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedCostUsd: number;
  lastRequestTime?: Date;
  errors: {
    count: number;
    lastError?: string;
    lastErrorTime?: Date;
  };
}

/**
 * Configuration for LLM providers
 */
export interface LLMConfig {
  defaultProvider: string;
  embeddingProvider: string;
  
  // Provider-specific configs
  gemini?: {
    apiKey: string;
    model: string;
    rpm: number;
  };
  openrouter?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dimension: number;
    provider?: {
      order?: string[];
      allowFallbacks?: boolean;
      quantizations?: string[];
    };
  };
  ollama?: {
    url: string;
    model: string;
    dimension: number;
  };
  lmstudio?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dimension: number;
  };
  
  // Global settings
  rateLimiting?: {
    enabled: boolean;
  };
  usageTracking?: {
    enabled: boolean;
  };
}

/**
 * Retry options for operations
 */
export interface RetryOptions {
  maxRetries: number;
  retryableErrors?: string[];
  baseDelayMs?: number;
  maxDelayMs?: number;
}
