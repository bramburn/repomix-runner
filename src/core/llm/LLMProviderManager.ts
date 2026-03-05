import type { LLMProvider, LLMConfig, RetryOptions, UsageStatistics } from './types';
import { GeminiProvider } from './providers/GeminiProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { LMStudioProvider } from './providers/LMStudioProvider';
import { RateLimitQueue } from './queue/RateLimitQueue';
import { UsageTracker } from './queue/UsageTracker';
import { ConfigurationError } from './utils/errorHandling';

/**
 * Central orchestrator for all LLM providers
 * Manages provider lifecycle, rate limiting, and usage tracking
 */
export class LLMProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private queues: Map<string, RateLimitQueue> = new Map();
  private usageTracker: UsageTracker;
  private config: LLMConfig | null = null;
  
  constructor() {
    this.usageTracker = new UsageTracker(true);
  }
  
  /**
   * Initialize all configured providers
   */
  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
    
    console.log('[LLMProviderManager] Initializing providers...');
    
    // Initialize each configured provider
    if (config.gemini?.apiKey) {
      await this.registerProvider('gemini', new GeminiProvider(config.gemini));
    }
    
    if (config.openrouter?.apiKey) {
      const openaiConfig = {
        baseUrl: config.openrouter.baseUrl,
        apiKey: config.openrouter.apiKey,
        model: config.openrouter.model,
        dimension: config.openrouter.dimension,
        provider: config.openrouter.provider,
      };
      await this.registerProvider('openrouter', new OpenAIProvider(openaiConfig));
    }
    
    if (config.ollama?.url) {
      await this.registerProvider('ollama', new OllamaProvider(config.ollama));
    }
    
    if (config.lmstudio?.baseUrl) {
      await this.registerProvider('lmstudio', new LMStudioProvider(config.lmstudio));
    }
    
    console.log(`[LLMProviderManager] Initialized ${this.providers.size} providers`);
  }
  
  /**
   * Register a provider with automatic queue creation
   */
  private async registerProvider(id: string, provider: LLMProvider): Promise<void> {
    try {
      await provider.initialize();
      this.providers.set(id, provider);
      
      // Create rate limit queue based on provider config
      const rpm = this.config?.gemini?.rpm || 10;
      const queue = new RateLimitQueue(rpm);
      this.queues.set(id, queue);
      
      console.log(`[LLMProviderManager] Registered provider: ${id}`);
    } catch (error) {
      console.error(`[LLMProviderManager] Failed to initialize provider ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Get provider by ID
   */
  getProvider(providerId: string): LLMProvider {
    const provider = this.providers.get(providerId);
    
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new ConfigurationError(
        `Provider '${providerId}' not found. Available: ${available || 'none'}`
      );
    }
    
    return provider;
  }
  
  /**
   * Get available providers for specific capability
   */
  getProvidersForCapability(capability: 'text' | 'embedding'): string[] {
    const result: string[] = [];
    
    for (const [id, provider] of this.providers.entries()) {
      if (capability === 'text' && provider.capabilities.supportsTextGeneration) {
        result.push(id);
      } else if (capability === 'embedding' && provider.capabilities.supportsEmbeddings) {
        result.push(id);
      }
    }
    
    return result;
  }
  
  /**
   * Execute operation with automatic rate limiting and retry
   */
  async executeWithRetry<T>(
    providerId: string,
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const queue = this.queues.get(providerId);
    
    if (!queue) {
      throw new ConfigurationError(`No queue configured for provider: ${providerId}`);
    }
    
    return queue.addWithRetry(operation, options);
  }
  
  /**
   * Start tracking an operation
   */
  startOperation(providerId: string, operationType: 'text_generation' | 'embedding' | 'structured') {
    return this.usageTracker.startOperation(providerId, operationType);
  }
  
  /**
   * Get usage statistics for a provider
   */
  getUsageStats(providerId: string): UsageStatistics | null {
    return this.usageTracker.getStats(providerId);
  }
  
  /**
   * Get all usage statistics
   */
  getAllUsageStats(): Map<string, UsageStatistics> {
    return this.usageTracker.getAllStats();
  }
  
  /**
   * Reset usage statistics
   */
  resetUsageStats(providerId?: string): void {
    if (providerId) {
      this.usageTracker.resetStats(providerId);
    } else {
      this.usageTracker.resetAllStats();
    }
  }
  
  /**
   * Get default provider for text generation
   */
  getDefaultProvider(): LLMProvider {
    const defaultId = this.config?.defaultProvider || 'gemini';
    return this.getProvider(defaultId);
  }
  
  /**
   * Get default provider for embeddings
   */
  getDefaultEmbeddingProvider(): LLMProvider {
    const defaultId = this.config?.embeddingProvider || 'gemini';
    return this.getProvider(defaultId);
  }
  
  /**
   * Dispose all providers
   */
  dispose(): void {
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.providers.clear();
    this.queues.clear();
    this.usageTracker.resetAllStats();
  }
}

// Singleton instance
export const llmProviderManager = new LLMProviderManager();
