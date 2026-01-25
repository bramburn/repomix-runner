import * as fs from 'fs';
import * as path from 'path';
import * as prompts from './prompts';
import * as llmClient from './llmClient';
import * as tools from './tools';
import { logger } from '../shared/logger';
import { ProcessedFile } from './state';
import { generateStructuredOutput } from '../core/files/markdownGenerator';

export interface SummaryResult {
    summaryPath?: string;
    totalTokens: number;
    error?: string;
}

/**
 * Generates a markdown summary for a list of files using the LLM.
 * 
 * @param apiKey - Google API Key
 * @param query - The user's original query
 * @param filePaths - List of absolute file paths to summarize
 * @param workspaceRoot - Root of the workspace (for relative path calculation and output location)
 */
export async function generateMarkdownSummary(
    apiKey: string,
    query: string,
    filePaths: string[],
    workspaceRoot: string
): Promise<SummaryResult> {
    if (filePaths.length === 0) {
        return { totalTokens: 0 };
    }

    logger.both.info(`SummaryGenerator: Generating markdown summary for ${filePaths.length} files...`);

    try {
        // 1. Collect full content of files
        // Use the existing tool to respect potential ignore rules implementation details if any
        const contentMap = await tools.getFileContents(workspaceRoot, filePaths);

        const fullContent = filePaths.map(filePath => {
            // Use relative path for cleaner context
            const relPath = path.relative(workspaceRoot, filePath);
            const content = contentMap.get(filePath) || '(Could not read file content)';
            // Truncate if extremely large to avoid context window explosion (though 2.5-flash-lite has big context)
            const safeContent = content.length > 100000 ? content.substring(0, 100000) + '\n...[TRUNCATED]' : content;
            return `FILE: ${relPath}\nCONTENT:\n${safeContent}\n---`;
        }).join('\n\n');

        // 2. Call LLM
        const prompt = prompts.GENERATE_SUMMARY_PROMPT(query, fullContent);

        const { content: summaryMarkdown, totalTokens } = await llmClient.generateText(
            apiKey,
            prompt,
            "Generate Summary"
        );

        logger.both.debug(`SummaryGenerator: Receieved content type: ${typeof summaryMarkdown}. Length: ${summaryMarkdown?.length}`);
        if (typeof summaryMarkdown === 'string') {
            logger.both.debug(`SummaryGenerator: Preview: ${summaryMarkdown.slice(0, 100)}...`);
        } else {
            logger.both.warn(`SummaryGenerator: Content is not a string: ${JSON.stringify(summaryMarkdown)}`);
        }

        // 3. Ensure .repomix-runner/ directory exists
        const runnerDir = path.join(workspaceRoot, '.repomix-runner');
        if (!fs.existsSync(runnerDir)) {
            fs.mkdirSync(runnerDir, { recursive: true });
        }

        // 4. Save the summary
        const fileName = `summary-${Date.now()}.md`;
        const summaryPath = path.join(runnerDir, fileName);
        const summaryAndContext = summaryMarkdown + '\n\n' + fullContent;
        fs.writeFileSync(summaryPath, summaryAndContext);

        logger.both.info(`SummaryGenerator: Summary generated at ${summaryPath}`);

        return {
            summaryPath,
            totalTokens
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.both.error("SummaryGenerator: Failed to generate summary", error);
        return {
            totalTokens: 0,
            error: msg
        };
    }
}

/**
 * Generates a structured markdown summary from processed files with tiered compression.
 * 
 * This function:
 * 1. Generates tiered context content from processedFiles (Full/Skeleton/Summary)
 * 2. Calls LLM with GENERATE_SUMMARY_PROMPT to create a strategic overview
 * 3. Writes final file as: [LLM Overview] + "\n\n" + [Tiered Context]
 * 
 * @param apiKey - Google API Key for LLM call
 * @param query - The user's original query
 * @param processedFiles - Files with their compression levels and content
 * @param blueprintSummary - Architectural context from blueprint
 * @param workspaceRoot - Root of the workspace for output location
 */
export async function generateStructuredSummary(
    apiKey: string,
    query: string,
    processedFiles: ProcessedFile[],
    blueprintSummary: string,
    workspaceRoot: string
): Promise<SummaryResult> {
    if (processedFiles.length === 0) {
        return { totalTokens: 0 };
    }

    logger.both.info(`SummaryGenerator: Generating structured summary for ${processedFiles.length} files...`);

    // Log tier breakdown
    const tierA = processedFiles.filter(f => f.compressionLevel === 'full').length;
    const tierB = processedFiles.filter(f => f.compressionLevel === 'skeleton').length;
    const tierC = processedFiles.filter(f => f.compressionLevel === 'summary').length;
    logger.both.info(`SummaryGenerator: Tier breakdown - Full: ${tierA}, Skeleton: ${tierB}, Summary: ${tierC}`);

    try {
        // Step 1: Generate tiered context content
        const { content: tieredContent, tokenCount } = await generateStructuredOutput(
            processedFiles,
            blueprintSummary,
            query
        );

        logger.both.info(`SummaryGenerator: Tiered content generated (${tokenCount} tokens)`);

        // Step 2: Call LLM with GENERATE_SUMMARY_PROMPT to create strategic overview
        // Truncate if extremely large to avoid context window issues
        const safeContent = tieredContent.length > 100000 
            ? tieredContent.substring(0, 100000) + '\n...[TRUNCATED]' 
            : tieredContent;
        
        const prompt = prompts.GENERATE_SUMMARY_PROMPT(query, safeContent);
        
        logger.both.info(`SummaryGenerator: Calling LLM to generate strategic overview...`);
        
        const { content: summaryMarkdown, totalTokens } = await llmClient.generateText(
            apiKey,
            prompt,
            "Generate Structured Summary"
        );

        logger.both.debug(`SummaryGenerator: LLM response type: ${typeof summaryMarkdown}, length: ${summaryMarkdown?.length}`);

        // Step 3: Ensure .repomix-runner/ directory exists
        const runnerDir = path.join(workspaceRoot, '.repomix-runner');
        if (!fs.existsSync(runnerDir)) {
            fs.mkdirSync(runnerDir, { recursive: true });
        }

        // Step 4: Write final file as: [LLM Summary] + "\n\n" + [Tiered Content]
        const fileName = `summary-${Date.now()}.md`;
        const summaryPath = path.join(runnerDir, fileName);
        const finalContent = summaryMarkdown + '\n\n' + tieredContent;
        fs.writeFileSync(summaryPath, finalContent);

        logger.both.info(`SummaryGenerator: Structured summary generated at ${summaryPath} (${totalTokens} LLM tokens used)`);

        return {
            summaryPath,
            totalTokens
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.both.error("SummaryGenerator: Failed to generate structured summary", error);
        return {
            totalTokens: 0,
            error: msg
        };
    }
}
