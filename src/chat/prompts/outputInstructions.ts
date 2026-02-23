/**
 * Output instruction templates for batch submission.
 * These templates tell the LLM exactly how to format its output
 * depending on the type of task (plan, code_change, code_review).
 */

import type { OutputInstruction } from '../state.js';

/**
 * Plan instruction - for generating implementation plans.
 */
export const planInstruction = `
## Output Format: Implementation Plan

Generate a detailed implementation plan in Markdown format with the following structure:

\`\`\`markdown
# Implementation Plan: [Title]

## Overview
Brief description of what will be implemented.

## Prerequisites
- [ ] List any setup steps needed
- [ ] Dependencies to install
- [ ] Configuration changes

## Implementation Steps

### Step 1: [Title]
**Files to modify:** \`path/to/file.ts\`
**Description:** What to do in this step
**Code changes:** Brief description of changes

### Step 2: [Title]
...

## Testing Strategy
- [ ] Unit tests to add
- [ ] Integration tests
- [ ] Manual testing steps

## Rollback Plan
How to revert if something goes wrong.
\`\`\`

Focus on being specific and actionable. Include file paths and code locations.
`;

/**
 * Code change instruction - for generating actual code modifications.
 */
export const codeChangeInstruction = `
## Output Format: Code Changes

Generate file changes in JSON format. For each file, specify whether to create, edit, or delete.

\`\`\`json
{
  "summary": "Brief summary of all changes",
  "changes": [
    {
      "filePath": "path/to/file.ts",
      "action": "edit",
      "description": "What this change does",
      "searchReplace": [
        {
          "search": "// exact code to find",
          "replace": "// new code to insert"
        }
      ]
    },
    {
      "filePath": "path/to/new-file.ts",
      "action": "create",
      "description": "New file for X",
      "content": "// full file content here"
    },
    {
      "filePath": "path/to/old-file.ts",
      "action": "delete",
      "description": "No longer needed because Y"
    }
  ]
}
\`\`\`

Important guidelines:
- For "edit" actions, use search/replace blocks with EXACT code to match
- Include enough context in search strings to ensure unique matches
- For "create" actions, provide the complete file content
- Keep changes minimal and focused
- Preserve existing code style and conventions
`;

/**
 * Code review instruction - for reviewing code and suggesting improvements.
 */
export const codeReviewInstruction = `
## Output Format: Code Review

Review the provided code changes and provide feedback in JSON format:

\`\`\`json
{
  "overallAssessment": "summary of the code quality",
  "approved": true,
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "filePath": "path/to/file.ts",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "positives": [
    "Good things about the code"
  ],
  "recommendations": [
    "Additional improvements to consider"
  ]
}
\`\`\`

Review criteria:
- Correctness: Does the code work as intended?
- Security: Are there any security vulnerabilities?
- Performance: Are there performance concerns?
- Maintainability: Is the code readable and maintainable?
- Testing: Are edge cases handled? Are tests adequate?
`;

/**
 * Gets the appropriate output instruction for the given type.
 */
export function getOutputInstruction(type: OutputInstruction): string {
  switch (type) {
    case 'plan':
      return planInstruction;
    case 'code_change':
      return codeChangeInstruction;
    case 'code_review':
      return codeReviewInstruction;
    default:
      return codeChangeInstruction;
  }
}

/**
 * Builds a complete prompt for batch submission.
 */
export function buildBatchPrompt(params: {
  goal: string;
  contextFiles: Array<{ path: string; content: string }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: OutputInstruction;
}): string {
  const { goal, contextFiles, repoArchitecture, dependencies, outputInstruction } = params;

  const contextSection = contextFiles
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join('\n\n');

  const depsSection = Object.entries(dependencies)
    .slice(0, 30)
    .map(([name, version]) => `- ${name}: ${version}`)
    .join('\n');

  const instruction = getOutputInstruction(outputInstruction);

  return `# Development Task

## Goal
${goal}

## Repository Architecture
${repoArchitecture || 'Not available'}

## Dependencies
${depsSection || 'Not available'}

## Context Files
${contextSection || 'No context files provided'}

${instruction}

Please complete this task following the output format specified above.`;
}
