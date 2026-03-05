import { BaseProvider } from './BaseProvider';
import type {
  ProviderCapabilities,
  GenerationOptions,
  TextResponse,
  ModelInfo,
  RateLimitInfo,
  ModelDefinition
} from '../types';
import { APIError, ConfigurationError } from '../utils/errorHandling';

interface OllamaConfig {
  url: string;
  model: string;
  dimension: number;
}

export class OllamaProvider extends BaseProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  
  private config: OllamaConfig;
  private availableModels: ModelDefinition[] = [];
  
  readonly capabilities: ProviderCapabilities = {
    supportsTextGeneration: true,
    supportsEmbeddings: true,
    supportsStructuredOutput: false,
    maxContextTokens: 8192, // Default, varies by model
    supportedModels: []
  };
  
  constructor(config: OllamaConfig) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if (!this.config.url) {
      throw new ConfigurationError('Ollama URL not configured');
    }
    
    // Try to fetch available models
    try {
      await this.fetchAvailableModels();
    } catch (error) {
      console.warn('[OLLAMA_PROVIDER] Failed to fetch models, using defaults:', error);
      this.availableModels = [{
        id: this.config.model,
        name: this.config.model,
        contextWindow: 8192,
      }];
    }
    
    this.capabilities.supportedModels = this.availableModels;
    await super.initialize();
  }
  
  async generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse> {
    this.assertInitialized();
    
    try {
      const response = await fetch(`${this.config.url}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0,
            num_predict: options?.maxTokens,
            top_p: options?.topP,
          },
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      
      return {
        content: data.response || '',
        tokens: {
          prompt: data.prompt_eval_count || 0,
          completion: data.eval_count || 0,
          total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: this.config.model,
        finishReason: data.done ? 'stop' : 'length',
      };
    } catch (error: any) {
      throw error;
    }
  }
  
  async embedText(text: string): Promise<number[]> {
    this.assertInitialized();
    
    try {
      const response = await fetch(`${this.config.url}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: text,
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const embedding = data.embedding;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new APIError('No embedding returned from Ollama', response.status);
      }
      
      return embedding;
    } catch (error: any) {
      throw error;
    }
  }
  
  getModelInfo(): ModelInfo {
    const model = this.availableModels.find(m => m.id === this.config.model) || this.availableModels[0];
    
    return {
      modelId: this.config.model,
      modelName: model?.name || this.config.model,
      provider: this.id,
      contextWindow: model?.contextWindow || 8192,
      embeddingDimension: this.config.dimension,
    };
  }
  
  getRateLimits(): RateLimitInfo {
    // Local Ollama - no strict rate limits but monitor for resource exhaustion
    return {
      requestsPerMinute: 60,
      tokensPerMinute: 50000,
      currentUsage: {
        requests: 0,
        tokens: 0,
      },
    };
  }
  
  private async handleHttpError(response: Response): Promise<Error> {
    const status = response.status;
    const body = await response.text().catch(() => 'Unknown');
    
    return new APIError(
      `Ollama API error (${status}): ${response.statusText}`,
      status,
      body,
      new Error(body)
    );
  }
  
  private async fetchAvailableModels(): Promise<void> {
    try {
      const response = await fetch(`${this.config.url}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      this.availableModels = (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        contextWindow: m.details?.family === 'nomic-bert' ? this.config.dimension : 8192,
      }));
      
      if (this.availableModels.length === 0) {
        throw new Error('No models found in Ollama');
      }
    } catch (error) {
      console.error('[OLLAMA_PROVIDER] Error fetching models:', error);
      throw error;
    }
  }
}
