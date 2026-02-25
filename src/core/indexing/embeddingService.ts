import { IEmbeddingProvider } from './embeddings/types';
import { GeminiProvider } from './embeddings/GeminiProvider';
import { OllamaProvider } from './embeddings/OllamaProvider';
import { LMStudioProvider } from './embeddings/LMStudioProvider';
import { OpenRouterProvider } from './embeddings/OpenRouterProvider';

export interface EmbeddingProviderConfig {
    provider: 'gemini' | 'ollama' | 'lmstudio' | 'openrouter';
    gemini?: {
        apiKey: string;
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
    openrouter?: {
        baseUrl: string;
        apiKey: string;
        model: string;
        dimension: number;
        provider?: {
            order?: string[];
            allow_fallbacks?: boolean;
            quantizations?: string[];
        };
    };
}

/**
 * Request queue entry for serializing embedding API calls
 */
interface QueueEntry<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  source: string;
  priority: boolean;
}

export class EmbeddingService {
  private provider: IEmbeddingProvider | null = null;
  private currentConfig: EmbeddingProviderConfig | null = null;

  // Queue for serializing embedding requests
  private queue: QueueEntry<any>[] = [];
  private activeRequests = 0;
  private maxConcurrent = 1; // Serialize by default to prevent rate limiting

  public switchProvider(config: EmbeddingProviderConfig) {
    if (this.provider && JSON.stringify(this.currentConfig) === JSON.stringify(config)) {
      return;
    }

    console.log(`[EMBEDDING_SERVICE] Switching provider to ${config.provider}`);
    this.currentConfig = config;

    switch (config.provider) {
      case 'gemini':
        if (!config.gemini?.apiKey) {
            throw new Error('Gemini API key is missing for embedding provider.');
        }
        this.provider = new GeminiProvider(config.gemini);
        break;
      case 'ollama':
        if (!config.ollama) {
            throw new Error('Ollama config is missing for embedding provider.');
        }
        this.provider = new OllamaProvider(config.ollama);
        break;
      case 'lmstudio':
        if (!config.lmstudio) {
            throw new Error('LM Studio config is missing for embedding provider.');
        }
        this.provider = new LMStudioProvider(config.lmstudio);
        break;
      case 'openrouter':
        if (!config.openrouter) {
            throw new Error('OpenRouter config is missing for embedding provider.');
        }
        this.provider = new OpenRouterProvider(config.openrouter);
        break;
      default:
        const exhaustiveCheck: never = config.provider;
        throw new Error(`Unsupported embedding provider: ${exhaustiveCheck}`);
    }
  }

  /**
   * Set the maximum number of concurrent embedding requests.
   * Default is 1 (fully serialized) to prevent rate limiting.
   */
  public setMaxConcurrent(max: number) {
    this.maxConcurrent = Math.max(1, max);
    console.log(`[EMBEDDING_SERVICE] Max concurrent requests set to ${this.maxConcurrent}`);
  }

  /**
   * Get queue statistics for debugging
   */
  public getQueueStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      priorityQueued: this.queue.filter(e => e.priority).length,
    };
  }

  /**
   * Enqueue an embedding request and return a promise that resolves when it completes.
   * Priority requests are inserted at the front of the queue (processed next).
   */
  private enqueue<T>(execute: () => Promise<T>, source: string, priority: boolean = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const entry = { execute, resolve, reject, source, priority };
      
      if (priority) {
        // Insert at front of queue for immediate processing after current request
        this.queue.unshift(entry);
        console.log(`[EMBEDDING_SERVICE] Priority request queued at front (source: ${source}, queue length: ${this.queue.length})`);
      } else {
        this.queue.push(entry);
      }
      
      this.processQueue();
    });
  }

  /**
   * Process the next item(s) in the queue if we have capacity
   */
  private async processQueue() {
    while (this.activeRequests < this.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.activeRequests++;
      
      const queueStats = this.getQueueStats();
      console.log(`[EMBEDDING_SERVICE] Processing request (source: ${entry.source}, priority: ${entry.priority}, active: ${queueStats.activeRequests}, queued: ${queueStats.queueLength})`);

      try {
        const result = await entry.execute();
        entry.resolve(result);
      } catch (error) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.activeRequests--;
        // Process next item after current one completes
        this.processQueue();
      }
    }
  }

  /**
   * Embed a single text. Use priority=true for user-facing operations like search.
   */
  async embedText(text: string, source: string = 'unknown', priority: boolean = false): Promise<number[]> {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    
    return this.enqueue(
      () => this.provider!.embedText(text),
      `embedText:${source}`,
      priority
    );
  }

  /**
   * Embed multiple texts. Use priority=true for user-facing operations like search.
   */
  async embedTexts(texts: string[], source: string = 'unknown', priority: boolean = false): Promise<number[][]> {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    
    return this.enqueue(
      () => this.provider!.embedTexts(texts),
      `embedTexts[${texts.length}]:${source}`,
      priority
    );
  }

  getDimensions(): number {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    return this.provider.getDimensions();
  }
}

export const embeddingService = new EmbeddingService();