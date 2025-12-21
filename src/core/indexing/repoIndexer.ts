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
  try {
    logger.both.info(`Starting repository indexing for: ${cwd}`);
    const repoId = await getRepoId(cwd);

    // 1. Clear existing files for this repo
    await databaseService.clearRepoFiles(repoId);

    // 2. Prepare ignore patterns
    // We collect patterns into an array instead of passing an ignore instance
    // because glob-gitignore depends on an older version of 'ignore' (v5)
    // while this project uses 'ignore' (v7), causing compatibility issues.
    const ignorePatterns: string[] = [];

    // Add .gitignore patterns
    const gitignorePath = path.join(cwd, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      // Split by newlines and trim, remove empty lines and comments
      const lines = gitignoreContent.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
      ignorePatterns.push(...lines);
    }

    // Add default ignore patterns (e.g. .git, node_modules)
    ignorePatterns.push('.git', 'node_modules', '.DS_Store');

    // Add binary exclusion patterns
    ignorePatterns.push(...DEFAULT_BINARY_PATTERNS);

    // 3. Find files using glob-gitignore
    // Note: glob-gitignore's `ignore` option accepts `string[]`.
    const files = await glob('**/*', {
      cwd: cwd,
      ignore: ignorePatterns,
      nodir: true,
      dot: true,
      follow: false // Do not follow symlinks
    });

    logger.both.info(`Found ${files.length} files to index.`);

    // 4. Sort files for determinism
    files.sort((a, b) => a.localeCompare(b));

    // 5. Save to database
    if (files.length > 0) {
      // Split into chunks to avoid potential SQL limits if thousands of files
      const chunkSize = 500;
      for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        await databaseService.saveRepoFilesBatch(repoId, chunk);
      }
    }

    logger.both.info(`Successfully indexed ${files.length} files.`);
    return files.length;
  } catch (error) {
    logger.both.error('Failed to index repository:', error);
    throw error;
  }
}