import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { logger } from '../../shared/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface RepoSearchResult {
  id: string;
  score: number;
  path?: string;
  snippet?: string;
}

export interface RerankingConfig {
  maxFiles?: number;
  useFileContent?: boolean;
  confidenceThreshold?: number;
}

// Fixed: Define Schema as a plain object, not a class instance
const RERANKING_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    results: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          path: { type: SchemaType.STRING, description: "File path" },
          isRelevant: { type: SchemaType.BOOLEAN, description: "Is this file relevant?" },
          confidence: { type: SchemaType.NUMBER, description: "Confidence score 0-1" },
          reason: { type: SchemaType.STRING, description: "Why relevant or not" }
        },
        required: ["path", "isRelevant", "confidence", "reason"]
      }
    }
  },
  required: ["results"]
};

export async function rerankResultsWithLLM(
  userQuery: string,
  results: RepoSearchResult[],
  googleApiKey: string,
  repoRoot: string,
  config: RerankingConfig = {}
): Promise<RepoSearchResult[]> {
  const maxFiles = config.maxFiles ?? 10;
  const useFileContent = config.useFileContent ?? false;
  const confidenceThreshold = config.confidenceThreshold ?? 0.5;

  if (!results.length) return results;

  const candidateResults = results.slice(0, maxFiles);
  const remainingResults = results.slice(maxFiles);

  try {
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RERANKING_SCHEMA
      }
    });

    const filesToVerify = await Promise.all(
      candidateResults.map(async (result, idx) => {
        let entry = `${idx + 1}. ${result.path ?? 'unknown'} (score: ${result.score.toFixed(3)})`;

        if (useFileContent && result.path && !result.snippet) {
          try {
            const fullPath = path.join(repoRoot, result.path);
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            result.snippet = content.slice(0, 500);
          } catch {
            // Ignore read errors
          }
        }

        if (useFileContent && result.snippet) {
          entry += `\n   Snippet: ${result.snippet.substring(0, 200)}...`;
        }

        return entry;
      })
    );

    const prompt = `Evaluate relevance for: "${userQuery}"\n\nFiles:\n${filesToVerify.join('\n')}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    interface RerankingResponse {
      results: Array<{
        path: string;
        isRelevant: boolean;
        confidence: number;
        reason: string;
      }>;
    }

    let verification: RerankingResponse;
    try {
      verification = JSON.parse(response.text());
    } catch {
      verification = { results: [] };
    }

    const verificationMap = new Map(
      verification.results.map((v) => [v.path, v])
    );

    const rerankedCandidates = candidateResults
      .filter((r): r is RepoSearchResult & { path: string } => {
        const verified = verificationMap.get(r.path || '');
        return !!verified && verified.isRelevant && verified.confidence >= confidenceThreshold;
      })
      .map((r) => {
        const verified = verificationMap.get(r.path!)!;
        const combinedScore = r.score * 0.7 + verified.confidence * 0.3;

        return {
          ...r,
          score: combinedScore,
          _llmConfidence: verified.confidence,
          _llmReason: verified.reason,
        };
      })
      .sort((a, b) => b.score - a.score);

    console.log(`[LLM_RERANKING] Re-ranked ${candidateResults.length} results, kept ${rerankedCandidates.length}`);

    return [...rerankedCandidates, ...remainingResults];

  } catch (error) {
    logger.both.error('[LLM_RERANKING] Failed to re-rank results:', error);
    return results;
  }
}