/**
 * checkFreshnessNode - Determines if architecture document needs regeneration.
 * 
 * Compares current git HEAD with stored commit hash and checks TTL.
 */
import * as path from 'path';
import { ArchitectureRepository } from '../../db/architectureRepository.js';
import { GitService } from '../../../git/GitService.js';
import type { ArchitectureState } from '../architectureState.js';

export async function checkFreshnessNode(
  state: typeof ArchitectureState.State
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] checkFreshnessNode: Checking if regeneration is needed...');

  try {
    const repoRoot = state.repoRoot;
    const repoId = state.repoId;

    // Get current git HEAD
    const gitService = new GitService();
    const currentGitHead = await gitService.getCurrentCommitSha(repoRoot);
    
    console.log(`[Architecture] checkFreshnessNode: Current git HEAD: ${currentGitHead || 'not a git repo'}`);

    // Load existing architecture from DB
    if (!state.pgPool) {
      console.warn('[Architecture] checkFreshnessNode: No database connection available, assuming not fresh');
      return {
        gitHead: currentGitHead ?? null,
        isFresh: false,
      };
    }
    const archRepo = new ArchitectureRepository(state.pgPool);
    const existingArch = await archRepo.getArchitectureByRepoId(repoId);

    if (!existingArch) {
      console.log('[Architecture] checkFreshnessNode: No existing architecture found - needs generation');
      return {
        gitHead: currentGitHead ?? null,
        isFresh: false,
      };
    }

    // Check if git commit has changed
    const gitChanged = existingArch.gitCommit !== currentGitHead;
    
    // Check if TTL has expired (default 24 hours)
    const now = Date.now();
    const expiresAt = existingArch.expiresAt;
    const ttlExpired = now > expiresAt;

    console.log(`[Architecture] checkFreshnessNode: Git changed: ${gitChanged}, TTL expired: ${ttlExpired}`);
    console.log(`[Architecture] checkFreshnessNode: Stored commit: ${existingArch.gitCommit}, Current: ${currentGitHead}`);
    console.log(`[Architecture] checkFreshnessNode: Expires at: ${new Date(expiresAt).toISOString()}`);

    // If either git changed OR TTL expired, needs regeneration
    const needsRefresh = gitChanged || ttlExpired;

    return {
      gitHead: currentGitHead ?? null,
      isFresh: !needsRefresh,
    };
  } catch (error) {
    console.error('[Architecture] checkFreshnessNode: Error checking freshness:', error);
    // On error, assume not fresh to trigger regeneration
    return {
      isFresh: false,
    };
  }
}
