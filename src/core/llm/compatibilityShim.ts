/**
 * Backwards Compatibility Shim
 * 
 * This module maintains the old llmClient API while redirecting calls
 * to the new unified LLM provider management system.
 * 
 * @deprecated Use the new LLMProviderManager and services directly instead
 */

import { z } from 'zod';
import { llmProviderManager } from '../llm/LLMProviderManager';
import type { TextResponse, StructuredResponse, GenerationOptions, LLMConfig } from '../llm/types';
import { logger } from '../../shared/logger';

// Re-export types for backwards compatibility
export { z };

/**
 * @deprecated Use LLMProviderManager.getTextGenerationService() instead
 */
export interface GenerateOptions {
    apiKey: string;
}

/**
 * Initialize the new LLM system from VS Code configuration
 */
export async function initializeFromConfig(): Promise<void> {
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('repomix');
    
    const llmConfig: LLMConfig = {
        defaultProvider: config.get('llm.defaultProvider') || 'gemini',
        embeddingProvider: config.get('llm.embeddingProvider') || 'gemini',
        gemini: {
            apiKey: config.get('llm.gemini.apiKey') || process.env.GEMINI_API_KEY || '',
            model: config.get('llm.gemini.model') || 'gemini-2.5-flash-lite',
            rpm: config.get('llm.gemini.rpm') || 10,
        },
        openrouter: {
            baseUrl: config.get('openrouter.baseUrl') || 'https://openrouter.ai/api/v1',
            apiKey: config.get('openrouter.openrouterApiKey') || '',
            model: config.get('openrouter.model') || 'openai/text-embedding-3-small',
            dimension: config.get('openrouter.dimension') || 1536,
            provider: {
                order: config.get('openrouter.providerOrder'),
                allowFallbacks: config.get('openrouter.allowFallbacks'),
                quantizations: config.get('openrouter.quantizations'),
            },
        },
        ollama: {
            url: config.get('ollama.url') || 'http://localhost:11434',
            model: config.get('ollama.model') || 'nomic-embed-text',
            dimension: config.get('ollama.dimension') || 768,
        },
        lmstudio: {
            baseUrl: config.get('lmstudio.baseUrl') || 'http://localhost:1234/v1',
            apiKey: config.get('lmstudio.apiKey') || '',
            model: config.get('lmstudio.model') || '',
            dimension: config.get('lmstudio.dimension') || 768,
        },
        rateLimiting: {
            enabled: config.get('llm.rateLimit.enabled') !== false,
        },
        usageTracking: {
            enabled: config.get('llm.usageTracking.enabled') !== false,
        },
    };
    
    await llmProviderManager.initialize(llmConfig);
    logger.both.info('[llmClientShim] LLM Provider Manager initialized');
}

/**
 * @deprecated Use TextGenerationService.generate() instead
 * This shim maintains the old API for backwards compatibility
 */
export async function generateText(
    apiKey: string,
    prompt: string,
    name: string = "Text Generation"
): Promise<{ content: string; totalTokens: number; promptTokens: number; completionTokens: number }> {
    try {
        const service = llmProviderManager.getDefaultProvider();
        const response = await llmProviderManager.executeWithRetry(
            service.id,
            () => service.generateText(prompt, { temperature: 0 })
        );
        
        return {
            content: response.content,
            totalTokens: response.tokens.total,
            promptTokens: response.tokens.prompt,
            completionTokens: response.tokens.completion,
        };
    } catch (error) {
        logger.both.error(`[llmClientShim.${name}] Error:`, error instanceof Error ? error.message : String(error));
        throw error;
    }
}

/**
 * @deprecated Use TextGenerationService.generateStructured() instead
 * This shim maintains the old API for backwards compatibility
 */
export async function generateStructured<T>(
    apiKey: string,
    schema: z.ZodType<T>,
    prompt: string,
    name: string = "Structured Generation"
): Promise<{ parsed: T; totalTokens: number; promptTokens: number; completionTokens: number }> {
    try {
        const service = llmProviderManager.getDefaultProvider();
        const response = await llmProviderManager.executeWithRetry(
            service.id,
            () => service.generateStructured(schema, prompt, { temperature: 0 })
        );
        
        return {
            parsed: response.parsed,
            totalTokens: response.tokens.total,
            promptTokens: response.tokens.prompt,
            completionTokens: response.tokens.completion,
        };
    } catch (error) {
        logger.both.error(`[llmClientShim.${name}] Error:`, error instanceof Error ? error.message : String(error));
        throw error;
    }
}

/**
 * @deprecated Use createGeminiModel() from GeminiProvider instead
 */
export function createGeminiModel(apiKey: string): any {
    // For backwards compatibility, warn but continue
    logger.both.warn('[createGeminiModel] Deprecated. Use the new LLMProviderManager instead.');
    
    // Try to use new system if initialized
    try {
        const provider = llmProviderManager.getProvider('gemini');
        return provider;
    } catch {
        // Fall back to old behavior
        throw new Error('Gemini provider not initialized. Call initializeFromConfig() first.');
    }
}

// Keep the queue export for backwards compatibility but mark as deprecated
/**
 * @deprecated Use RateLimitQueue from LLM module instead
 */
export const geminiQueue = {
    add: async <T>(fn: () => Promise<T>): Promise<T> => {
        logger.both.warn('[geminiQueue.add] Deprecated. Use RateLimitQueue instead.');
        return fn();
    }
};
