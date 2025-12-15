import * as vscode from 'vscode';
import Database from 'better-sqlite3';
import * as path from 'path';

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

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  timestamp: number;
  lastUsed: number;
  runCount: number;
}

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(context: vscode.ExtensionContext) {
    // Use globalStorageUri for cross-workspace persistence
    this.dbPath = path.join(
      context.globalStorageUri.fsPath,
      'repomix-agent-history.sqlite'
    );
  }

  async initialize(): Promise<void> {
    try {
      // Ensure storage directory exists
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(this.dbPath))
      );

      this.db = new Database(this.dbPath);

      // Create the agent_runs table if it doesn't exist
      this.db.exec(`
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_timestamp ON agent_runs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_success ON agent_runs(success);
        CREATE INDEX IF NOT EXISTS idx_bundle_id ON agent_runs(bundle_id);
        CREATE INDEX IF NOT EXISTS idx_query_id ON agent_runs(query_id);
      `);

      // Create saved queries table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS saved_queries (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          query TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          last_used INTEGER NOT NULL,
          run_count INTEGER NOT NULL DEFAULT 1
        )
      `);

      // Add index for faster lookups
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_queries_last_used ON saved_queries(last_used DESC)
      `);

      console.log('Database initialized successfully at:', this.dbPath);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  async saveAgentRun(run: AgentRunHistory): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_runs
        (id, timestamp, query, files, file_count, output_path, success, error, duration, bundle_id, query_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
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
      );

      console.log('Agent run saved to database:', run.id);
    } catch (error) {
      console.error('Failed to save agent run:', error);
      throw new Error(`Failed to save agent run: ${error}`);
    }
  }

  async getAgentRunHistory(limit: number = 50, offset: number = 0): Promise<AgentRunHistory[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM agent_runs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(limit, offset) as any[];

      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        query: row.query,
        files: JSON.parse(row.files),
        fileCount: row.file_count,
        outputPath: row.output_path,
        success: row.success === 1,
        error: row.error,
        duration: row.duration,
        bundleId: row.bundle_id,
        queryId: row.query_id
      }));
    } catch (error) {
      console.error('Failed to get agent run history:', error);
      throw new Error(`Failed to get agent run history: ${error}`);
    }
  }

  async getAgentRunById(id: string): Promise<AgentRunHistory | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM agent_runs WHERE id = ?
      `);

      const row = stmt.get(id) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        timestamp: row.timestamp,
        query: row.query,
        files: JSON.parse(row.files),
        fileCount: row.file_count,
        outputPath: row.output_path,
        success: row.success === 1,
        error: row.error,
        duration: row.duration,
        bundleId: row.bundle_id
      };
    } catch (error) {
      console.error('Failed to get agent run by ID:', error);
      throw new Error(`Failed to get agent run by ID: ${error}`);
    }
  }

  async deleteAgentRun(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM agent_runs WHERE id = ?
      `);

      const result = stmt.run(id);

      if (result.changes === 0) {
        throw new Error(`Agent run with ID ${id} not found`);
      }

      console.log('Agent run deleted from database:', id);
    } catch (error) {
      console.error('Failed to delete agent run:', error);
      throw new Error(`Failed to delete agent run: ${error}`);
    }
  }

  async clearAgentRunHistory(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.exec(`
        DELETE FROM agent_runs
      `);

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
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const statsStmt = this.db.prepare(`
        SELECT
          COUNT(*) as total_runs,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_runs,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_runs,
          SUM(file_count) as total_files,
          AVG(duration) as avg_duration
        FROM agent_runs
      `);

      const stats = statsStmt.get() as any;

      return {
        totalRuns: stats.total_runs || 0,
        successfulRuns: stats.successful_runs || 0,
        failedRuns: stats.failed_runs || 0,
        totalFilesProcessed: stats.total_files || 0,
        averageRunTime: stats.avg_duration || undefined
      };
    } catch (error) {
      console.error('Failed to get agent run stats:', error);
      throw new Error(`Failed to get agent run stats: ${error}`);
    }
  }

  async saveQuery(query: SavedQuery): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO saved_queries
        (id, name, query, timestamp, last_used, run_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        query.id,
        query.name,
        query.query,
        query.timestamp,
        query.lastUsed,
        query.runCount
      );

      console.log('Query saved to database:', query.id);
    } catch (error) {
      console.error('Failed to save query:', error);
      throw new Error(`Failed to save query: ${error}`);
    }
  }

  async getSavedQueries(limit: number = 20): Promise<SavedQuery[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM saved_queries
        ORDER BY last_used DESC
        LIMIT ?
      `);

      const rows = stmt.all(limit) as any[];

      return rows.map(row => ({
        id: row.id,
        name: row.name,
        query: row.query,
        timestamp: row.timestamp,
        lastUsed: row.last_used,
        runCount: row.run_count
      }));
    } catch (error) {
      console.error('Failed to get saved queries:', error);
      throw new Error(`Failed to get saved queries: ${error}`);
    }
  }

  async getSavedQueryById(id: string): Promise<SavedQuery | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM saved_queries WHERE id = ?
      `);

      const row = stmt.get(id) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        name: row.name,
        query: row.query,
        timestamp: row.timestamp,
        lastUsed: row.last_used,
        runCount: row.run_count
      };
    } catch (error) {
      console.error('Failed to get saved query by ID:', error);
      throw new Error(`Failed to get saved query by ID: ${error}`);
    }
  }

  async updateQueryUsage(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        UPDATE saved_queries
        SET last_used = ?, run_count = run_count + 1
        WHERE id = ?
      `);

      stmt.run(Date.now(), id);
    } catch (error) {
      console.error('Failed to update query usage:', error);
      throw new Error(`Failed to update query usage: ${error}`);
    }
  }

  async deleteQuery(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM saved_queries WHERE id = ?
      `);

      const result = stmt.run(id);

      if (result.changes === 0) {
        throw new Error(`Query with ID ${id} not found`);
      }

      console.log('Query deleted from database:', id);
    } catch (error) {
      console.error('Failed to delete query:', error);
      throw new Error(`Failed to delete query: ${error}`);
    }
  }

  async findQueryByText(queryText: string): Promise<SavedQuery | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM saved_queries WHERE query = ?
      `);

      const row = stmt.get(queryText) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        name: row.name,
        query: row.query,
        timestamp: row.timestamp,
        lastUsed: row.last_used,
        runCount: row.run_count
      };
    } catch (error) {
      console.error('Failed to find query by text:', error);
      throw new Error(`Failed to find query by text: ${error}`);
    }
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}