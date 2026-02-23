/**
 * Prompt templates for architecture document generation.
 */

/**
 * Main prompt for generating the architecture markdown document.
 * Takes directory tree, key files, and dependencies as input.
 */
export function createArchitecturePrompt(data: {
  repoName: string;
  directoryTree: any;
  keyFiles: Array<{ path: string; purpose: string }>;
  dependencies: Record<string, string>;
}): string {
  const { repoName, directoryTree, keyFiles, dependencies } = data;

  return `You are a software architect analyzing a codebase. Generate a comprehensive markdown architecture document.

Repository: ${repoName}

## Directory Structure
${JSON.stringify(directoryTree, null, 2)}

## Key Files
${keyFiles.map(f => `- \`${f.path}\`: ${f.purpose}`).join('\n')}

## Dependencies
${Object.entries(dependencies)
  .map(([name, version]) => `- \`${name}\`: ${version}`)
  .join('\n')}

Generate a markdown document with these sections:

# Repository Architecture: ${repoName}

## Overview
Write a 2-3 sentence description of what this project is and does based on the structure and files you see.

## Tech Stack
Identify and list:
- **Language**: (TypeScript/JavaScript/Python/etc.)
- **Framework**: (React/Vue/Next.js/Express/etc.)
- **Key Dependencies**: List the most important ones from the dependencies
- **Build Tools**: (esbuild/webpack/vite/tsc/etc.)
- **Testing**: (Mocha/Jest/Vitest/etc.)

## Directory Structure
\`\`\`
Show the directory tree here with inline comments explaining what each folder does.
For example:
src/
├── extension.ts          # Extension entry point, command registration
├── agent/                # Smart Agent workflow (file selection + bundling)
│   ├── graph.ts          # Graph definition with nodes and edges
│   └── nodes.ts          # Node implementations
├── core/
│   ├── compression/      # AST-based code compression (tree-sitter)
│   ├── indexing/         # Vector DB indexing pipeline
│   └── storage/          # SQLite database service
└── ...
\`\`\`

## Key Files
Create a table with File and Purpose columns:
| File | Purpose |
|------|---------|
| [List each key file with its purpose] |

## Architectural Patterns
Identify and describe:
- Design patterns used (e.g., Controller Pattern, Repository Pattern, etc.)
- Code organization approach (e.g., feature-based, layer-based, etc.)
- Data flow patterns
- Any notable architectural decisions

Be specific and concise. Use markdown formatting appropriately.`;
}
