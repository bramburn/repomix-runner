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
  duration?: number; // Time in milliseconds
  bundleId?: string; // If run was for a specific bundle
  queryId?: string; // Reference to saved query if applicable
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
  private isInitialized: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    // Use globalStorageUri for cross-workspace persistence
    this.dbPath = path.join(
      context.globalStorageUri.fsPath,
      'repomix-agent-history.sqlite'
    );
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load sql.js
      this.SQL = await initSqlJs({
        // Try multiple locations for the wasm file
        locateFile: (file: string) => {
          const possiblePaths = [
            // In the dist directory (copied by esbuild)
            path.join(__dirname, file),
            // In node_modules (development)
            path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
            // In global node_modules (some environments)
            path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
            // In extension directory
            path.join(path.dirname(__dirname), 'node_modules', 'sql.js', 'dist', file)
          ];

          for (const wasmPath of possiblePaths) {
            if (fs.existsSync(wasmPath)) {
              return wasmPath;
            }
          }

          // Fallback - this will likely fail but gives a clear error
          return path.join(__dirname, file);
        }
      });

      // Ensure storage directory exists
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(this.dbPath))
      );

      // Load existing database or create new one
      if (fs.existsSync(this.dbPath)) {
        try {
          const buffer = fs.readFileSync(this.dbPath);
          this.db = new this.SQL.Database(buffer);
          console.log('Loaded existing database from:', this.dbPath);
          // Ensure tables exist even if loading an existing DB
          await this.createTables();
        } catch (error) {
          console.warn('Failed to load existing database, creating new one:', error);
          this.db = new this.SQL.Database();
          await this.createTables();
        }
      } else {
        this.db = new this.SQL.Database();
        await this.createTables();
        console.log('Created new database at:', this.dbPath);
      }

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      // Create agent_runs table
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

      // Create debug_runs table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS debug_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          files TEXT NOT NULL
        )
      `);

    // Migrate: Add repo_name column if not exists
      try {
        this.db.run("ALTER TABLE debug_runs ADD COLUMN repo_name TEXT");
        // Backfill existing NULLs with default
        this.db.run("UPDATE debug_runs SET repo_name = 'bramburn/audio-lesson' WHERE repo_name IS NULL");
      } catch (e) {
        // Column likely exists, ignore
      }

      // Create repo_files table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS repo_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON agent_runs(timestamp)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_success ON agent_runs(success)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_bundle_id ON agent_runs(bundle_id)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_query_id ON agent_runs(query_id)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_timestamp ON debug_runs(timestamp)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_debug_repo_name ON debug_runs(repo_name)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_repo_id ON repo_files(repo_id)`);

      await this.saveDatabase();
    } catch (error) {
      console.error('Failed to create tables:', error);
      throw error;
    }
  }

  async saveAgentRun(run: AgentRunHistory): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_runs
        (id, timestamp, query, files, file_count, output_path, success, error, duration, bundle_id, query_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        run.id,
        run.timestamp,
        run.query,
        JSON.stringify(run.files),
        run.fileCount,
        run.outputPath || null,
        run.success ? 1 : 0,
        run.error || null,
        run.duration || null,
        run.bundleId || null,
        run.queryId || null
      ]);

      stmt.free();
      await this.saveDatabase();
      console.log('Agent run saved to database:', run.id);
    } catch (error) {
      console.error('Failed to save agent run:', error);
      throw new Error(`Failed to save agent run: ${error}`);
    }
  }

  async getAgentRunHistory(limit: number = 50, offset: number = 0): Promise<AgentRunHistory[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM agent_runs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const result: AgentRunHistory[] = [];
      stmt.bind([limit, offset]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        result.push({
          id: row.id as string,
          timestamp: row.timestamp as number,
          query: row.query as string,
          files: JSON.parse(row.files as string),
          fileCount: row.file_count as number,
          outputPath: row.output_path as string || undefined,
          success: (row.success as number) === 1,
          error: row.error as string || undefined,
          duration: row.duration as number || undefined,
          bundleId: row.bundle_id as string || undefined,
          queryId: row.query_id as string || undefined
        });
      }

      stmt.free();
      return result;
    } catch (error) {
      console.error('Failed to get agent run history:', error);
      throw new Error(`Failed to get agent run history: ${error}`);
    }
  }

  async getAgentRunById(id: string): Promise<AgentRunHistory | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM agent_runs WHERE id = ?
      `);

      stmt.bind([id]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          id: row.id as string,
          timestamp: row.timestamp as number,
          query: row.query as string,
          files: JSON.parse(row.files as string),
          fileCount: row.file_count as number,
          outputPath: row.output_path as string || undefined,
          success: (row.success as number) === 1,
          error: row.error as string || undefined,
          duration: row.duration as number || undefined,
          bundleId: row.bundle_id as string || undefined,
          queryId: row.query_id as string || undefined
        };
      }

      stmt.free();
      return null;
    } catch (error) {
      console.error('Failed to get agent run by ID:', error);
      throw new Error(`Failed to get agent run by ID: ${error}`);
    }
  }

  async deleteAgentRun(id: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM agent_runs WHERE id = ?
      `);

      stmt.bind([id]);
      stmt.step();
      stmt.free();

      await this.saveDatabase();
      console.log('Agent run deleted from database:', id);
    } catch (error) {
      console.error('Failed to delete agent run:', error);
      throw new Error(`Failed to delete agent run: ${error}`);
    }
  }

  async clearAgentRunHistory(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.run(`
        DELETE FROM agent_runs
      `);

      await this.saveDatabase();
      console.log('Agent run history cleared from database');
    } catch (error) {
      console.error('Failed to clear agent run history:', error);
      throw new Error(`Failed to clear agent run history: ${error}`);
    }
  }

  async getAgentRunStats(): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalFilesProcessed: number;
    averageRunTime?: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total_runs,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_runs,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_runs,
          SUM(file_count) as total_files,
          AVG(duration) as avg_duration
        FROM agent_runs
      `);

      let stats = {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        totalFilesProcessed: 0,
        averageRunTime: undefined as number | undefined
      };

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stats = {
          totalRuns: (row.total_runs as number) || 0,
          successfulRuns: (row.successful_runs as number) || 0,
          failedRuns: (row.failed_runs as number) || 0,
          totalFilesProcessed: (row.total_files as number) || 0,
          averageRunTime: (row.avg_duration as number) || undefined
        };
      }

      stmt.free();
      return stats;
    } catch (error) {
      console.error('Failed to get agent run stats:', error);
      throw new Error(`Failed to get agent run stats: ${error}`);
    }
  }

  async saveDebugRun(files: string[], repoName: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const filesJson = JSON.stringify(files);

      // Check if the most recent run has the same files AND same repo
      const checkStmt = this.db.prepare(`
        SELECT id, files, repo_name FROM debug_runs
        WHERE repo_name = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      checkStmt.bind([repoName]);

      let lastRunId: number | undefined;
      let lastRunFiles: string | undefined;

      if (checkStmt.step()) {
        const row = checkStmt.getAsObject();
        lastRunId = row.id as number;
        lastRunFiles = row.files as string;
      }
      checkStmt.free();

      if (lastRunId !== undefined && lastRunFiles === filesJson) {
        // Update timestamp of the existing run
        const updateStmt = this.db.prepare(`
          UPDATE debug_runs
          SET timestamp = ?
          WHERE id = ?
        `);
        updateStmt.run([Date.now(), lastRunId]);
        updateStmt.free();
        console.log('Updated existing debug run timestamp');
      } else {
        const stmt = this.db.prepare(`
          INSERT INTO debug_runs (timestamp, files, repo_name)
          VALUES (?, ?, ?)
        `);

        stmt.run([Date.now(), filesJson, repoName]);
        stmt.free();
        console.log('Debug run saved to database');
      }

      await this.saveDatabase();
    } catch (error) {
      console.error('Failed to save debug run:', error);
      throw new Error(`Failed to save debug run: ${error}`);
    }
  }

  async getDebugRuns(repoName: string, limit: number = 50, offset: number = 0): Promise<DebugRun[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM debug_runs
        WHERE repo_name = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const result: DebugRun[] = [];
      stmt.bind([repoName, limit, offset]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        result.push({
          id: row.id as number,
          timestamp: row.timestamp as number,
          files: JSON.parse(row.files as string),
          repoName: row.repo_name as string
        });
      }

      stmt.free();
      return result;
    } catch (error) {
      console.error('Failed to get debug runs:', error);
      throw new Error(`Failed to get debug runs: ${error}`);
    }
  }

  async deleteDebugRun(id: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM debug_runs WHERE id = ?
      `);

      stmt.run([id]);
      stmt.free();
      await this.saveDatabase();
    } catch (error) {
      console.error('Failed to delete debug run:', error);
      throw new Error(`Failed to delete debug run: ${error}`);
    }
  }

  async saveRepoFilesBatch(repoId: string, filePaths: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Start transaction
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
      console.log(`Saved ${filePaths.length} files for repo: ${repoId}`);
    } catch (error) {
      this.db.run('ROLLBACK');
      console.error('Failed to save repo files batch:', error);
      throw new Error(`Failed to save repo files batch: ${error}`);
    }
  }

  async clearRepoFiles(repoId: string): Promise<void> {
>>>>>>> ddb3262 (Add repository indexing feature with glob-gitignore and Search tab)
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
<<<<<<< HEAD
        DELETE FROM debug_runs WHERE id = ?
      `);

      stmt.bind([id]);
      stmt.step();
      stmt.free();

      await this.saveDatabase();
      console.log('Debug run deleted from database:', id);
    } catch (error) {
      console.error('Failed to delete debug run:', error);
      throw new Error(`Failed to delete debug run: ${error}`);
=======
        DELETE FROM repo_files WHERE repo_id = ?
      `);

      stmt.run([repoId]);
      stmt.free();

      await this.saveDatabase();
      console.log(`Cleared files for repo: ${repoId}`);
    } catch (error) {
      console.error('Failed to clear repo files:', error);
      throw new Error(`Failed to clear repo files: ${error}`);
    }
  }

  async getRepoFileCount(repoId: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM repo_files WHERE repo_id = ?
      `);

      stmt.bind([repoId]);
      let count = 0;
      if (stmt.step()) {
        const row = stmt.getAsObject();
        count = row.count as number;
      }

      stmt.free();
      return count;
    } catch (error) {
      console.error('Failed to get repo file count:', error);
      throw new Error(`Failed to get repo file count: ${error}`);
>>>>>>> ddb3262 (Add repository indexing feature with glob-gitignore and Search tab)
    }
  }

  private async saveDatabase(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);

      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Failed to save database:', error);
      throw new Error(`Failed to save database: ${error}`);
    }
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