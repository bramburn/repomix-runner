import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import PQueue from "p-queue";
import { logger } from "../shared/logger";
import { z } from "zod";

/**
 * Rate limiting configuration for Gemini API.
 * The free tier limit is 15 requests per minute (RPM).
 * We use a configured value (or default to 14) to maintain a safety cushion.
 */
const GEMINI_RPM = Number(process.env.GEMINI_RPM ?? 10);

/**
 * Serial queue with per-minute cap to stay under Gemini free tier limits.
 * - concurrency: 1 ensures requests are processed sequentially (or low concurrency).
 * - interval: 60000ms (1 minute) defines the time window.
 * - intervalCap: maximum requests allowed in the time window, set by GEMINI_RPM.
 * - carryoverConcurrencyCount: allows unused capacity to carry over to the next interval.
 */
export const geminiQueue = new PQueue({
    concurrency: 1, // Keep it sequential to be safe with rate limits
    interval: 60_000,
    intervalCap: GEMINI_RPM,
    carryoverConcurrencyCount: true,
});

/**
 * Check if an error from the Gemini API suggests a transient issue, like rate limiting.
 * @param err - The error to check
 * @returns True if the error is retryable
 */
function isRetryableGeminiError(err: unknown): boolean {
    const msg = String((err as any)?.message ?? err);
    return (
        msg.includes("429") || // HTTP 429 Too Many Requests
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("rate") ||
        msg.includes("quota") ||
        msg.includes("503") || // Service Unavailable
        msg.includes("500")    // Internal Server Error
    );
}

/**
 * Implements an exponential backoff strategy with added jitter for retrying failed async operations.
 * This is crucial for handling transient network issues or API rate limits gracefully.
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts before failing
 * @returns The result of the function
 */
async function withBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 5,
    name = "LLM Call"
): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (e) {
            attempt++;
            if (attempt > maxRetries || !isRetryableGeminiError(e)) {
                throw e; // Throw if max retries hit or error is non-transient
            }

            // Exponential backoff: 2s, 4s, 8s, 16s, 32s... + random jitter (0-500ms)
            const base = 2000 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 500);
            const sleepMs = base + jitter;

            logger.both.warn(
                `[${name}] Rate limited or transient error (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(sleepMs / 1000)}s... Error: ${String(e)}`
            );
            await new Promise((r) => setTimeout(r, sleepMs));
        }
    }
}

/**
 * Create a Gemini model instance with standard settings, ensuring API key is present.
 * @param apiKey - The Google API Key
 * @param isStructured - Whether this model is intended for structured output (affects some params if needed)
 * @returns ChatGoogleGenerativeAI instance
 */
export function createGeminiModel(apiKey: string): ChatGoogleGenerativeAI {
    if (!apiKey) {
        throw new Error("Google API Key not provided to agent.");
    }

    return new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash-lite", // Using the latest flash-lite model for speed and capability.
        apiKey: apiKey,
        temperature: 0,
        maxRetries: 0, // We handle retries manually in withBackoff
    });
}

/**
 * Options for generating content
 */
export interface GenerateOptions {
    apiKey: string;
}

/**
 * Generate structured output using Google Gemini, wrapped in rate-limiting and retry logic.
 * @param apiKey - The Google API key
 * @param schema - The Zod schema for the expected output
 * @param prompt - The prompt to send to the model
 * @param name - A name for logging/debugging this operation
 * @returns The parsed structured output and token usage
 */
export async function generateStructured<T>(
    apiKey: string,
    schema: z.ZodType<T>,
    prompt: string,
    name: string = "Structured Generation"
): Promise<{ parsed: T; totalTokens: number; promptTokens: number; completionTokens: number }> {
    // Enqueue the request to respect the GEMINI_RPM limit.
    return geminiQueue.add(() =>
        withBackoff(async () => {
            const model = createGeminiModel(apiKey);
            const structuredLlm = model.withStructuredOutput(schema, { includeRaw: true });

            const response = await structuredLlm.invoke(prompt);
            const parsed = response.parsed as T;
            const usage =
                (response.raw as any)?.usage_metadata ||
                (response.raw as any)?.response_metadata?.usage_metadata ||
                {};
            const totalTokens = usage.total_tokens || 0;
            let promptTokens =
                usage.prompt_token_count ??
                usage.prompt_tokens ??
                usage.input_tokens ??
                0;
            let completionTokens =
                usage.candidates_token_count ??
                usage.completion_tokens ??
                usage.output_tokens ??
                0;
            if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
                promptTokens = totalTokens;
            }

            return { parsed, totalTokens, promptTokens, completionTokens };
        }, 5, name)
    );
}

/**
 * Generate text output using Google Gemini, wrapped in rate-limiting and retry logic.
 * @param apiKey - The Google API key
 * @param prompt - The prompt to send to the model
 * @param name - A name for logging/debugging this operation
 * @returns The generated text and token usage
 */
export async function generateText(
    apiKey: string,
    prompt: string,
    name: string = "Text Generation"
): Promise<{ content: string; totalTokens: number; promptTokens: number; completionTokens: number }> {
    return geminiQueue.add(() =>
        withBackoff(async () => {
            const model = createGeminiModel(apiKey);
            const response = await model.invoke(prompt);

            let content = "";
            if (typeof response.content === "string") {
                content = response.content;
            } else if (Array.isArray(response.content)) {
                // Handle array of content blocks
                content = response.content.map(c => {
                    if (typeof c === "string") return c;
                    if (typeof c === "object" && c && "text" in c) return (c as any).text;
                    return JSON.stringify(c);
                }).join("");
            } else {
                content = String(response.content);
            }

            // Log raw content type if weird for debugging
            if (typeof response.content !== 'string' && !Array.isArray(response.content)) {
                logger.both.warn(`[${name}] Unexpected content type: ${typeof response.content}. Value: ${JSON.stringify(response.content)}`);
            }

            const usage =
                (response.response_metadata as any)?.usage_metadata ||
                (response as any)?.usage_metadata ||
                {};
            const totalTokens = usage.total_tokens || 0;
            let promptTokens =
                usage.prompt_token_count ??
                usage.prompt_tokens ??
                usage.input_tokens ??
                0;
            let completionTokens =
                usage.candidates_token_count ??
                usage.completion_tokens ??
                usage.output_tokens ??
                0;
            if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
                promptTokens = totalTokens;
            }

            return { content, totalTokens, promptTokens, completionTokens };
        }, 5, name)
    );
}
