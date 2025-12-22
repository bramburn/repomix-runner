import * as path from "path";
import * as vscode from "vscode";
import { DatabaseService } from "../storage/databaseService.js";
import { logger } from "../../shared/logger.js";

/**
 * Normalize a file URI to a repo-relative path with forward slashes.
 * This ensures consistent path formatting across platforms (Windows/POSIX).
 *
 * @param repoRoot - The root directory of the repository
 * @param uri - The VS Code URI to normalize
 * @returns Relative path with forward slashes (e.g., "src/components/Button.tsx")
 */
export function toRelativePosix(repoRoot: string, uri: vscode.Uri): string {
  const rel = path.relative(repoRoot, uri.fsPath);
  return rel.split(path.sep).join("/");
}

/**
 * Monitors file changes in a repository and debounces embedding updates.
 *
 * This class implements a "collector" pattern:
 * - File changes are queued immediately (via `queue()`)
 * - After a quiet period (debounce), all queued files are flushed together
 * - This prevents excessive re-embedding during rapid file saves
 *
 * Flow:
 * 1. File watcher detects change → `queue(path)` called
 * 2. Path added to pending set, debounce timer reset
 * 3. After debounceMs of no new changes → `flush()` called
 * 4. Pending files marked in DB as "pending" for re-embedding
 * 5. Callback triggers incremental embedding process
 *
 * @example
 * ```ts
 * const monitor = new RepoIndexMonitor(
 *   repoRoot,
 *   repoId,
 *   databaseService,
 *   async (paths) => {
 *     // Trigger re-embedding for changed files
 *     await orchestrator.embedPendingFiles(...);
 *   },
 *   2500 // 2.5 second debounce
 * );
 *
 * watcher.onDidChange(uri => {
 *   monitor.queue(toRelativePosix(repoRoot, uri));
 * });
 * ```
 */
export class RepoIndexMonitor {
  /**
   * Set of file paths currently queued for re-embedding.
   * Using a Set automatically deduplicates if the same file changes multiple times.
   */
  private pending = new Set<string>();

  /**
   * Debounce timer reference. Cleared and restarted on each new file change.
   */
  private timer: NodeJS.Timeout | undefined;

  constructor(
    /**
     * Absolute path to the repository root directory.
     * Used as the base for all relative path calculations.
     */
    private readonly repoRoot: string,

    /**
     * Unique repository identifier (e.g., "git:github.com/user/repo" or "dir:my-project").
     * Used for scoping operations to a specific repository.
     */
    private readonly repoId: string,

    /**
     * Database service for persisting pending file state.
     * Allows pending state to survive extension restarts.
     */
    private readonly databaseService: DatabaseService,

    /**
     * Callback invoked after debounce period with the list of changed files.
     * This should trigger the incremental embedding process.
     *
     * @param paths - Array of repo-relative file paths that changed
     */
    private readonly onFlush: (paths: string[]) => Promise<void>,

    /**
     * Debounce delay in milliseconds.
     * Default: 2500ms (2.5 seconds)
     *
     * This value balances:
     * - Too low: Excessive re-embedding during rapid saves
     * - Too high: Delayed updates for search results
     */
    private readonly debounceMs: number = 2500
  ) {
    console.log(`[RepoIndexMonitor] Initialized for repo "${repoId}"`);
    console.log(`[RepoIndexMonitor]   - Repo root: ${repoRoot}`);
    console.log(`[RepoIndexMonitor]   - Debounce: ${debounceMs}ms`);
  }

  /**
   * Queue a file path for pending re-indexing.
   *
   * This is called by the file watcher whenever a file changes.
   * The file is added to the pending set and the debounce timer is reset.
   *
   * @param relativePath - Repo-relative file path (e.g., "src/index.ts")
   */
  queue(relativePath: string) {
    // Skip invalid paths (escape attempts, empty strings)
    if (!relativePath || relativePath.startsWith("..")) {
      console.log(`[RepoIndexMonitor] Skipping invalid path: "${relativePath}"`);
      return;
    }

    // Check if this file is already pending (no-op if duplicate)
    const wasAlreadyPending = this.pending.has(relativePath);
    this.pending.add(relativePath);

    // Reset the debounce timer (push back the flush time)
    this.schedule();

    // Log only on first queue for each file (avoid spam)
    if (!wasAlreadyPending) {
      console.log(`[RepoIndexMonitor] Queued file for re-embedding: ${relativePath} (pending: ${this.pending.size})`);
    }
  }

  /**
   * Schedule or reschedule the debounce timer.
   *
   * Each time a file changes, we reset the timer.
   * Only after `debounceMs` of silence do we actually flush.
   */
  private schedule() {
    // Clear any existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set new timer to flush after debounce period
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /**
   * Flush pending files to the database and trigger embedding.
   *
   * This method:
   * 1. Takes a snapshot of all pending files (and clears the set)
   * 2. Persists them to the database as "pending" status
   * 3. Invokes the callback to start incremental embedding
   *
   * The pending set is cleared BEFORE the async callback runs,
   * so new changes that occur during embedding will be queued separately.
   */
  async flush() {
    // Take snapshot and clear immediately (allows new changes to queue during processing)
    const paths = [...this.pending];
    this.pending.clear();

    // Clear the timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // Nothing to do if no files changed
    if (paths.length === 0) {
      console.log(`[RepoIndexMonitor] Flush called with no pending files (skipped)`);
      return;
    }

    const flushStart = Date.now();
    console.log(`[RepoIndexMonitor] ===== FLUSH START =====`);
    console.log(`[RepoIndexMonitor] Files to mark pending: ${paths.length}`);
    console.log(`[RepoIndexMonitor] Files:`, paths);

    try {
      // Step 1: Persist pending state to database
      console.log(`[RepoIndexMonitor] Step 1: Marking files as pending in database...`);
      const dbStart = Date.now();
      await this.databaseService.markRepoFilesPending(this.repoId, paths);
      const dbDuration = Date.now() - dbStart;
      console.log(`[RepoIndexMonitor] Step 1 complete: Database updated in ${dbDuration}ms`);

      // Step 2: Trigger incremental embedding callback
      console.log(`[RepoIndexMonitor] Step 2: Triggering incremental embedding callback...`);
      const embedStart = Date.now();
      await this.onFlush(paths);
      const embedDuration = Date.now() - embedStart;
      console.log(`[RepoIndexMonitor] Step 2 complete: Embedding callback finished in ${embedDuration}ms`);

      const totalDuration = Date.now() - flushStart;
      console.log(`[RepoIndexMonitor] ===== FLUSH COMPLETE =====`);
      console.log(`[RepoIndexMonitor] Total time: ${totalDuration}ms`);
      console.log(`[RepoIndexMonitor] Files processed: ${paths.length}`);
    } catch (error) {
      const flushDuration = Date.now() - flushStart;
      console.error(`[RepoIndexMonitor] ===== FLUSH FAILED =====`);
      console.error(`[RepoIndexMonitor] Error after ${flushDuration}ms:`, error);
      logger.both.error(`[RepoIndexMonitor] Flush failed: ${error}`);
    }
  }

  /**
   * Clean up resources.
   *
   * Call this when the monitor is no longer needed (e.g., extension deactivation).
   * Ensures the debounce timer is cleared to prevent memory leaks.
   */
  dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    console.log(`[RepoIndexMonitor] Disposed (cleared timer, ${this.pending.size} files left in queue)`);
  }
}
