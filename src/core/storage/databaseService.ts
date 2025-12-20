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

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_agent_timestamp ON agent_runs(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_timestamp ON debug_runs(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_repo_name ON debug_runs(repo_name)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_repo_files_repo_id ON repo_files(repo_id)`);

    await this.saveDatabase();
  }

  async deleteDebugRun(id: number): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`DELETE FROM debug_runs WHERE id = ?`);
    stmt.run([id]);
    stmt.free();

    await this.saveDatabase();
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

  private async saveDatabase(): Promise<void> {
    if (!this.db) return;

    const buffer = Buffer.from(this.db.export());
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, buffer);
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
