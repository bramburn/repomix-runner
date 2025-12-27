import * as vscode from 'vscode';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FileResolutionResult } from './types.js';

/**
 * Attempts to resolve a string path to a concrete VS Code URI.
 * Strategies:
 * 1. Exact workspace relative path.
 * 2. Fuzzy filename search (**basename).
 * 3. AI-assisted guess (using Gemini Flash-Lite) if apiKey is provided.
 */
export async function resolveFile(
  rawPath: string,
  codeSnippet: string,
  apiKey?: string
): Promise<FileResolutionResult | null> {
  // 1. Exact Match
  // We use findFiles to ensure it exists and excludes .git/ignored files
  const exactMatches = await vscode.workspace.findFiles(rawPath, null, 1);
  if (exactMatches.length > 0) {
    return { uri: exactMatches[0], method: 'exact' };
  }

  // 2. Fuzzy Filename Match
  // Extract basename (e.g., "src/utils/helper.ts" -> "helper.ts")
  const basename = path.basename(rawPath);
  if (basename && basename !== '.' && basename !== rawPath) {
    const fuzzyPattern = `**/${basename}`;
    const fuzzyMatches = await vscode.workspace.findFiles(fuzzyPattern, '**/node_modules/**', 5);
    
    // If we found exactly one match, great.
    if (fuzzyMatches.length === 1) {
      return { uri: fuzzyMatches[0], method: 'fuzzy' };
    }
    
    // If we found multiple, we might need to disambiguate, 
    // but for now, we'll return the first one that shares the most path segments 
    // or just the first one if we want to be aggressive.
    // Let's rely on the AI fallback if we have ambiguous results, 
    // OR just pick the first one for simplicity in this iteration.
    if (fuzzyMatches.length > 0) {
        // Simple heuristic: pick the shortest path (likely root) or matching partials
        // For MVP, return the first one.
        return { uri: fuzzyMatches[0], method: 'fuzzy' };
    }
  }

  // 3. AI Fallback
  if (apiKey) {
    try {
      const suggestedGlob = await askAiForGlob(rawPath, codeSnippet, apiKey);
      if (suggestedGlob) {
        const aiMatches = await vscode.workspace.findFiles(suggestedGlob, '**/node_modules/**', 1);
        if (aiMatches.length > 0) {
          return { uri: aiMatches[0], method: 'ai' };
        }
      }
    } catch (e) {
      console.warn('AI File Resolution failed:', e);
    }
  }

  return null;
}

async function askAiForGlob(filePath: string, snippet: string, apiKey: string): Promise<string | null> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
    I have a file path "${filePath}" which doesn't exist in my project.
    Here is a snippet of the code intended for it:
    "${snippet.slice(0, 300)}..."
    
    Suggest a single VS Code glob pattern to find this file (e.g. "**\/auth\/user.ts").
    Return ONLY the glob string, nothing else.
  `;

  const result = await model.generateContent(prompt);
  const response = result.response.text().trim();
  
  // Basic validation to ensure it looks like a glob
  if (response.length > 0 && !response.includes('\n')) {
    return response;
  }
  return null;
}