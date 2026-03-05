/**
 * CLI script to generate code enrichments for a repository
 * Usage: npm run enrich:repo -- <repo-id> [file-pattern]
 *
 * Example:
 *   npm run enrich:repo -- my-repo src/**/*.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { LanguageParser } from '../src/core/compression/LanguageParser.js';
import { enrichmentRepository } from '../src/core/indexing/enrichmentRepository.js';
import { enrichmentLLMService } from '../src/core/indexing/enrichmentLLMService.js';
import { initPool, testConnectionString } from '../src/chat/db/postgresClient.js';

interface EnrichmentOptions {
  repoId: string;
  pattern?: string;
  provider?: 'gemini' | 'ollama' | 'lmstudio' | 'openrouter';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  dryRun?: boolean;
}

async function findFiles(pattern: string): Promise<string[]> {
  const files = await glob(pattern, {
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  });
  return files;
}

async function extractSymbols(
  filePath: string,
  content: string
): Promise<
  Array<{
    name: string;
    type: string;
    lineStart: number;
    lineEnd: number;
    signature: string;
    code: string;
  }>
> {
  const ext = path.extname(filePath).slice(1);
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    dart: 'dart',
    cs: 'csharp',
    rs: 'rust',
  };

  const lang = langMap[ext];
  if (!lang) {
    console.log(`  Skipping unsupported extension: ${ext}`);
    return [];
  }

  const parser = LanguageParser.getInstance();

  try {
    const parserInstance = await parser.getParserForLang(lang as any);
    const query = await parser.getQueryForLang(lang as any);

    if (!parserInstance || !query) {
      console.log(`  Failed to load parser for ${lang}`);
      return [];
    }

    const tree = parserInstance.parse(content);
    const captures = query.captures(tree.rootNode);

    const symbols: Array<{
      name: string;
      type: string;
      lineStart: number;
      lineEnd: number;
      signature: string;
      code: string;
    }> = [];

    for (const capture of captures as any[]) {
      const node = capture.node;
      const lines = content.split('\n');

      // Get line numbers (1-indexed)
      const lineStart = node.startPosition.row + 1;
      const lineEnd = node.endPosition.row + 1;

      // Get the first line as signature
      const firstLine = lines[node.startPosition.row] || '';
      const signature = firstLine.trim();

      // Get the full code snippet for this symbol
      const codeLines = lines.slice(node.startPosition.row, node.endPosition.row + 1);
      const code = codeLines.join('\n');

      symbols.push({
        name: capture.name || 'unknown',
        type: node.type,
        lineStart,
        lineEnd,
        signature,
        code,
      });
    }

    return symbols;
  } catch (error) {
    console.error(`  Error parsing ${filePath}:`, error);
    return [];
  }
}

async function enrichFile(
  filePath: string,
  repoId: string,
  options: EnrichmentOptions
): Promise<number> {
  const absolutePath = path.resolve(filePath);
  console.log(`\nProcessing: ${filePath}`);

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const symbols = await extractSymbols(filePath, content);

    if (symbols.length === 0) {
      console.log('  No symbols found');
      return 0;
    }

    console.log(`  Found ${symbols.length} symbols`);

    let enriched = 0;
    for (const symbol of symbols) {
      if (options.dryRun) {
        console.log(`  Would enrich: ${symbol.name} (${symbol.type})`);
        enriched++;
        continue;
      }

      try {
        await enrichmentLLMService.generateAndStoreEnrichment(
          absolutePath,
          repoId,
          symbol.name,
          symbol.type,
          symbol.signature,
          symbol.code,
          symbol.lineStart,
          symbol.lineEnd
        );
        enriched++;
        console.log(`  Enriched: ${symbol.name}`);

        // Rate limiting - wait a bit between calls
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`  Failed to enrich ${symbol.name}:`, error);
      }
    }

    return enriched;
  } catch (error) {
    console.error(`  Error processing file:`, error);
    return 0;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: npm run enrich:repo -- <repo-id> [file-pattern] [options]

Arguments:
  repo-id       Unique identifier for the repository
  file-pattern  Glob pattern for files to process (default: "src/**/*.{ts,js,tsx,jsx}")

Options:
  --provider    LLM provider: gemini, ollama, lmstudio, openrouter (default: gemini)
  --base-url   Base URL for local LLM (default: http://localhost:11434)
  --api-key    API key for the provider
  --model      Model name to use
  --dry-run    Show what would be enriched without actually enriching

Examples:
  npm run enrich:repo -- my-repo "src/**/*.ts"
  npm run enrich:repo -- my-repo "src/**/*.ts" --provider ollama --base-url http://localhost:11434
  npm run enrich:repo -- my-repo --dry-run
`);
    process.exit(1);
  }

  const repoId = args[0];
  const pattern = args[1] || 'src/**/*.{ts,js,tsx,jsx,py,dart,cs,rs}';

  // Parse options
  const options: EnrichmentOptions = {
    repoId,
    pattern,
    provider: 'gemini',
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (args[i + 1]) {
      if (arg === '--provider') {
        options.provider = args[++i] as any;
      } else if (arg === '--base-url') {
        options.baseUrl = args[++i];
      } else if (arg === '--api-key') {
        options.apiKey = args[++i];
      } else if (arg === '--model') {
        options.model = args[++i];
      }
    }
  }

  console.log('='.repeat(60));
  console.log('Code Enrichment Generator');
  console.log('='.repeat(60));
  console.log(`Repository ID: ${repoId}`);
  console.log(`File pattern: ${pattern}`);
  console.log(`Provider: ${options.provider}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Initialize database connection
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING;

  if (!connectionString) {
    console.error('\nError: DATABASE_URL or POSTGRES_CONNECTION_STRING environment variable is required');
    console.error('Example: DATABASE_URL=postgresql://user:pass@localhost:5432/repo npm run enrich:repo -- my-repo');
    process.exit(1);
  }

  console.log('\nTesting database connection...');
  const testResult = await testConnectionString(connectionString);

  if (!testResult.success) {
    console.error(`\nDatabase connection failed: ${testResult.message}`);
    process.exit(1);
  }

  console.log(`Database OK: ${testResult.message.split('\n')[0]}`);

  console.log('\nInitializing database pool...');
  await initPool(connectionString);

  // Configure enrichment LLM service
  enrichmentLLMService.configure({
    provider: options.provider || 'gemini',
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    model: options.model,
  });

  // Find files to process
  console.log(`\nFinding files matching: ${pattern}`);
  const files = await findFiles(pattern);
  console.log(`Found ${files.length} files`);

  if (files.length === 0) {
    console.log('No files to process');
    process.exit(0);
  }

  // Process each file
  let totalEnriched = 0;
  for (const file of files) {
    const count = await enrichFile(file, repoId, options);
    totalEnriched += count;
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${files.length}`);
  console.log(`Symbols enriched: ${totalEnriched}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no actual changes)' : 'LIVE'}`);
  console.log('='.repeat(60));

  // Show sample of stored enrichments
  if (!options.dryRun && totalEnriched > 0) {
    console.log('\nSample enrichments stored:');
    const enrichments = await enrichmentRepository.getAllForRepo(repoId);
    enrichments.slice(0, 5).forEach((e) => {
      console.log(`  ${e.symbol_name}: ${e.summary}`);
    });
    if (enrichments.length > 5) {
      console.log(`  ... and ${enrichments.length - 5} more`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
