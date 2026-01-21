
export const ANALYZE_OBJECTIVE_PROMPT = (userQuery: string) => `
Analyze this user query for a code repository assistant.
User Query: "${userQuery}"

Determine:
1. Objective Type: 
   - 'ACTION': If the user wants to modify code, refactor, implement a feature, or perform a specific task.
   - 'SEARCH': If the user wants to understand how something works, find where a feature is implemented, or explore the codebase.

2. Relevance Criteria:
   - Provide a concise instruction for a filter. 
   - Use "Exclude..." and "Focus on..." style.

Provide these in a structured JSON format.
`;

export const ACTION_RELEVANCE_PROMPT = (query: string, criteria: string, fileEntries: string) => `
You are a technical expert preparing files for a CODE MODIFICATION task.
User Query: "${query}"
Specific Criteria: ${criteria}

Files to analyze:
${fileEntries}

Task:
Strictly identify ONLY the files that must be modified or referenced to implement the requested change. 
- Exclude documentation, tests (unless specified), and unrelated utilities.
- IMPORTANT: Always KEEP relevant files that contain data structures (interfaces, types, classes, schemas, models) if they are referenced by or necessary for the code being modified.
- If a file is not essential for the build, the logic of the change, or the data types involved, mark isRelevant: false.

Return JSON: [{"path": "string", "isRelevant": boolean, "confidence": number}]
`;

export const SEARCH_RELEVANCE_PROMPT = (query: string, criteria: string, fileEntries: string) => `
You are a technical expert helping a user EXPLORE and UNDERSTAND a codebase.
User Query: "${query}"
Specific Criteria: ${criteria}

Files to analyze:
${fileEntries}

Task:
Identify files that provide context, definitions, or examples related to the query.
- Include files that help the user understand the flow or architecture.
- IMPORTANT: Always KEEP relevant files that contain data structures (interfaces, types, classes, schemas, models) related to the topic.
- Be more inclusive than an ACTION task, but still exclude completely unrelated noise.

Return JSON: [{"path": "string", "isRelevant": boolean, "confidence": number}]
`;
