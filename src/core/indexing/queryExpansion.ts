import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { logger } from '../../shared/logger.js';

export interface QueryExpansionResult {
  original: string;
  variants: string[];
}

// Fixed: Define Schema as a plain object, not a class instance
const EXPANSION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    original: { type: SchemaType.STRING, description: "Original user query" },
    variants: { 
      type: SchemaType.ARRAY, 
      items: { type: SchemaType.STRING },
      description: "Semantic variants capturing same intent"
    }
  },
  required: ["original", "variants"]
};

export async function expandQuery(
  userQuery: string,
  googleApiKey: string
): Promise<QueryExpansionResult> {
  const q = userQuery.trim();
  if (!q) {
    return { original: q, variants: [] };
  }

  try {
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: EXPANSION_SCHEMA
      }
    });

    const prompt = `Generate 3-5 semantic variants of: "${q}"`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    try {
      return JSON.parse(response.text());
    } catch {
      return { original: q, variants: [q] };
    }
  } catch (error) {
    logger.both.error('[QueryExpansion] Failed:', error);
    return { original: q, variants: [q] };
  }
}

export async function getAllQueriesToSearch(
  userQuery: string,
  googleApiKey: string
): Promise<string[]> {
  const expansion = await expandQuery(userQuery, googleApiKey);
  return [expansion.original, ...expansion.variants].filter((q): q is string => typeof q === 'string');
}