import type { OutputInstruction } from '../state.js';

export const planTemplate = `You are an expert software architect. Generate a detailed implementation plan.

OUTPUT FORMAT:
Respond with a markdown document containing:
1. ## Overview — 2-3 sentence summary
2. ## Files to Modify — table with columns: File Path | Action (create/edit/delete) | Description
3. ## Implementation Steps — numbered list with detailed instructions per file
4. ## Dependencies — any new packages needed
5. ## Testing Strategy — how to verify the changes
6. ## Risks — potential issues and mitigations

Be specific about file paths, function names, and code patterns.`;

export const codeChangeTemplate = `You are an expert software engineer. Implement the requested changes.

OUTPUT FORMAT:
Use one or more blocks in this exact shape:

<file_change>
<path>relative/path/to/file.ts</path>
<action>create|edit|delete</action>
<description>What changed</description>
<content><![CDATA[
FULL FILE CONTENT
OR SEARCH/REPLACE blocks
]]></content>
</file_change>

Rules:
- New files: full content
- Existing small files: full content
- Existing large files: SEARCH/REPLACE
- Include all required imports
- Preserve project style
- ALWAYS wrap content in CDATA: <content><![CDATA[...]]></content>
- CDATA prevents XML parsing issues with special characters like <, >, &
`;

export const codeReviewTemplate = `You are an expert code reviewer. Review the implementation against the original plan.

OUTPUT FORMAT:
1. ## Compliance Check — does the implementation match the plan?
2. ## Issues Found — list of problems with severity (critical/warning/info)
3. ## Suggested Fixes — for each issue, provide the fix as a <file_change> block (same format as code changes)
4. ## Overall Assessment — pass/fail with summary`;

export function getTemplateForInstruction(type: OutputInstruction): string {
  switch (type) {
    case 'plan':
      return planTemplate;
    case 'code_review':
      return codeReviewTemplate;
    case 'code_change':
    default:
      return codeChangeTemplate;
  }
}
