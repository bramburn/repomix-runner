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

interface LMStudioConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
}

export class LMStudioProvider extends BaseProvider {
  readonly id = 'lmstudio';
  readonly name = 'LM Studio';
  
  private config: LMStudioConfig;
  
  readonly capabilities: ProviderCapabilities = {
    supportsTextGeneration: true,
    supportsEmbeddings: true,
    supportsStructuredOutput: false,
    maxContextTokens: 8192, // Varies by loaded model
    supportedModels: []
  };
  
  constructor(config: LMStudioConfig) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if (!this.config.baseUrl) {
      throw new ConfigurationError('LM Studio base URL not configured');
    }
    
    await super.initialize();
  }
  
  async generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse> {
    this.assertInitialized();
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add API key if provided (optional for LM Studio)
      if (this.config.apiKey && this.config.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const choice = data.choices?.[0]?.message;
      
      if (!choice) {
        throw new APIError('No response from LM Studio API', response.status);
      }
      
      const content = choice.content || '';
      const tokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      };
      
      return {
        content,
        tokens,
        model: this.config.model,
        finishReason: data.choices?.[0]?.finish_reason,
      };
    } catch (error: any) {
      throw error;
    }
  }
  
  async embedText(text: string): Promise<number[]> {
    this.assertInitialized();
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.config.apiKey && this.config.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new APIError('No embedding returned from LM Studio', response.status);
      }
      
      return embedding;
    } catch (error: any) {
      throw error;
    }
  }
  
  getModelInfo(): ModelInfo {
    return {
      modelId: this.config.model,
      modelName: this.config.model,
      provider: this.id,
      contextWindow: 8192,
      embeddingDimension: this.config.dimension,
    };
  }
  
  getRateLimits(): RateLimitInfo {
    // Local LM Studio - no strict rate limits
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
      `LM Studio API error (${status}): ${response.statusText}`,
      status,
      body,
      new Error(body)
    );
  }
}
