import * as fs from 'fs';
import * as path from 'path';
import * as prompts from './prompts';
import * as llmClient from './llmClient';
import * as tools from './tools';
import { logger } from '../shared/logger';

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
        fs.writeFileSync(summaryPath, summaryMarkdown);

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
