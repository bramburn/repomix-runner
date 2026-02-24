/**
 * analyzeKeyFilesNode - Identifies and summarizes key files in the repository.
 * 
 * Finds entry points, config files, type definitions, and README.
 */
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { glob } from 'glob';
import type { ArchitectureState } from '../architectureState.js';

/** Maximum lines to read for file summary */
const MAX_LINES = 100;

/**
 * Read first N lines of a file for analysis.
 * Uses streaming to avoid OOM on large files.
 */
async function readFirstLines(filePath: string, maxLines: number = MAX_LINES): Promise<string> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let lineCount = 0;
    
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (lineCount < maxLines) {
        lines.push(line);
        lineCount++;
      } else {
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => {
      const result = lines.join('\n');
      resolve(result + (lineCount >= maxLines ? '\n... (truncated)' : ''));
    });

    rl.on('error', () => {
      resolve('');
    });
  });
}

/**
 * Determine the purpose of a key file based on its name and location.
 */
function determineFilePurpose(filePath: string, content: string): string {
  const basename = path.basename(filePath);
  const dirname = path.dirname(filePath);
  
  // Entry points
  if (basename === 'extension.ts' || basename === 'index.ts' || basename === 'main.ts') {
    return 'Extension entry point, command registration';
  }
  if (basename === 'app.tsx' || basename === 'main.tsx') {
    return 'Application entry point, React root';
  }
  if (basename === 'index.js' && dirname.endsWith('src')) {
    return 'Module entry point';
  }
  
  // Config files
  if (basename === 'package.json') {
    try {
      const pkg = JSON.parse(content);
      return `Package manifest - ${pkg.name || 'unnamed'} (${pkg.description || 'no description'})`;
    } catch {
      return 'Package manifest';
    }
  }
  if (basename === 'tsconfig.json') {
    return 'TypeScript compiler configuration';
  }
  if (basename === 'repomix.config.json') {
    return 'Repomix Runner configuration';
  }
  if (basename.startsWith('webpack.config.') || basename.startsWith('vite.config.') || basename.startsWith('rollup.config.')) {
    return 'Build tool configuration';
  }
  if (basename === 'next.config.js' || basename === 'next.config.ts') {
    return 'Next.js framework configuration';
  }
  
  // Type definitions
  if (basename.endsWith('.d.ts')) {
    return 'TypeScript type definitions';
  }
  if (dirname.includes('types') || dirname.includes('interfaces') || dirname.includes('typings')) {
    return 'Type/interface definitions';
  }
  
  // Documentation
  if (basename === 'README.md') {
    return 'Project documentation and getting started guide';
  }
  if (basename === 'CHANGELOG.md') {
    return 'Version history and changes';
  }
  if (basename === 'CONTRIBUTING.md') {
    return 'Contribution guidelines';
  }
  
  // Graph/workflow definitions
  if (basename === 'graph.ts' || basename === 'graph.js') {
    return 'LangGraph workflow definition';
  }
  if (basename === 'nodes.ts' || basename === 'nodes.js') {
    return 'Workflow node implementations';
  }
  if (basename === 'state.ts' || basename === 'state.js') {
    return 'State annotations and types';
  }
  
  // Database/Storage
  if (basename.includes('repository') || basename.includes('database')) {
    return 'Data access layer';
  }
  if (basename.includes('schema') && (basename.endsWith('.sql') || basename.endsWith('.ts'))) {
    return 'Database schema definitions';
  }
  
  // Default fallback
  const dirParts = dirname.split(path.sep);
  const lastDir = dirParts[dirParts.length - 1];
  return `Source file in ${lastDir}`;
}

export async function analyzeKeyFilesNode(
  state: typeof ArchitectureState.State
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] analyzeKeyFilesNode: Analyzing key files...');

  try {
    const repoRoot = state.repoRoot;
    const keyFiles: Array<{ path: string; purpose: string }> = [];

    // Patterns for key files to identify
    const keyFilePatterns = [
      'package.json',
      'tsconfig.json',
      'jsconfig.json',
      'repomix.config.json',
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'src/extension.ts',
      'src/index.ts',
      'src/main.ts',
      'src/app.tsx',
      'src/main.tsx',
      'src/chat/graph.ts',
      'src/agent/graph.ts',
      'src/fingerprint/graph.ts',
      '**/graph.ts',
      '**/nodes.ts',
      '**/state.ts',
      '**/*.d.ts',
      '**/types/**/*.ts',
      '**/interfaces/**/*.ts',
    ];

    // Search for key files
    for (const pattern of keyFilePatterns) {
      try {
        const matches = await glob(pattern, {
          cwd: repoRoot,
          ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'out/**'],
          nodir: true,
        });

        for (const match of matches.slice(0, 3)) { // Limit per pattern
          const fullPath = path.join(repoRoot, match);
          
          // Read content for purpose determination
          const content = await readFirstLines(fullPath);
          const purpose = determineFilePurpose(fullPath, content);
          
          keyFiles.push({
            path: match,
            purpose,
          });
        }
      } catch (error) {
        // Ignore glob errors for invalid patterns
      }
    }

    // Remove duplicates and limit total
    const uniqueKeyFiles = Array.from(
      new Map(keyFiles.map(f => [f.path, f])).values()
    ).slice(0, 20);

    console.log(`[Architecture] analyzeKeyFilesNode: Identified ${uniqueKeyFiles.length} key files`);

    return {
      keyFiles: uniqueKeyFiles,
    };
  } catch (error) {
    console.error('[Architecture] analyzeKeyFilesNode: Error analyzing key files:', error);
    return {
      keyFiles: [],
    };
  }
}
