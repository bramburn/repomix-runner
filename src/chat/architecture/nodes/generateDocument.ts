/**
 * generateDocumentNode - Calls Gemini Flash to generate markdown architecture document.
 * 
 * Takes directory tree, key files, and dependencies, returns formatted markdown.
 */
import * as path from 'path';
import { generateText } from '../../../agent/llmClient.js';
import { createArchitecturePrompt } from '../prompts.js';
import type { ArchitectureState } from '../architectureState.js';

export async function generateDocumentNode(
  state: typeof ArchitectureState.State,
  signal?: AbortSignal
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] generateDocumentNode: Generating markdown document...');

  try {
    // Check abort signal
    if (signal?.aborted) {
      throw new Error('AbortError: Operation cancelled');
    }

    const repoRoot = state.repoRoot;
    const repoName = path.basename(repoRoot);

    // Prepare data for prompt
    const promptData = {
      repoName,
      directoryTree: state.directoryTree,
      keyFiles: state.keyFiles,
      dependencies: state.dependencies,
    };

    // Create the prompt
    const prompt = createArchitecturePrompt(promptData);

    // Call Gemini Flash (non-structured since we want markdown)
    const apiKey = (global as any).extensionContext?.secrets 
      ? await (global as any).extensionContext.secrets.get('repomix.agent.googleApiKey')
      : undefined;

    if (!apiKey) {
      console.warn('[Architecture] generateDocumentNode: No API key available, generating basic document');
      // Generate a basic document without LLM
      const basicDoc = generateBasicDocument(promptData);
      return {
        markdownDocument: basicDoc,
        tokensUsed: 0,
      };
    }

    // Use LLM to generate the document
    const response = await generateText(apiKey, prompt, 'Generate Architecture Document');

    console.log(`[Architecture] generateDocumentNode: Document generated`);

    return {
      markdownDocument: response.content,
      tokensUsed: response.totalTokens || 0,
    };
  } catch (error) {
    console.error('[Architecture] generateDocumentNode: Error generating document:', error);
    
    // Fallback to basic document generation
    const repoRoot = state.repoRoot;
    const repoName = path.basename(repoRoot);
    const basicDoc = generateBasicDocument({
      repoName,
      directoryTree: state.directoryTree,
      keyFiles: state.keyFiles,
      dependencies: state.dependencies,
    });
    
    return {
      markdownDocument: basicDoc,
      tokensUsed: 0,
    };
  }
}

/**
 * Fallback: Generate a basic architecture document without LLM.
 * Used when API key is unavailable or LLM call fails.
 */
function generateBasicDocument(data: {
  repoName: string;
  directoryTree: any;
  keyFiles: Array<{ path: string; purpose: string }>;
  dependencies: Record<string, string>;
}): string {
  const { repoName, directoryTree, keyFiles, dependencies } = data;

  let markdown = `# Repository Architecture: ${repoName}\n\n`;

  // Overview
  markdown += `## Overview\n\n`;
  markdown += `This repository contains the ${repoName} project. (Auto-generated architecture documentation)\n\n`;

  // Tech Stack
  markdown += `## Tech Stack\n\n`;
  const depCount = Object.keys(dependencies).length;
  if (depCount > 0) {
    markdown += `- **Dependencies**: ${depCount} packages identified\n`;
    const topDeps = Object.entries(dependencies).slice(0, 10);
    for (const [name, version] of topDeps) {
      markdown += `  - \`${name}\`: ${version}\n`;
    }
    if (depCount > 10) {
      markdown += `  - ... and ${depCount - 10} more\n`;
    }
  } else {
    markdown += `- Language and framework information not detected\n`;
  }
  markdown += `\n`;

  // Directory Structure
  markdown += `## Directory Structure\n\n`;
  markdown += '```\n';
  markdown += formatTree(directoryTree, 0);
  markdown += '```\n\n';

  // Key Files
  markdown += `## Key Files\n\n`;
  markdown += `| File | Purpose |\n`;
  markdown += `|------|---------|\n`;
  for (const file of keyFiles) {
    markdown += `| \`${file.path}\` | ${file.purpose} |\n`;
  }
  markdown += `\n`;

  // Architectural Patterns
  markdown += `## Architectural Patterns\n\n`;
  markdown += `Architectural patterns analysis requires LLM. Configure Google API key for detailed analysis.\n`;

  return markdown;
}

/**
 * Format directory tree as ASCII art.
 */
function formatTree(node: any, depth: number = 0): string {
  if (!node) return '';
  
  let result = '';
  const indent = '│   '.repeat(depth);
  const prefix = depth === 0 ? '' : '├── ';
  
  const classification = node.classification ? ` (${node.classification})` : '';
  result += `${indent}${prefix}${node.name}${classification}\n`;
  
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      result += formatTree(child, depth + 1);
    }
  }
  
  return result;
}
