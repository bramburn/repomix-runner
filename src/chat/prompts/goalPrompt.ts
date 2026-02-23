/**
 * Goal synthesis prompt template for Gemini 2.5 Flash.
 * Takes user query, retrieved context, repo architecture, and dependencies
 * to produce a clear, actionable goal.
 */

export interface GoalPromptInput {
  userQuery: string;
  retrievedContext: Array<{
    filePath: string;
    content: string;
    score: number;
  }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  memoryContext?: string; // PRD 004: Injected memory context
}

/**
 * Builds the goal synthesis prompt.
 */
export function buildGoalPrompt(input: GoalPromptInput): string {
  const contextSnippets = input.retrievedContext
    .slice(0, 10) // Limit to top 10 most relevant
    .map(
      (ctx, i) =>
        `### Context ${i + 1}: ${ctx.filePath}\n\`\`\`\n${ctx.content.slice(0, 2000)}\n\`\`\``
    )
    .join('\n\n');

  const dependencyList = Object.entries(input.dependencies)
    .slice(0, 20)
    .map(([name, version]) => `- ${name}: ${version}`)
    .join('\n');

  // Build memory section if available
  const memorySection = input.memoryContext
    ? `\n${input.memoryContext}`
    : '';

  return `You are a senior software architect analyzing a user's request to help them accomplish a development task.

## User's Request
${input.userQuery}
${memorySection}
## Repository Architecture
${input.repoArchitecture || 'No architecture document available.'}

## Project Dependencies
${dependencyList || 'No dependencies found.'}

## Retrieved Context
${contextSnippets || 'No context retrieved.'}

## Your Task
Synthesize the user's request into a clear, actionable goal. Your response should:

1. **Goal Statement**: A concise 1-2 sentence description of what needs to be accomplished
2. **Key Requirements**: Bullet points of specific requirements extracted from the request
3. **Relevant Files**: List the files from the context that are most relevant to this task
4. **Dependencies**: Note any dependencies that may be relevant
5. **Approach**: Brief outline of the recommended approach

Respond in JSON format:
{
  "goalText": "Clear, actionable goal statement",
  "requirements": ["requirement 1", "requirement 2"],
  "relevantFiles": ["path/to/file1.ts", "path/to/file2.ts"],
  "relevantDependencies": ["dep1", "dep2"],
  "approach": "Brief approach outline",
  "reasoning": "Why this goal captures the user's intent"
}`;
}

/**
 * Response structure from goal synthesis.
 */
export interface GoalPromptResponse {
  goalText: string;
  requirements: string[];
  relevantFiles: string[];
  relevantDependencies: string[];
  approach: string;
  reasoning: string;
}

/**
 * Parses the goal prompt response from LLM output.
 */
export function parseGoalResponse(response: string): GoalPromptResponse {
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]) as GoalPromptResponse;
  } catch (error) {
    // Return a fallback with the raw response as the goal
    return {
      goalText: response.slice(0, 500),
      requirements: [],
      relevantFiles: [],
      relevantDependencies: [],
      approach: '',
      reasoning: 'Failed to parse structured response',
    };
  }
}
