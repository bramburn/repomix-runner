import { IEmbeddingProvider } from './types';

interface OllamaConfig {
  url: string;
  model: string;
  dimension: number;
}

export class OllamaProvider implements IEmbeddingProvider {
  constructor(private config: OllamaConfig) {}

  async embedText(text: string): Promise<number[]> {
    const response = await fetch(`${this.config.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Ollama API request failed: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`Ollama API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.embedding) {
      console.error('Ollama API response missing embedding field', data);
      throw new Error('Invalid response from Ollama API: missing embedding');
    }
    return data.embedding;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    // Parallelize embedding requests to Ollama
    const promises = texts.map(text => this.embedText(text));
    return Promise.all(promises);
  }
  
  getDimensions(): number {
    return this.config.dimension;
  }
}
