import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { glob } from 'glob';

/**
 * Critical files to track for hash validation.
 */
const CRITICAL_FILE_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'tsconfig.*.json',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'vite.config.js',
  'vite.config.ts',
  'prisma/schema.prisma',
  'drizzle.config.ts',
  'fly.toml',
  'docker-compose.yml',
  'docker-compose.yaml',
];

/**
 * Result of hash validation.
 */
export interface HashValidationResult {
  valid: boolean;
  changedFiles: string[];
  newFiles: string[];
  deletedFiles: string[];
}

/**
 * Validates blueprint freshness by comparing file hashes.
 * Layer 2 of the invalidation strategy.
 */
export class HashValidator {
  /**
   * Compute SHA256 hash of a file.
   */
  private computeHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute current hashes for all critical files in a repository.
   */
  async computeCurrentHashes(repoRoot: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};

    for (const pattern of CRITICAL_FILE_PATTERNS) {
      const matches = await glob(pattern, {
        cwd: repoRoot,
        ignore: ['**/node_modules/**'],
        nodir: true
      });

      for (const match of matches) {
        const fullPath = path.join(repoRoot, match);
        try {
          hashes[match] = this.computeHash(fullPath);
        } catch (error) {
          // File might not exist or be readable - skip it
          console.log(`[HashValidator] Could not hash ${match}: ${error}`);
        }
      }
    }

    return hashes;
  }

  /**
   * Validate stored hashes against current file state.
   * 
   * @param repoRoot - Repository root path
   * @param storedHashes - Previously stored file hashes
   * @returns Validation result with lists of changed/new/deleted files
   */
  async validate(
    repoRoot: string,
    storedHashes: Record<string, string>
  ): Promise<HashValidationResult> {
    const currentHashes = await this.computeCurrentHashes(repoRoot);

    const changedFiles: string[] = [];
    const newFiles: string[] = [];
    const deletedFiles: string[] = [];

    // Check for changed or deleted files
    for (const [filePath, storedHash] of Object.entries(storedHashes)) {
      const currentHash = currentHashes[filePath];
      
      if (!currentHash) {
        // File was deleted
        deletedFiles.push(filePath);
      } else if (currentHash !== storedHash) {
        // File was modified
        changedFiles.push(filePath);
      }
    }

    // Check for new files
    for (const filePath of Object.keys(currentHashes)) {
      if (!storedHashes[filePath]) {
        newFiles.push(filePath);
      }
    }

    const valid = changedFiles.length === 0 && deletedFiles.length === 0;
    // Note: We don't invalidate on new files - they're additive

    if (!valid) {
      console.log('[HashValidator] Validation failed:');
      if (changedFiles.length > 0) console.log(`  Changed: ${changedFiles.join(', ')}`);
      if (deletedFiles.length > 0) console.log(`  Deleted: ${deletedFiles.join(', ')}`);
    }

    return {
      valid,
      changedFiles,
      newFiles,
      deletedFiles
    };
  }

  /**
   * Quick check if any critical file has changed.
   * More efficient than full validation when you just need a boolean.
   */
  async hasAnyChange(
    repoRoot: string,
    storedHashes: Record<string, string>
  ): Promise<boolean> {
    for (const [filePath, storedHash] of Object.entries(storedHashes)) {
      const fullPath = path.join(repoRoot, filePath);
      
      try {
        const currentHash = this.computeHash(fullPath);
        if (currentHash !== storedHash) {
          return true;
        }
      } catch {
        // File doesn't exist anymore
        return true;
      }
    }

    return false;
  }
}
