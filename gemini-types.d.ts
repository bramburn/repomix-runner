// gemini-types.d.ts
declare module '@google/genai' {
  export interface EmbedContentConfig {
    outputDimensionality?: number;
    taskType?: string;
  }

  export interface EmbedContentResponse {
    embeddings?: Array<{
      values: number[];
    }>;
  }

  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    
    models: {
      embedContent(params: {
        model: string;
        contents: string | string[];
        config?: EmbedContentConfig;
      }): Promise<EmbedContentResponse>;
    };
  }
}
