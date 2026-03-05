import { z } from 'zod';
import { BaseProvider } from './BaseProvider';
import type {
  ProviderCapabilities,
  GenerationOptions,
  TextResponse,
  StructuredResponse,
  ModelInfo,
  RateLimitInfo,
  ModelDefinition
} from '../types';
import { APIError, RateLimitError, ConfigurationError } from '../utils/errorHandling';

interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension?: number; // For embeddings
  provider?: {
    order?: string[];
    allowFallbacks?: boolean;
    quantizations?: string[];
  };
}

export class OpenAIProvider extends BaseProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter/OpenAI';
  
  private config: OpenAIConfig;
  
  private static readonly DEFAULT_MODELS: ModelDefinition[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      pricing: { input: 5.0, output: 15.0 },
      capabilities: ['text', 'vision', 'structured_output']
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      contextWindow: 16385,
      pricing: { input: 0.5, output: 1.5 },
      capabilities: ['text', 'structured_output']
    }
  ];
  
  readonly capabilities: ProviderCapabilities = {
    supportsTextGeneration: true,
    supportsEmbeddings: true,
    supportsStructuredOutput: true,
    maxContextTokens: 128000,
    supportedModels: OpenAIProvider.DEFAULT_MODELS
  };
  
  constructor(config: OpenAIConfig) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new ConfigurationError('OpenRouter/OpenAI API key not configured');
    }
    
    await super.initialize();
  }
  
  async generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse> {
    this.assertInitialized();
    
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.provider ? { 'HTTP-Referer': 'https://github.com/repomix/repomix-runner' } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          frequency_penalty: options?.frequencyPenalty,
          presence_penalty: options?.presencePenalty,
          stop: options?.stopSequences,
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const choice = data.choices?.[0]?.message;
      
      if (!choice) {
        throw new APIError('No response from OpenRouter/OpenAI API', response.status);
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
      throw error; // Already handled
    }
  }
  
  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options?: GenerationOptions
  ): Promise<StructuredResponse<T>> {
    this.assertInitialized();
    
    try {
      // Convert Zod schema to JSON Schema for OpenAI function calling
      const jsonSchema = this.zodToJsonSchema(schema);
      
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { 
              role: 'system', 
              content: 'You are a helpful assistant that outputs valid JSON.' 
            },
            { role: 'user', content: prompt }
          ],
          temperature: options?.temperature ?? 0,
          response_format: { type: 'json_object' },
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      try {
        const parsed = JSON.parse(content);
        const validated = schema.parse(parsed);
        
        const tokens = {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        };
        
        return {
          parsed: validated,
          raw: data,
          tokens,
          model: this.config.model,
        };
      } catch (parseError: any) {
        throw new APIError(
          `Failed to parse structured output: ${parseError.message}`,
          undefined,
          content,
          parseError
        );
      }
    } catch (error: any) {
      throw error;
    }
  }
  
  async embedText(text: string): Promise<number[]> {
    this.assertInitialized();
    
    try {
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
          encoding_format: 'float',
          ...(this.config.provider ? { provider: this.config.provider } : {}),
        }),
      });
      
      if (!response.ok) {
        throw await this.handleHttpError(response);
      }
      
      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new APIError('No embedding returned from API', response.status);
      }
      
      return embedding;
    } catch (error: any) {
      throw error;
    }
  }
  
  getModelInfo(): ModelInfo {
    const model = OpenAIProvider.DEFAULT_MODELS.find(m => m.id === this.config.model) || OpenAIProvider.DEFAULT_MODELS[0];
    
    return {
      modelId: this.config.model,
      modelName: model.name,
      provider: this.id,
      contextWindow: model.contextWindow,
      embeddingDimension: this.config.dimension,
    };
  }
  
  getRateLimits(): RateLimitInfo {
    // OpenRouter has varying limits based on model and provider
    return {
      requestsPerMinute: 60, // Default estimate
      tokensPerMinute: 100000,
      currentUsage: {
        requests: 0,
        tokens: 0,
      },
    };
  }
  
  private async handleHttpError(response: Response): Promise<Error> {
    const status = response.status;
    const body = await response.text().catch(() => 'Unknown');
    
    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const resetTime = retryAfter ? new Date(Date.now() + parseInt(retryAfter) * 1000) : undefined;
      
      return new RateLimitError(
        `Rate limit exceeded: ${response.statusText}`,
        resetTime,
        new Error(body)
      );
    }
    
    return new APIError(
      `API error (${status}): ${response.statusText}`,
      status,
      body,
      new Error(body)
    );
  }
  
  /**
   * Simple Zod to JSON Schema converter (basic implementation)
   * For production use, consider using zod-to-json-schema library
   */
  private zodToJsonSchema(schema: z.ZodType<any>): any {
    // Basic implementation - in production, use proper library
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }
}
