import { Pool } from 'pg';

/**
 * ArchitectureRepository - CRUD for repo_architecture table.
 * Implementation deferred to PRD 008: Repo Architecture Generator.
 */
export class ArchitectureRepository {
  constructor(private readonly pool: Pool) {}

  async upsertArchitecture(_data: {
    repoId: string;
    markdownTree: string;
    folderExplanations?: object | null;
    expiresAt: Date;
    gitCommit?: string | null;
    tokensUsed?: number | null;
  }): Promise<void> {
    throw new Error('ArchitectureRepository.upsertArchitecture is not implemented (PRD 008).');
  }

  async getArchitectureByRepoId(_repoId: string): Promise<{
    id: string;
    repoId: string;
    markdownTree: string;
    folderExplanations: object | null;
    generatedAt: number;
    expiresAt: number;
    gitCommit: string | null;
    tokensUsed: number | null;
  } | null> {
    throw new Error(
      'ArchitectureRepository.getArchitectureByRepoId is not implemented (PRD 008).'
    );
  }

  async deleteArchitectureByRepoId(_repoId: string): Promise<void> {
    throw new Error(
      'ArchitectureRepository.deleteArchitectureByRepoId is not implemented (PRD 008).'
    );
  }
}
