import { BaseController, IWebviewContext } from './BaseController.js';
import { DatabaseService, IndexHistoryEntry } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { getRepoId } from '../../utils/repoIdentity.js';

export class IndexHistoryController extends BaseController {
  private pendingEvents: IndexHistoryEntry[] = [];
  private pushTimer: NodeJS.Timeout | undefined;
  private readonly PUSH_DEBOUNCE_MS = 500;

  constructor(
    context: IWebviewContext,
    private readonly databaseService: DatabaseService
  ) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'getIndexHistory':
        await this.handleGetIndexHistory(message.repoId);
        return true;
    }
    return false;
  }

  async onWebviewLoaded(): Promise<void> {
    // Send initial history when webview loads
    await this.handleGetIndexHistory();
  }

  private async handleGetIndexHistory(repoId?: string): Promise<void> {
    try {
      // If no repoId provided, use current repo
      const effectiveRepoId = repoId || await this.getCurrentRepoId();
      
      const [entries, stats] = await Promise.all([
        this.databaseService.getIndexHistory(effectiveRepoId),
        this.databaseService.getIndexHistoryStats(effectiveRepoId)
      ]);

      this.context.postMessage({
        command: 'indexHistoryUpdate',
        entries,
        stats
      });
    } catch (error) {
      console.error('[IndexHistoryController] Failed to get index history:', error);
    }
  }

  private async getCurrentRepoId(): Promise<string | undefined> {
    try {
      const cwd = getCwd();
      return await getRepoId(cwd);
    } catch {
      return undefined;
    }
  }

  /**
   * Push a single event to the webview.
   * Events are debounced and batched to avoid flooding.
   */
  pushEvent(entry: IndexHistoryEntry): void {
    this.pendingEvents.push(entry);
    this.schedulePush();
  }

  private schedulePush(): void {
    if (this.pushTimer) {
      return; // Already scheduled
    }

    this.pushTimer = setTimeout(() => {
      this.flushPendingEvents();
    }, this.PUSH_DEBOUNCE_MS);
  }

  private flushPendingEvents(): void {
    if (this.pendingEvents.length === 0) {
      return;
    }

    // Send all pending events
    for (const entry of this.pendingEvents) {
      this.context.postMessage({
        command: 'indexHistoryEvent',
        entry
      });
    }

    this.pendingEvents = [];
    this.pushTimer = undefined;
  }

  dispose(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = undefined;
    }
  }
}
