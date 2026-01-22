import { execSync } from 'child_process';

/**
 * Critical path patterns to watch for git changes.
 * Changes to these paths will invalidate the blueprint.
 */
const CRITICAL_PATH_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'tsconfig.*.json',
  'next.config.*',
  'vite.config.*',
  'prisma/',
  'drizzle.config.*',
  'fly.toml',
  'docker-compose.*',
  'Dockerfile',
  'src/',
  'app/',
  'pages/',
  'components/',
  'lib/',
  'api/',
];

/**
 * Result of git diff validation.
 */
export interface GitValidationResult {
  valid: boolean;
  changedFiles: string[];
  commitsBehind: number;
  currentCommit: string | null;
}

/**
 * Validates blueprint freshness by checking git commits.
 * Layer 3 of the invalidation strategy.
 */
export class GitDiffValidator {
  /**
   * Check if a directory is a git repository.
   */
  isGitRepo(repoRoot: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current HEAD commit SHA.
   */
  getCurrentCommit(repoRoot: string): string | null {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Get list of files changed between two commits.
   */
  private getChangedFiles(repoRoot: string, fromCommit: string, toCommit: string = 'HEAD'): string[] {
    try {
      const output = execSync(`git diff --name-only ${fromCommit} ${toCommit}`, {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return output.trim().split('\n').filter(line => line.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Count commits between two refs.
   */
  private countCommitsBetween(repoRoot: string, fromCommit: string, toCommit: string = 'HEAD'): number {
    try {
      const output = execSync(`git rev-list --count ${fromCommit}..${toCommit}`, {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a file path matches any critical pattern.
   */
  private isCriticalPath(filePath: string): boolean {
    const normalizedPath = filePath.toLowerCase();
    
    for (const pattern of CRITICAL_PATH_PATTERNS) {
      // Simple glob-like matching
      if (pattern.endsWith('/')) {
        // Directory pattern
        if (normalizedPath.startsWith(pattern.slice(0, -1))) {
          return true;
        }
      } else if (pattern.includes('*')) {
        // Wildcard pattern
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (regex.test(normalizedPath)) {
          return true;
        }
      } else {
        // Exact match or starts with
        if (normalizedPath === pattern || normalizedPath.startsWith(pattern + '/')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate that no critical files have changed since the stored commit.
   * 
   * @param repoRoot - Repository root path
   * @param storedCommit - The commit SHA when blueprint was generated
   * @returns Validation result
   */
  async validate(repoRoot: string, storedCommit: string): Promise<GitValidationResult> {
    // Check if this is a git repo
    if (!this.isGitRepo(repoRoot)) {
      console.log('[GitDiffValidator] Not a git repository, skipping validation');
      return {
        valid: true,
        changedFiles: [],
        commitsBehind: 0,
        currentCommit: null
      };
    }

    const currentCommit = this.getCurrentCommit(repoRoot);
    
    // If we can't get current commit, assume valid (can't validate)
    if (!currentCommit) {
      return {
        valid: true,
        changedFiles: [],
        commitsBehind: 0,
        currentCommit: null
      };
    }

    // If same commit, no changes
    if (currentCommit === storedCommit) {
      return {
        valid: true,
        changedFiles: [],
        commitsBehind: 0,
        currentCommit
      };
    }

    // Get all changed files
    const allChangedFiles = this.getChangedFiles(repoRoot, storedCommit, currentCommit);
    const commitsBehind = this.countCommitsBetween(repoRoot, storedCommit, currentCommit);

    // Filter to critical files only
    const criticalChangedFiles = allChangedFiles.filter(f => this.isCriticalPath(f));

    const valid = criticalChangedFiles.length === 0;

    if (!valid) {
      console.log('[GitDiffValidator] Validation failed:');
      console.log(`  Commits behind: ${commitsBehind}`);
      console.log(`  Critical files changed: ${criticalChangedFiles.join(', ')}`);
    }

    return {
      valid,
      changedFiles: criticalChangedFiles,
      commitsBehind,
      currentCommit
    };
  }

  /**
   * Quick check if there are any commits since the stored commit.
   */
  hasNewCommits(repoRoot: string, storedCommit: string): boolean {
    const currentCommit = this.getCurrentCommit(repoRoot);
    return currentCommit !== null && currentCommit !== storedCommit;
  }
}
