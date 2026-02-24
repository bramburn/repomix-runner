import { Pool } from 'pg';

interface ArchitectureRow {
  id: string;
  repo_id: string;
  markdown_tree: string;
  folder_explanations: object | null;
  generated_at: Date;
  expires_at: Date;
  git_commit: string | null;
  tokens_used: number | null;
}

function assertNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

/**
 * ArchitectureRepository - CRUD for repo_architecture table.
 * Stores generated repository architecture documentation for LLM context.
 */
export class ArchitectureRepository {
  constructor(private readonly pool: Pool) {}

  async upsertArchitecture(data: {
    repoId: string;
    markdownTree: string;
    folderExplanations?: object | null;
    expiresAt: Date;
    gitCommit?: string | null;
    tokensUsed?: number | null;
  }): Promise<void> {
    const normalizedRepoId = assertNonEmpty(data.repoId, 'repoId');
    const normalizedMarkdownTree = assertNonEmpty(data.markdownTree, 'markdownTree');

    await this.pool.query(
      `INSERT INTO repo_architecture (
        repo_id, markdown_tree, folder_explanations, expires_at, git_commit, tokens_used
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (repo_id) DO UPDATE SET
        markdown_tree = EXCLUDED.markdown_tree,
        folder_explanations = EXCLUDED.folder_explanations,
        generated_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        git_commit = EXCLUDED.git_commit,
        tokens_used = EXCLUDED.tokens_used`,
      [
        normalizedRepoId,
        normalizedMarkdownTree,
        data.folderExplanations ?? null,
        data.expiresAt,
        data.gitCommit ?? null,
        data.tokensUsed ?? null,
      ]
    );
  }

  async getArchitectureByRepoId(repoId: string): Promise<{
    id: string;
    repoId: string;
    markdownTree: string;
    folderExplanations: object | null;
    generatedAt: number;
    expiresAt: number;
    gitCommit: string | null;
    tokensUsed: number | null;
  } | null> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');

    const result = await this.pool.query<ArchitectureRow>(
      `SELECT * FROM repo_architecture WHERE repo_id = $1`,
      [normalizedRepoId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      repoId: row.repo_id,
      markdownTree: row.markdown_tree,
      folderExplanations: row.folder_explanations,
      generatedAt: new Date(row.generated_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
      gitCommit: row.git_commit,
      tokensUsed: row.tokens_used,
    };
  }

  async deleteArchitectureByRepoId(repoId: string): Promise<void> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');

    await this.pool.query(
      `DELETE FROM repo_architecture WHERE repo_id = $1`,
      [normalizedRepoId]
    );
  }

  /**
   * Checks if the architecture document for a repository has expired.
   * Returns true if no architecture exists or if it's past its expiration time.
   */
  async isExpired(repoId: string): Promise<boolean> {
    const normalizedRepoId = assertNonEmpty(repoId, 'repoId');

    const result = await this.pool.query<ArchitectureRow>(
      `SELECT * FROM repo_architecture 
       WHERE repo_id = $1 AND expires_at <= NOW()`,
      [normalizedRepoId]
    );

    // If no rows returned, either no architecture exists (considered expired)
    // or the only architecture is still valid (not expired)
    if (result.rows.length === 0) {
      // Check if any architecture exists at all
      const checkResult = await this.pool.query(
        `SELECT 1 FROM repo_architecture WHERE repo_id = $1 LIMIT 1`,
        [normalizedRepoId]
      );
      // Expired if no architecture exists
      return checkResult.rows.length === 0;
    }

    // Architecture exists and is expired
    return true;
  }
}
