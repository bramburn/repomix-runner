/**
 * Core LLM Provider Module
 * 
 * Provides unified management for all LLM providers (Gemini, OpenRouter, Ollama, LMStudio)
 * with centralized rate limiting, usage tracking, and error handling.
 */

export { LLMProviderManager, llmProviderManager } from './LLMProviderManager';
export type { LLMProvider, ProviderCapabilities, GenerationOptions, TextResponse, StructuredResponse } from './types';
export { BaseProvider } from './providers/BaseProvider';
export { GeminiProvider } from './providers/GeminiProvider';
export { OpenAIProvider } from './providers/OpenAIProvider';
export { OllamaProvider } from './providers/OllamaProvider';
export { LMStudioProvider } from './providers/LMStudioProvider';
export { TextGenerationService } from './services/TextGenerationService';
export { EmbeddingService } from './services/EmbeddingService';
export { EnrichmentService } from './services/EnrichmentService';
export { RateLimitQueue } from './queue/RateLimitQueue';
export { UsageTracker } from './queue/UsageTracker';
export { LLMError, RetryableError, RateLimitError, ConfigurationError } from './utils/errorHandling';
