import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock ProcessedFile data representing all 3 tiers
const mockProcessedFiles = [
  // Tier A - Full content
  {
    path: 'src/core/api.ts',
    content: `export class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  async get(endpoint: string): Promise<any> {
    const response = await fetch(this.baseUrl + endpoint);
    return response.json();
  }
  
  async post(endpoint: string, data: any): Promise<any> {
    const response = await fetch(this.baseUrl + endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return response.json();
  }
}`,
    compressionLevel: 'full',
    tokens: 150,
    relevanceScore: 0.95
  },
  {
    path: 'src/handlers/userHandler.ts',
    content: `import { ApiClient } from '../core/api';

export async function handleUserRequest(userId: string) {
  const client = new ApiClient('https://api.example.com');
  const user = await client.get('/users/' + userId);
  return { success: true, data: user };
}`,
    compressionLevel: 'full',
    tokens: 80,
    relevanceScore: 0.92
  },
  
  // Tier B - Skeleton
  {
    path: 'src/utils/helpers.ts',
    content: `export function formatDate(date: Date): string { ... }

export function parseJson<T>(str: string): T | null { ... }

export function debounce(fn: Function, delay: number): Function { ... }

export class Logger {
  private prefix: string;
  
  constructor(prefix: string) { ... }
  
  log(message: string): void { ... }
  error(message: string, error?: Error): void { ... }
}`,
    compressionLevel: 'skeleton',
    tokens: 60,
    relevanceScore: 0.75
  },
  
  // Tier C - Summary
  {
    path: 'src/config/constants.ts',
    content: `// File: src/config/constants.ts
// Summary: Defines application-wide constants including API endpoints, timeout values, and feature flags used throughout the codebase.`,
    compressionLevel: 'summary',
    tokens: 25,
    relevanceScore: 0.55
  },
  {
    path: 'src/types/index.ts',
    content: `// File: src/types/index.ts
// Summary: Exports TypeScript interfaces and types for User, ApiResponse, and Config objects used by the API client and handlers.`,
    compressionLevel: 'summary',
    tokens: 25,
    relevanceScore: 0.50
  }
];

const mockBlueprintSummary = `## Architecture Overview

This is a TypeScript API client application with the following structure:
- **core/**: Core API client implementation
- **handlers/**: Request handlers for different resource types
- **utils/**: Shared utility functions and helpers
- **config/**: Configuration and constants
- **types/**: TypeScript type definitions

The application follows a layered architecture with clear separation between API communication, business logic, and utilities.`;

const userQuery = "How does the API client handle user requests?";

// Replicate generateStructuredOutput logic
function generateStructuredOutput(processedFiles, blueprintSummary, userQuery) {
  const sections = [];

  // Header
  sections.push(`# Context for: ${userQuery}/n`);

  // Section 1: Architecture
  if (blueprintSummary && blueprintSummary.trim()) {
    sections.push(`## 1. Architecture/n/n${blueprintSummary}/n`);
  }

  // Group files by compression level
  const fullFiles = processedFiles.filter(f => f.compressionLevel === 'full');
  const skeletonFiles = processedFiles.filter(f => f.compressionLevel === 'skeleton');
  const summaryFiles = processedFiles.filter(f => f.compressionLevel === 'summary');

  // Section 2: Active Context (Full Code)
  if (fullFiles.length > 0) {
    sections.push(`## 2. Active Context (Full Code)/n`);
    sections.push(`The following ${fullFiles.length} file(s) are critical to your request and are provided in full./n`);
    
    for (const file of fullFiles) {
      sections.push(`### ${file.path}/n`);
      sections.push(`<file path="${file.path}">/n${file.content}/n</file>/n`);
    }
  }

  // Section 3: Structure & Interfaces (Skeletons)
  if (skeletonFiles.length > 0) {
    sections.push(`## 3. Structure & Interfaces (Skeletons)/n`);
    sections.push(`The following ${skeletonFiles.length} file(s) provide type contracts and signatures referenced by the active context./n`);
    
    for (const file of skeletonFiles) {
      sections.push(`### ${file.path}/n`);
      sections.push(`<file path="${file.path}" compression="skeleton">/n${file.content}/n</file>/n`);
    }
  }

  // Section 4: Supporting Summaries
  if (summaryFiles.length > 0) {
    sections.push(`## 4. Supporting Summaries/n`);
    sections.push(`High-level descriptions of ${summaryFiles.length} peripheral file(s) for context./n`);
    
    for (const file of summaryFiles) {
      const summaryLine = file.content.split('/n').find(line => line.startsWith('// Summary:'));
      const summary = summaryLine ? summaryLine.replace('// Summary:', '').trim() : file.content;
      sections.push(`- **${file.path}**: ${summary}`);
    }
    sections.push('');
  }

  return sections.join('/n');
}

// Run test
console.log('=== Semantic Folding Pipeline Test ===/n');

const output = generateStructuredOutput(mockProcessedFiles, mockBlueprintSummary, userQuery);

// Save to .repomix-runner/
const runnerDir = join(process.cwd(), '.repomix-runner');
if (!existsSync(runnerDir)) {
  mkdirSync(runnerDir, { recursive: true });
}
const outputPath = join(runnerDir, `test-summary-${Date.now()}.md`);
writeFileSync(outputPath, output);

console.log(`Output saved to: ${outputPath}/n`);

// Verify all tiers present
const hasTierA = output.includes('## 2. Active Context (Full Code)');
const hasTierB = output.includes('## 3. Structure & Interfaces (Skeletons)');
const hasTierC = output.includes('## 4. Supporting Summaries');
const hasArchitecture = output.includes('## 1. Architecture');

console.log('Verification:');
console.log(`  [${hasArchitecture ? '✓' : '✗'}] Architecture section present`);
console.log(`  [${hasTierA ? '✓' : '✗'}] Tier A (Full Code) section present`);
console.log(`  [${hasTierB ? '✓' : '✗'}] Tier B (Skeletons) section present`);
console.log(`  [${hasTierC ? '✓' : '✗'}] Tier C (Summaries) section present`);

// Check content integrity
const hasFullCode = output.includes('export class ApiClient');
const hasSkeleton = output.includes('compression="skeleton"');
const hasSummary = output.includes('Defines application-wide constants');

console.log(`  [${hasFullCode ? '✓' : '✗'}] Full code content preserved`);
console.log(`  [${hasSkeleton ? '✓' : '✗'}] Skeleton markers present`);
console.log(`  [${hasSummary ? '✓' : '✗'}] LLM summaries included`);

const allPassed = hasArchitecture && hasTierA && hasTierB && hasTierC && hasFullCode && hasSkeleton && hasSummary;
console.log(`/n${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

process.exit(allPassed ? 0 : 1);
