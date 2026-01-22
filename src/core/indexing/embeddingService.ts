import { IEmbeddingProvider } from './embeddings/types';
import { GeminiProvider } from './embeddings/GeminiProvider';
import { OllamaProvider } from './embeddings/OllamaProvider';

export interface EmbeddingProviderConfig {
    provider: 'gemini' | 'ollama';
    gemini?: {
        apiKey: string;
    };
    ollama?: {
        url: string;
        model: string;
        dimension: number;
    };
}

export class EmbeddingService {
  private provider: IEmbeddingProvider | null = null;
  private currentConfig: EmbeddingProviderConfig | null = null;

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
      default:
        const exhaustiveCheck: never = config.provider;
        throw new Error(`Unsupported embedding provider: ${exhaustiveCheck}`);
    }
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    return this.provider.embedText(text);
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    return this.provider.embedTexts(texts);
  }

  getDimensions(): number {
    if (!this.provider) {
      throw new Error('Embedding provider is not initialized. Call switchProvider first.');
    }
    return this.provider.getDimensions();
  }
}

export const embeddingService = new EmbeddingService();