import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
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
import { APIError, RateLimitError } from '../utils/errorHandling';

interface GeminiConfig {
  apiKey: string;
  model: string;
  rpm: number;
}

export class GeminiProvider extends BaseProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  
  private config: GeminiConfig;
  private client: ChatGoogleGenerativeAI | null = null;
  
  private static readonly MODELS: ModelDefinition[] = [
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      contextWindow: 1048576,
      pricing: { input: 0.075, output: 0.30 },
      capabilities: ['text', 'vision', 'structured_output']
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      contextWindow: 1048576,
      pricing: { input: 0.10, output: 0.40 },
      capabilities: ['text', 'vision', 'structured_output']
    }
  ];
  
  readonly capabilities: ProviderCapabilities = {
    supportsTextGeneration: true,
    supportsEmbeddings: true,
    supportsStructuredOutput: true,
    maxContextTokens: 1048576,
    supportedModels: GeminiProvider.MODELS
  };
  
  constructor(config: GeminiConfig) {
    super();
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key not configured');
    }
    
    this.client = new ChatGoogleGenerativeAI({
      model: this.config.model || 'gemini-2.5-flash-lite',
      apiKey: this.config.apiKey,
      temperature: 0,
      maxRetries: 0, // We handle retries manually
    });
    
    await super.initialize();
  }
  
  async generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse> {
    this.assertInitialized();
    
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }
    
    try {
      const response = await this.client.invoke(prompt, {
        temperature: options?.temperature ?? 0,
        maxTokens: options?.maxTokens,
      });
      
      const content = this.extractTextContent(response.content);
      const tokens = this.parseTokenUsage(response.response_metadata);
      
      return {
        content,
        tokens,
        model: this.config.model,
        finishReason: (response.response_metadata as any)?.finish_reason,
      };
    } catch (error: any) {
      throw this.handleApiError(error);
    }
  }
  
  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options?: GenerationOptions
  ): Promise<StructuredResponse<T>> {
    this.assertInitialized();
    
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }
    
    try {
      const structuredLlm = this.client.withStructuredOutput(schema, { includeRaw: true });
      const response = await structuredLlm.invoke(prompt, {
        temperature: options?.temperature ?? 0,
      });
      
      const parsed = response.parsed as T;
      const tokens = this.parseTokenUsage(
        (response.raw as any)?.usage_metadata || 
        (response.raw as any)?.response_metadata?.usage_metadata
      );
      
      return {
        parsed,
        raw: response,
        tokens,
        model: this.config.model,
      };
    } catch (error: any) {
      throw this.handleApiError(error);
    }
  }
  
  async embedText(text: string): Promise<number[]> {
    this.assertInitialized();
    
    // Note: Gemini embedding support would require additional SDK setup
    // For now, throw not implemented error
    throw new Error('Gemini embeddings not yet implemented in this provider');
  }
  
  getModelInfo(): ModelInfo {
    const model = GeminiProvider.MODELS.find(m => m.id === this.config.model) || GeminiProvider.MODELS[0];
    
    return {
      modelId: this.config.model,
      modelName: model.name,
      provider: this.id,
      contextWindow: model.contextWindow,
    };
  }
  
  getRateLimits(): RateLimitInfo {
    return {
      requestsPerMinute: this.config.rpm,
      tokensPerMinute: this.config.rpm * 10000, // Estimate
      currentUsage: {
        requests: 0,
        tokens: 0,
      },
    };
  }
  
  private handleApiError(error: any): Error {
    const msg = String(error?.message ?? error);
    
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      return new RateLimitError(
        `Gemini rate limit exceeded: ${msg}`,
        undefined,
        error
      );
    }
    
    return new APIError(
      `Gemini API error: ${msg}`,
      error?.status,
      undefined,
      error
    );
  }
}
