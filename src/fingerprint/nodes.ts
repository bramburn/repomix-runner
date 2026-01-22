import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { glob } from 'glob';
import { AnalysisGraphState, AnalysisError } from './state.js';
import * as llmClient from '../agent/llmClient.js';

// ========== Configuration ==========

/** Config file patterns to discover */
const CONFIG_FILE_PATTERNS = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.*.json',
  'jsconfig.json',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'vite.config.js',
  'vite.config.ts',
  'webpack.config.js',
  'rollup.config.js',
  'fly.toml',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  '.env.example',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'prisma/schema.prisma',
  'drizzle.config.ts',
];

/** Critical files for hash validation */
const CRITICAL_FILES = [
  'package.json',
  'tsconfig.json',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'vite.config.js',
  'vite.config.ts',
  'prisma/schema.prisma',
  'fly.toml',
];

/** Directories to ignore when mapping structure */
const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'out',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
];

/** Max depth for directory tree */
const MAX_TREE_DEPTH = 4;

/** Max files to sample for LLM analysis */
const MAX_SAMPLE_FILES = 10;

/** Max content length per file for LLM */
const MAX_CONTENT_LENGTH = 1500;

// ========== Helper Functions ==========

/**
 * Compute SHA256 hash of a file.
 */
function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Safely read file content with size limit.
 */
function safeReadFile(filePath: string, maxLength: number = 10000): string | null {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxLength) {
      return fs.readFileSync(filePath, 'utf-8').substring(0, maxLength) + '\n... (truncated)';
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get current git HEAD SHA.
 */
function getGitHeadSha(repoRoot: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Identify framework from package.json dependencies.
 */
function identifyFramework(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}): string {
  const allDeps = { ...deps, ...devDeps };
  
  if (allDeps['next']) return `Next.js ${allDeps['next']}`;
  if (allDeps['nuxt']) return `Nuxt ${allDeps['nuxt']}`;
  if (allDeps['@angular/core']) return `Angular ${allDeps['@angular/core']}`;
  if (allDeps['vue']) return `Vue ${allDeps['vue']}`;
  if (allDeps['svelte']) return `Svelte ${allDeps['svelte']}`;
  if (allDeps['express']) return `Express ${allDeps['express']}`;
  if (allDeps['fastify']) return `Fastify ${allDeps['fastify']}`;
  if (allDeps['react']) return `React ${allDeps['react']}`;
  
  return 'Unknown';
}

/**
 * Identify language from config files.
 */
function identifyLanguage(configFiles: string[]): string {
  if (configFiles.some(f => f.includes('tsconfig'))) return 'TypeScript';
  if (configFiles.some(f => f.includes('jsconfig'))) return 'JavaScript';
  return 'JavaScript';
}

/**
 * Classify directory purpose based on name.
 */
function classifyDirectory(name: string): string | undefined {
  const lower = name.toLowerCase();
  
  // Frontend
  if (['app', 'pages', 'views'].includes(lower)) return 'pages';
  if (['components', 'ui'].includes(lower)) return 'components';
  if (['layouts', 'templates'].includes(lower)) return 'layouts';
  if (['styles', 'css', 'scss'].includes(lower)) return 'styles';
  if (['hooks', 'composables'].includes(lower)) return 'hooks';
  if (['store', 'stores', 'state'].includes(lower)) return 'state';
  
  // Backend
  if (['api', 'routes', 'endpoints'].includes(lower)) return 'api';
  if (['controllers', 'handlers'].includes(lower)) return 'controllers';
  if (['services', 'service'].includes(lower)) return 'services';
  if (['middleware', 'middlewares'].includes(lower)) return 'middleware';
  if (['models', 'entities'].includes(lower)) return 'models';
  
  // Database
  if (['prisma', 'drizzle', 'migrations', 'db', 'database'].includes(lower)) return 'database';
  
  // Testing
  if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(lower)) return 'testing';
  if (['e2e', 'integration'].includes(lower)) return 'testing';
  
  // Shared
  if (['utils', 'helpers', 'lib', 'common', 'shared'].includes(lower)) return 'utilities';
  if (['types', 'interfaces', 'typings'].includes(lower)) return 'types';
  if (['config', 'configs', 'configuration'].includes(lower)) return 'config';
  if (['public', 'static', 'assets'].includes(lower)) return 'assets';
  
  return undefined;
}

// ========== Node Implementations ==========

/**
 * Node 1: Parse package.json and extract metadata.
 */
export async function parsePackageNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] parsePackageNode: Parsing package.json...');
  
  const packageJsonPath = path.join(state.repoRoot, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('[Fingerprint] parsePackageNode: No package.json found');
    return {
      packageInfo: undefined,
      errors: [{
        node: 'parsePackage',
        error: 'package.json not found',
        timestamp: Date.now()
      }]
    };
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    const packageInfo = {
      name: pkg.name,
      version: pkg.version,
      framework: identifyFramework(pkg.dependencies, pkg.devDependencies),
      language: 'TypeScript', // Will be confirmed in discoverConfigs
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      scripts: pkg.scripts || {}
    };

    console.log(`[Fingerprint] parsePackageNode: Found ${packageInfo.name} (${packageInfo.framework})`);
    
    return { packageInfo };
  } catch (error) {
    console.error('[Fingerprint] parsePackageNode: Error parsing package.json:', error);
    return {
      packageInfo: undefined,
      errors: [{
        node: 'parsePackage',
        error: `Failed to parse package.json: ${error}`,
        timestamp: Date.now()
      }]
    };
  }
}

/**
 * Node 2: Discover configuration files.
 */
export async function discoverConfigsNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] discoverConfigsNode: Discovering config files...');
  
  const configFiles: Array<{ path: string; type: string; content?: string }> = [];
  const hashes: Record<string, string> = {};

  for (const pattern of CONFIG_FILE_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: state.repoRoot,
      ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
      nodir: true
    });

    for (const match of matches) {
      const fullPath = path.join(state.repoRoot, match);
      const type = path.basename(match).replace(/\..+$/, '');
      
      // Read content for small config files
      let content: string | undefined;
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size < 5000) {
          content = fs.readFileSync(fullPath, 'utf-8');
        }
      } catch {
        // Ignore read errors
      }

      configFiles.push({ path: match, type, content });

      // Compute hash for critical files
      if (CRITICAL_FILES.some(cf => match.endsWith(cf))) {
        try {
          hashes[match] = computeFileHash(fullPath);
        } catch {
          // Ignore hash errors
        }
      }
    }
  }

  // Update language detection based on found configs
  const language = identifyLanguage(configFiles.map(c => c.path));
  const updatedPackageInfo = state.packageInfo 
    ? { ...state.packageInfo, language }
    : undefined;

  console.log(`[Fingerprint] discoverConfigsNode: Found ${configFiles.length} config files`);

  return {
    configFiles,
    criticalFileHashes: hashes,
    packageInfo: updatedPackageInfo
  };
}

/**
 * Node 3: Map directory structure.
 */
export async function mapStructureNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] mapStructureNode: Mapping directory structure...');
  
  let totalFileCount = 0;

  function buildTree(dirPath: string, depth: number = 0): any {
    const name = path.basename(dirPath) || state.repoRoot.split(path.sep).pop() || 'root';
    
    if (depth > MAX_TREE_DEPTH) {
      return { name, type: 'directory', children: [{ name: '...', type: 'truncated' }] };
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const children: any[] = [];

      for (const entry of entries) {
        if (IGNORE_DIRS.includes(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const child = buildTree(fullPath, depth + 1);
          child.classification = classifyDirectory(entry.name);
          children.push(child);
        } else {
          totalFileCount++;
          // Only include files at shallow depths
          if (depth <= 2) {
            children.push({ name: entry.name, type: 'file' });
          }
        }
      }

      // Sort: directories first, then files
      children.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      return { name, type: 'directory', children };
    } catch (error) {
      return { name, type: 'directory', error: 'access denied' };
    }
  }

  const directoryStructure = buildTree(state.repoRoot);
  
  // Get git commit SHA
  const lastGitCommit = getGitHeadSha(state.repoRoot);

  console.log(`[Fingerprint] mapStructureNode: Mapped structure with ${totalFileCount} files`);

  return {
    directoryStructure,
    totalFileCount,
    lastGitCommit
  };
}

/**
 * Node 4: Analyze architectural patterns using LLM.
 */
export async function analyzeArchitectureNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] analyzeArchitectureNode: Analyzing patterns...');

  if (!state.apiKey) {
    console.log('[Fingerprint] analyzeArchitectureNode: No API key, skipping LLM analysis');
    return {
      errors: [{
        node: 'analyzeArchitecture',
        error: 'API key not provided, skipping LLM analysis',
        timestamp: Date.now()
      }]
    };
  }

  try {
    // Collect sample files for analysis
    const sampleFiles = await collectSampleFiles(state.repoRoot, state.directoryStructure);
    
    const schema = z.object({
      namingConventions: z.string().describe('File and component naming patterns'),
      dataFetching: z.string().describe('Data fetching patterns (REST, GraphQL, hooks, etc.)'),
      stateManagement: z.string().describe('State management approach'),
      formHandling: z.string().describe('Form handling patterns'),
      apiConventions: z.string().describe('API route conventions'),
      databasePatterns: z.string().describe('Database access patterns')
    });

    const prompt = `You are a senior software architect analyzing a codebase.

Repository: ${state.packageInfo?.name || 'Unknown'}
Framework: ${state.packageInfo?.framework || 'Unknown'}
Language: ${state.packageInfo?.language || 'Unknown'}

Directory Structure:
${JSON.stringify(state.directoryStructure, null, 2).substring(0, 2000)}

Sample Files:
${sampleFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

Identify the architectural patterns used in this codebase. Be specific about:
1. Naming conventions for files and components
2. Data fetching patterns (REST, GraphQL, hooks, server components, etc.)
3. State management approach (Context, Redux, Zustand, etc.)
4. Form handling patterns (libraries, validation)
5. API conventions (route structure, middleware)
6. Database patterns (ORM, query builders)

If you cannot determine a pattern, say "Not detected".`;

    const { parsed, totalTokens } = await llmClient.generateStructured(
      state.apiKey,
      schema,
      prompt,
      'Analyze Architecture'
    );

    console.log(`[Fingerprint] analyzeArchitectureNode: Analysis complete (${totalTokens} tokens)`);

    return {
      architecturalPatterns: parsed,
      tokensUsed: totalTokens
    };
  } catch (error) {
    console.error('[Fingerprint] analyzeArchitectureNode: Error:', error);
    return {
      errors: [{
        node: 'analyzeArchitecture',
        error: `LLM analysis failed: ${error}`,
        timestamp: Date.now()
      }]
    };
  }
}

/**
 * Node 5: Generate development guides using LLM.
 */
export async function generateGuidesNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] generateGuidesNode: Generating guides...');

  if (!state.apiKey) {
    console.log('[Fingerprint] generateGuidesNode: No API key, skipping guide generation');
    return {
      errors: [{
        node: 'generateGuides',
        error: 'API key not provided, skipping guide generation',
        timestamp: Date.now()
      }]
    };
  }

  if (!state.architecturalPatterns) {
    console.log('[Fingerprint] generateGuidesNode: No patterns to base guides on');
    return {};
  }

  try {
    const schema = z.object({
      addPage: z.string().describe('Steps to add a new page/route'),
      addForm: z.string().describe('Steps to add a form with validation'),
      addAPI: z.string().describe('Steps to add an API endpoint'),
      addDatabase: z.string().describe('Steps to add a database table/model')
    });

    const prompt = `You are a technical writer creating step-by-step guides for developers.

Repository: ${state.packageInfo?.name || 'Unknown'}
Framework: ${state.packageInfo?.framework || 'Unknown'}
Language: ${state.packageInfo?.language || 'Unknown'}

Identified Patterns:
${JSON.stringify(state.architecturalPatterns, null, 2)}

Directory Structure Summary:
- Pages/Routes: ${findClassifiedDir(state.directoryStructure, 'pages') || 'Unknown'}
- Components: ${findClassifiedDir(state.directoryStructure, 'components') || 'Unknown'}
- API: ${findClassifiedDir(state.directoryStructure, 'api') || 'Unknown'}
- Database: ${findClassifiedDir(state.directoryStructure, 'database') || 'Unknown'}

Create concise how-to guides (3-5 bullet points each) for:
1. Adding a new page/route
2. Creating a form with validation
3. Adding an API endpoint
4. Adding a database table/model

Reference the identified patterns and directory locations.`;

    const { parsed, totalTokens } = await llmClient.generateStructured(
      state.apiKey,
      schema,
      prompt,
      'Generate Guides'
    );

    console.log(`[Fingerprint] generateGuidesNode: Guides generated (${totalTokens} tokens)`);

    return {
      developmentGuides: parsed,
      tokensUsed: totalTokens
    };
  } catch (error) {
    console.error('[Fingerprint] generateGuidesNode: Error:', error);
    return {
      errors: [{
        node: 'generateGuides',
        error: `Guide generation failed: ${error}`,
        timestamp: Date.now()
      }]
    };
  }
}

/**
 * Node 6: Finalize and mark as complete.
 */
export async function finalizeNode(
  state: typeof AnalysisGraphState.State
): Promise<Partial<typeof AnalysisGraphState.State>> {
  console.log('[Fingerprint] finalizeNode: Finalizing analysis...');

  const hasPackageInfo = !!state.packageInfo;
  const hasConfigFiles = (state.configFiles?.length || 0) > 0;
  const hasStructure = !!state.directoryStructure;
  
  // Consider successful if we have at least basic static analysis
  const success = hasPackageInfo || hasConfigFiles || hasStructure;

  console.log(`[Fingerprint] finalizeNode: Analysis ${success ? 'succeeded' : 'failed'}`);
  console.log(`  - Package info: ${hasPackageInfo}`);
  console.log(`  - Config files: ${state.configFiles?.length || 0}`);
  console.log(`  - Patterns: ${state.architecturalPatterns ? 'yes' : 'no'}`);
  console.log(`  - Guides: ${state.developmentGuides ? 'yes' : 'no'}`);
  console.log(`  - Errors: ${state.errors?.length || 0}`);

  return {
    success,
    generatedAt: Date.now()
  };
}

// ========== Helper Functions for Nodes ==========

/**
 * Find a classified directory in the tree.
 */
function findClassifiedDir(tree: any, classification: string): string | null {
  if (!tree) return null;
  
  if (tree.classification === classification) {
    return tree.name;
  }
  
  if (tree.children) {
    for (const child of tree.children) {
      const found = findClassifiedDir(child, classification);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Collect sample files for LLM analysis.
 */
async function collectSampleFiles(
  repoRoot: string,
  tree: any
): Promise<Array<{ path: string; content: string }>> {
  const samples: Array<{ path: string; content: string }> = [];
  
  // Patterns to prioritize for sampling
  const priorityPatterns = [
    '**/*.tsx',
    '**/*.ts',
    '**/page.tsx',
    '**/route.ts',
    '**/api/**/*.ts',
    '**/components/**/*.tsx',
    '**/hooks/**/*.ts'
  ];

  for (const pattern of priorityPatterns) {
    if (samples.length >= MAX_SAMPLE_FILES) break;

    const matches = await glob(pattern, {
      cwd: repoRoot,
      ignore: IGNORE_DIRS.map(d => `**/${d}/**`),
      nodir: true
    });

    for (const match of matches.slice(0, 3)) {
      if (samples.length >= MAX_SAMPLE_FILES) break;
      
      const fullPath = path.join(repoRoot, match);
      const content = safeReadFile(fullPath, MAX_CONTENT_LENGTH);
      
      if (content && content.length > 50) {
        samples.push({ path: match, content });
      }
    }
  }

  return samples;
}
