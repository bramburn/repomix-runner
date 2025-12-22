import { glob } from 'glob-gitignore';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../storage/databaseService.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { logger } from '../../shared/logger.js';
import ignore from 'ignore';

const DEFAULT_BINARY_PATTERNS = [
  '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.ico', '**/*.svg',
  '**/*.pdf',
  '**/*.zip', '**/*.tar', '**/*.gz', '**/*.7z', '**/*.rar',
  '**/*.exe', '**/*.dll', '**/*.so', '**/*.dylib', '**/*.bin',
  '**/*.class', '**/*.pyc', '**/*.o', '**/*.obj',
  '**/*.mp3', '**/*.mp4', '**/*.wav', '**/*.avi', '**/*.mov',
  '**/*.sqlite', '**/*.db',
  '**/*.ds_store', '**/*.DS_Store'
];

/**
 * Indexes the repository files into the database.
 *
 * @param cwd The root directory of the repository to index.
 * @param databaseService The database service instance.
 * @returns The number of files indexed.
 */
export async function indexRepository(cwd: string, databaseService: DatabaseService): Promise<number> {
  const startTime = Date.now();
  console.log(`[REPO_INDEXER] Starting repository indexing for: ${cwd}`);

  try {
    logger.both.info(`Starting repository indexing for: ${cwd}`);
    const repoId = await getRepoId(cwd);
    console.log(`[REPO_INDEXER] Generated repoId: ${repoId}`);

    // 1. Clear existing files for this repo
    console.log(`[REPO_INDEXER] Clearing existing files for repo...`);
    await databaseService.clearRepoFiles(repoId);
    console.log(`[REPO_INDEXER] Cleared existing files`);

    // 2. Prepare ignore patterns
    // We collect patterns into an array instead of passing an ignore instance
    // because glob-gitignore depends on an older version of 'ignore' (v5)
    // while this project uses 'ignore' (v7), causing compatibility issues.
    const ignorePatterns: string[] = [];

    // Add .gitignore patterns
    console.log(`[REPO_INDEXER] Loading .gitignore patterns...`);
    const gitignorePath = path.join(cwd, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      // Split by newlines and trim, remove empty lines and comments
      const lines = gitignoreContent.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
      ignorePatterns.push(...lines);
      console.log(`[REPO_INDEXER] Loaded ${lines.length} patterns from .gitignore`);
    } else {
      console.log(`[REPO_INDEXER] No .gitignore file found`);
    }

    // Add default ignore patterns (e.g. .git, node_modules)
    ignorePatterns.push('.git', 'node_modules', '.DS_Store');

    // Add binary exclusion patterns
    ignorePatterns.push(...DEFAULT_BINARY_PATTERNS);
    console.log(`[REPO_INDEXER] Total ignore patterns: ${ignorePatterns.length}`);

    // 3. Find files using glob-gitignore
    // Note: glob-gitignore's `ignore` option accepts `string[]`.
    console.log(`[REPO_INDEXER] Starting file glob search...`);
    const globStart = Date.now();
    const files = await glob('**/*', {
      cwd: cwd,
      ignore: ignorePatterns,
      nodir: true,
      dot: true,
      follow: false // Do not follow symlinks
    });
    const globDuration = Date.now() - globStart;
    console.log(`[REPO_INDEXER] Glob search completed in ${globDuration}ms, found ${files.length} files`);

    logger.both.info(`Found ${files.length} files to index.`);

    // 4. Sort files for determinism
    console.log(`[REPO_INDEXER] Sorting files for determinism...`);
    files.sort((a, b) => a.localeCompare(b));
    console.log(`[REPO_INDEXER] Files sorted`);

    // 5. Save to database
    if (files.length > 0) {
      console.log(`[REPO_INDEXER] Saving files to database in chunks...`);
      const dbStart = Date.now();
      // Split into chunks to avoid potential SQL limits if thousands of files
      const chunkSize = 500;
      let totalChunks = Math.ceil(files.length / chunkSize);

      for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        const chunkNum = Math.floor(i / chunkSize) + 1;
        console.log(`[REPO_INDEXER] Saving chunk ${chunkNum}/${totalChunks} (${chunk.length} files)`);
        await databaseService.saveRepoFilesBatch(repoId, chunk);
      }

      const dbDuration = Date.now() - dbStart;
      console.log(`[REPO_INDEXER] Database save completed in ${dbDuration}ms`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[REPO_INDEXER] Successfully indexed ${files.length} files in ${totalDuration}ms`);
    logger.both.info(`Successfully indexed ${files.length} files.`);
    return files.length;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[REPO_INDEXER] Failed to index repository after ${totalDuration}ms:`, error);
    logger.both.error('Failed to index repository:', error);
    throw error;
  }
}