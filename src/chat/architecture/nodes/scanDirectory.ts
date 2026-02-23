/**
 * scanDirectoryNode - Walks filesystem and builds classified directory tree.
 * 
 * Reuses logic from fingerprint/nodes.ts to maintain consistency.
 */
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { ArchitectureState } from '../architectureState.js';

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

/**
 * Classify directory purpose based on name.
 * Reused from fingerprint/nodes.ts
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

/**
 * Build directory tree with classification.
 */
function buildTree(dirPath: string, repoRoot: string, depth: number = 0): any {
  const name = path.basename(dirPath) || repoRoot.split(path.sep).pop() || 'root';
  
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
        const child = buildTree(fullPath, repoRoot, depth + 1);
        child.classification = classifyDirectory(entry.name);
        children.push(child);
      } else {
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

export async function scanDirectoryNode(
  state: typeof ArchitectureState.State
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] scanDirectoryNode: Scanning directory structure...');

  try {
    const repoRoot = state.repoRoot;
    
    // Build the directory tree
    const directoryTree = buildTree(repoRoot, repoRoot);
    
    console.log('[Architecture] scanDirectoryNode: Directory tree built successfully');
    
    return {
      directoryTree,
    };
  } catch (error) {
    console.error('[Architecture] scanDirectoryNode: Error scanning directory:', error);
    throw error;
  }
}
