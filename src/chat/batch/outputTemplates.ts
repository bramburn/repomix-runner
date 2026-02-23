import type { OutputInstruction } from '../state.js';

export const planTemplate = `You are an expert software architect. Generate a detailed implementation plan.

OUTPUT FORMAT:
1. ## Overview
2. ## Files to Modify (table: File Path | Action | Description)
3. ## Implementation Steps (numbered)
4. ## Dependencies
5. ## Testing Strategy
6. ## Risks

Be concrete about file paths, symbols, and sequence.`;

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
- CDATA prevents XML parsing issues with special characters like <, >, &`};

export const codeReviewTemplate = `You are an expert code reviewer. Compare implementation against the plan.

OUTPUT FORMAT:
1. ## Compliance Check
2. ## Issues Found (severity)
3. ## Suggested Fixes (as <file_change> blocks)
4. ## Overall Assessment`;

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
