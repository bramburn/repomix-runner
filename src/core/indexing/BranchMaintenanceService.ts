import { DatabaseService } from '../storage/databaseService.js';
import type { VectorDbAdapter } from './vectorDb/types.js';
import { GitService } from '../../git/GitService.js';
import { logger } from '../../shared/logger.js';

export class BranchMaintenanceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gitService: GitService
  ) {}

  async cleanupStaleBranches(repoId: string, repoRoot: string, adapter: VectorDbAdapter): Promise<void> {
    const trackedBranches = await this.databaseService.getTrackedBranches(repoId);
    if (trackedBranches.length === 0) return;

    const gitBranches = await this.gitService.getAllBranches(repoRoot);
    const gitSet = new Set(gitBranches);
    const staleBranches = trackedBranches.filter((branch) => !gitSet.has(branch));

    if (staleBranches.length === 0) return;

    for (const branchName of staleBranches) {
      try {
        if (adapter.deleteVectorsForBranch) {
          await adapter.deleteVectorsForBranch({ repoId, branchName });
        }
        await this.databaseService.clearBranchData(repoId, branchName);
      } catch (error) {
        logger.both.error(`[BranchMaintenanceService] Failed cleaning stale branch "${branchName}"`, error);
      }
    }
  }
}
