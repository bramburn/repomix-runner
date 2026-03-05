import { queryWithRetry } from '../../chat/db/postgresClient.js';

export interface CodeEnrichment {
  id?: string;
  file_path: string;
  repo_id: string;
  symbol_name: string;
  symbol_type: 'function' | 'method' | 'class' | 'interface' | 'type';
  summary: string;
  signature: string;
  line_start: number;
  line_end: number;
  created_at?: Date;
  updated_at?: Date;
  git_commit?: string;
}

export class EnrichmentRepository {
  async upsert(
    enrichment: Omit<CodeEnrichment, 'id' | 'created_at' | 'updated_at'>
  ): Promise<void> {
    await queryWithRetry(
      `INSERT INTO code_enrichments (file_path, repo_id, symbol_name, symbol_type, summary, signature, line_start, line_end, git_commit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (file_path, symbol_name, repo_id)
       DO UPDATE SET summary = EXCLUDED.summary, signature = EXCLUDED.signature, updated_at = NOW()`,
      [
        enrichment.file_path,
        enrichment.repo_id,
        enrichment.symbol_name,
        enrichment.symbol_type,
        enrichment.summary,
        enrichment.signature,
        enrichment.line_start,
        enrichment.line_end,
        enrichment.git_commit,
      ]
    );
  }

  async getByFile(filePath: string, repoId: string): Promise<CodeEnrichment[]> {
    const result = await queryWithRetry<CodeEnrichment>(
      `SELECT * FROM code_enrichments WHERE file_path = $1 AND repo_id = $2 ORDER BY line_start`,
      [filePath, repoId]
    );
    return result.rows;
  }

  async getBySymbol(
    filePath: string,
    repoId: string,
    symbolName: string
  ): Promise<CodeEnrichment | null> {
    const result = await queryWithRetry<CodeEnrichment>(
      `SELECT * FROM code_enrichments WHERE file_path = $1 AND repo_id = $2 AND symbol_name = $3`,
      [filePath, repoId, symbolName]
    );
    return result.rows[0] || null;
  }

  async getAllForRepo(repoId: string): Promise<CodeEnrichment[]> {
    const result = await queryWithRetry<CodeEnrichment>(
      `SELECT * FROM code_enrichments WHERE repo_id = $1 ORDER BY file_path, line_start`,
      [repoId]
    );
    return result.rows;
  }

  async deleteByRepo(repoId: string): Promise<void> {
    await queryWithRetry(`DELETE FROM code_enrichments WHERE repo_id = $1`, [
      repoId,
    ]);
  }

  async deleteByFile(filePath: string, repoId: string): Promise<void> {
    await queryWithRetry(
      `DELETE FROM code_enrichments WHERE file_path = $1 AND repo_id = $2`,
      [filePath, repoId]
    );
  }
}

export const enrichmentRepository = new EnrichmentRepository();
