import { glob } from 'glob-gitignore';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../storage/databaseService.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import ignore from 'ignore';

/**
 * Indexes the repository files into the database.
 *
 * @param cwd The root directory of the repository to index.
 * @param databaseService The database service instance.
 * @returns The number of files indexed.
 */
export async function indexRepository(cwd: string, databaseService: DatabaseService): Promise<number> {
  try {
    const repoId = await getRepoId(cwd);

    // 1. Clear existing files for this repo
    await databaseService.clearRepoFiles(repoId);

    // 2. Prepare ignore patterns
    const gitignorePath = path.join(cwd, '.gitignore');
    const ignoreInstance = ignore();

    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      ignoreInstance.add(gitignoreContent);
    }

    // Add default ignore patterns (e.g. .git, node_modules)
    ignoreInstance.add(['.git', 'node_modules', '.DS_Store']);

    // 3. Find files using glob-gitignore
    // Note: glob-gitignore's `glob` function usually returns Promise<string[]>
    // We use the 'ignore' option which accepts an ignore instance or file path
    const files = await glob('**/*', {
      cwd: cwd,
      ignore: ignoreInstance,
      nodir: true,
      dot: true
    });

    // 4. Save to database
    if (files.length > 0) {
      // Split into chunks to avoid potential SQL limits if thousands of files
      const chunkSize = 500;
      for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        await databaseService.saveRepoFilesBatch(repoId, chunk);
      }
    }

    return files.length;
  } catch (error) {
    console.error('Failed to index repository:', error);
    throw error;
  }
}
