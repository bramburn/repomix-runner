import initSqlJs, { Database } from 'sql.js';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentRunHistory {
  id: string;
  timestamp: number;
  query: string;
  files: string[];
  fileCount: number;
  outputPath?: string;
  success: boolean;
  error?: string;
  duration?: number;
  bundleId?: string;
  queryId?: string;
}

export interface DebugRun {
  id: number;
  timestamp: number;
  files: string[];
  repoName?: string;
}

export class DatabaseService {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any;
  private isInitialized = false;

  constructor(context: vscode.ExtensionContext) {
    this.dbPath = path.join(
      context.globalStorageUri.fsPath,
      'repomix-agent-history.sqlite'
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.SQL = await initSqlJs({
      locateFile: (file: string) => {
        const candidates = [
          path.join(__dirname, file),
          path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
          path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
          path.join(path.dirname(__dirname), 'node_modules', 'sql.js', 'dist', file),
        ];
        return candidates.find(fs.existsSync) ?? path.join(__dirname, file);
      }
    });

    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.dirname(this.dbPath))
    );

    if (fs.existsSync(this.dbPath)) {
      try {
        this.db = new this.SQL.Database(fs.readFileSync(this.dbPath));
      } catch {
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
    }

    await this.createTables();
    this.isInitialized = true;
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        query TEXT NOT NULL,
        files TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        output_path TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        duration INTEGER,
        bundle_id TEXT,
        query_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS debug_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        files TEXT NOT NULL,
        repo_name TEXT
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_indexing_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_id, file_path)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_agent_timestamp ON agent_runs(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_timestamp ON debug_runs(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_repo_name ON debug_runs(repo_name)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_repo_files_repo_id ON repo_files(repo_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_repo_indexing_progress_repo_id ON repo_indexing_progress(repo_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_repo_indexing_progress_status ON repo_indexing_progress(status)`);

    // Run migrations for existing databases
    await this.runMigrations();

    await this.saveDatabase();
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) return;

    try {
      // Check if repo_name column exists in debug_runs table
      const stmt = this.db.prepare(`PRAGMA table_info(debug_runs)`);
      const columns: any[] = [];
      while (stmt.step()) {
        columns.push(stmt.getAsObject());
      }
      stmt.free();

      const hasRepoNameColumn = columns.some((col: any) => col.name === 'repo_name');

      // If repo_name column doesn't exist, add it
      if (!hasRepoNameColumn) {
        this.db.run(`ALTER TABLE debug_runs ADD COLUMN repo_name TEXT`);
      }
    } catch (error) {
      // Migration errors are non-fatal - the table might not exist yet
      console.debug('Migration check completed:', error);
    }
  }

  async saveDebugRun(files: string[], repoName?: string): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO debug_runs (timestamp, files, repo_name)
      VALUES (?, ?, ?)
    `);

    const filesJson = JSON.stringify(files);
    stmt.run([Date.now(), filesJson, repoName || null]);
    stmt.free();

    await this.saveDatabase();

    // Return the last inserted ID
    const lastIdStmt = this.db.prepare(`SELECT last_insert_rowid() as id`);
    lastIdStmt.step();
    const result = lastIdStmt.getAsObject();
    lastIdStmt.free();

    return (result.id as number) || 0;
  }

  async getDebugRuns(repoName?: string): Promise<DebugRun[]> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const runs: DebugRun[] = [];

    try {
      let query = `SELECT id, timestamp, files, repo_name FROM debug_runs`;
      const params: any[] = [];

      if (repoName) {
        query += ` WHERE repo_name = ?`;
        params.push(repoName);
      }

      query += ` ORDER BY timestamp DESC LIMIT 50`;

      const stmt = this.db.prepare(query);
      if (params.length > 0) {
        stmt.bind(params);
      }

      while (stmt.step()) {
        const row = stmt.getAsObject();
        runs.push({
          id: row.id as number,
          timestamp: row.timestamp as number,
          files: JSON.parse(row.files as string),
          repoName: row.repo_name as string | undefined,
        });
      }

      stmt.free();
    } catch (error) {
      console.error('Error fetching debug runs:', error);
      // Return empty array on error instead of throwing
      return [];
    }

    return runs;
  }

  async deleteDebugRun(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`DELETE FROM debug_runs WHERE id = ?`);
    stmt.run([id]);
    stmt.free();

    await this.saveDatabase();
  }

  async saveAgentRun(run: AgentRunHistory): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO agent_runs (id, timestamp, query, files, file_count, output_path, success, error, duration, bundle_id, query_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const filesJson = JSON.stringify(run.files);
    stmt.run([
      run.id,
      run.timestamp,
      run.query,
      filesJson,
      run.fileCount,
      run.outputPath || null,
      run.success ? 1 : 0,
      run.error || null,
      run.duration || null,
      run.bundleId || null,
      run.queryId || null,
    ]);
    stmt.free();

    await this.saveDatabase();
  }

  async getAgentRunById(id: string): Promise<AgentRunHistory | null> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, timestamp, query, files, file_count, output_path, success, error, duration, bundle_id, query_id
      FROM agent_runs WHERE id = ?
    `);

    stmt.bind([id]);
    let run: AgentRunHistory | null = null;

    if (stmt.step()) {
      const row = stmt.getAsObject();
      run = {
        id: row.id as string,
        timestamp: row.timestamp as number,
        query: row.query as string,
        files: JSON.parse(row.files as string),
        fileCount: row.file_count as number,
        outputPath: row.output_path as string | undefined,
        success: (row.success as number) === 1,
        error: row.error as string | undefined,
        duration: row.duration as number | undefined,
        bundleId: row.bundle_id as string | undefined,
        queryId: row.query_id as string | undefined,
      };
    }

    stmt.free();
    return run;
  }

  async getAgentRunHistory(limit: number = 50): Promise<AgentRunHistory[]> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const runs: AgentRunHistory[] = [];

    try {
      const stmt = this.db.prepare(`
        SELECT id, timestamp, query, files, file_count, output_path, success, error, duration, bundle_id, query_id
        FROM agent_runs
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      stmt.bind([limit]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        runs.push({
          id: row.id as string,
          timestamp: row.timestamp as number,
          query: row.query as string,
          files: JSON.parse(row.files as string),
          fileCount: row.file_count as number,
          outputPath: row.output_path as string | undefined,
          success: (row.success as number) === 1,
          error: row.error as string | undefined,
          duration: row.duration as number | undefined,
          bundleId: row.bundle_id as string | undefined,
          queryId: row.query_id as string | undefined,
        });
      }

      stmt.free();
    } catch (error) {
      console.error('Error fetching agent run history:', error);
      return [];
    }

    return runs;
  }

  async saveRepoFilesBatch(repoId: string, filePaths: string[]): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('BEGIN TRANSACTION');

      const stmt = this.db.prepare(`
        INSERT INTO repo_files (repo_id, file_path)
        VALUES (?, ?)
      `);

      for (const filePath of filePaths) {
        stmt.run([repoId, filePath]);
      }

      stmt.free();
      this.db.run('COMMIT');
      await this.saveDatabase();
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  async clearRepoFiles(repoId: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM repo_files WHERE repo_id = ?
    `);

    stmt.run([repoId]);
    stmt.free();

    await this.saveDatabase();
  }

  async getRepoFileCount(repoId: string): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM repo_files WHERE repo_id = ?
    `);

    stmt.bind([repoId]);
    let count = 0;
    if (stmt.step()) {
      count = stmt.getAsObject().count as number;
    }
    stmt.free();

    return count;
  }

  async getRepoFiles(repoId: string): Promise<string[]> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT file_path FROM repo_files WHERE repo_id = ? ORDER BY file_path
    `);

    stmt.bind([repoId]);
    const files: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      files.push(row.file_path as string);
    }
    stmt.free();

    return files;
  }

  private async saveDatabase(): Promise<void> {
    if (!this.db) return;

    const buffer = Buffer.from(this.db.export());
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ========== Indexing Progress Tracking Methods ==========

  /**
   * Initialize indexing progress for a repository by marking all files as pending.
   * Clears any existing progress for the repo.
   */
  async initializeIndexingProgress(repoId: string, filePaths: string[]): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('BEGIN TRANSACTION');

      // Clear existing progress for this repo
      const deleteStmt = this.db.prepare(`
        DELETE FROM repo_indexing_progress WHERE repo_id = ?
      `);
      deleteStmt.run([repoId]);
      deleteStmt.free();

      // Insert all files as pending
      const insertStmt = this.db.prepare(`
        INSERT INTO repo_indexing_progress (repo_id, file_path, status)
        VALUES (?, ?, 'pending')
      `);

      for (const filePath of filePaths) {
        insertStmt.run([repoId, filePath]);
      }
      insertStmt.free();

      this.db.run('COMMIT');
      await this.saveDatabase();
    } catch (err) {
      this.db?.run('ROLLBACK');
      throw err;
    }
  }

  /**
   * Mark a file as currently being processed.
   */
  async markFileProcessing(repoId: string, filePath: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE repo_indexing_progress
      SET status = 'processing', started_at = ?
      WHERE repo_id = ? AND file_path = ?
    `);

    stmt.run([Date.now(), repoId, filePath]);
    stmt.free();

    await this.saveDatabase();
  }

  /**
   * Mark a file as successfully completed.
   */
  async markFileCompleted(repoId: string, filePath: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE repo_indexing_progress
      SET status = 'completed', completed_at = ?
      WHERE repo_id = ? AND file_path = ?
    `);

    stmt.run([Date.now(), repoId, filePath]);
    stmt.free();

    await this.saveDatabase();
  }

  /**
   * Mark a file as failed with an error message.
   */
  async markFileFailed(repoId: string, filePath: string, error: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE repo_indexing_progress
      SET status = 'failed', completed_at = ?, error_message = ?
      WHERE repo_id = ? AND file_path = ?
    `);

    stmt.run([Date.now(), error, repoId, filePath]);
    stmt.free();

    await this.saveDatabase();
  }

  /**
   * Get all files that are pending or processing (not yet completed).
   */
  async getPendingFiles(repoId: string): Promise<string[]> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT file_path FROM repo_indexing_progress
      WHERE repo_id = ? AND status IN ('pending', 'processing')
      ORDER BY file_path
    `);

    stmt.bind([repoId]);
    const files: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      files.push(row.file_path as string);
    }
    stmt.free();

    return files;
  }

  /**
   * Get the count of successfully completed files.
   */
  async getCompletedFilesCount(repoId: string): Promise<number> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM repo_indexing_progress
      WHERE repo_id = ? AND status = 'completed'
    `);

    stmt.bind([repoId]);
    let count = 0;
    if (stmt.step()) {
      count = stmt.getAsObject().count as number;
    }
    stmt.free();

    return count;
  }

  /**
   * Get the indexing status summary for a repository.
   */
  async getIndexingStatus(repoId: string): Promise<{ pending: number; completed: number; failed: number }> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' OR status = 'processing' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM repo_indexing_progress
      WHERE repo_id = ?
    `);

    stmt.bind([repoId]);
    let result = { pending: 0, completed: 0, failed: 0 };
    if (stmt.step()) {
      const row = stmt.getAsObject();
      result = {
        pending: (row.pending as number) || 0,
        completed: (row.completed as number) || 0,
        failed: (row.failed as number) || 0,
      };
    }
    stmt.free();

    return result;
  }

  /**
   * Clear indexing progress for a repository (after completion or when starting fresh).
   */
  async clearIndexingProgress(repoId: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM repo_indexing_progress WHERE repo_id = ?
    `);

    stmt.run([repoId]);
    stmt.free();

    await this.saveDatabase();
  }

  dispose(): void {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}
