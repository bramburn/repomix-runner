import { EventEmitter } from 'node:events';
import type {
  ProcessingCompletedEvent,
  ProcessingStartedEvent,
  QueueConfig,
  QueueEntry,
  QueueEventListener,
  QueueEvents,
  QueueStatusInfo,
} from './types.js';

interface SerializedQueueState {
  entries: QueueEntry[];
}

const DEFAULT_CONFIG: Required<QueueConfig> = {
  maxHistorySize: 100,
};

export class MessageQueue {
  private readonly emitter = new EventEmitter();
  private readonly config: Required<QueueConfig>;
  private entries: QueueEntry[] = [];

  constructor(config: QueueConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  on<K extends keyof QueueEvents>(event: K, listener: QueueEventListener<QueueEvents[K]>): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof QueueEvents>(event: K, listener: QueueEventListener<QueueEvents[K]>): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  removeAllListeners(): this {
    this.emitter.removeAllListeners();
    return this;
  }

  enqueue(threadId: string, text: string, priority: 'normal' | 'force' = 'normal'): QueueEntry {
    const entry: QueueEntry = {
      id: this.createEntryId(),
      threadId,
      text,
      priority,
      status: 'queued',
      createdAt: Date.now(),
    };

    if (priority === 'force') {
      const firstQueuedIndex = this.entries.findIndex(e => e.status === 'queued');
      if (firstQueuedIndex === -1) {
        this.entries.push(entry);
      } else {
        this.entries.splice(firstQueuedIndex, 0, entry);
      }
    } else {
      this.entries.push(entry);
    }

    this.emitQueueChanged();
    return { ...entry };
  }

  dequeue(): QueueEntry | null {
    const entry = this.entries.find(e => e.status === 'queued');
    if (!entry) {
      return null;
    }

    entry.status = 'processing';
    entry.startedAt = Date.now();

    const startedEvent: ProcessingStartedEvent = { entry: { ...entry } };
    this.emit('processingStarted', startedEvent);
    this.emitQueueChanged();
    return { ...entry };
  }

  complete(entryId: string, success: boolean, error?: string): void {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) {
      return;
    }

    entry.status = success ? 'completed' : 'failed';
    entry.completedAt = Date.now();
    entry.error = error;

    const completedEvent: ProcessingCompletedEvent = { entry: { ...entry }, success };
    this.emit('processingCompleted', completedEvent);
    this.trimHistory();
    this.emitQueueChanged();
  }

  cancel(entryId: string): boolean {
    const entry = this.entries.find(e => e.id === entryId && e.status === 'queued');
    if (!entry) {
      return false;
    }

    entry.status = 'cancelled';
    entry.completedAt = Date.now();
    this.trimHistory();
    this.emitQueueChanged();
    return true;
  }

  cancelAll(): void {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.status === 'queued') {
        entry.status = 'cancelled';
        entry.completedAt = Date.now();
        changed = true;
      }
    }

    if (changed) {
      this.trimHistory();
      this.emitQueueChanged();
    }
  }

  getStatus(): QueueStatusInfo {
    return {
      queueLength: this.entries.filter(e => e.status === 'queued').length,
      currentlyProcessing: this.entries.find(e => e.status === 'processing') ?? null,
      entries: this.entries.map(e => ({ ...e })),
    };
  }

  serialize(): SerializedQueueState {
    return {
      entries: this.entries.map(e => ({ ...e })),
    };
  }

  deserialize(serialized: SerializedQueueState): void {
    if (!serialized || !Array.isArray(serialized.entries)) {
      return;
    }

    this.entries = serialized.entries
      .filter((entry): entry is QueueEntry => Boolean(entry?.id && entry?.threadId && entry?.text))
      .map(entry => {
        if (entry.status === 'processing') {
          return {
            ...entry,
            status: 'queued',
            startedAt: undefined,
          };
        }
        return { ...entry };
      });

    this.trimHistory();
    this.emitQueueChanged();
  }

  private emitQueueChanged(): void {
    this.emit('queueChanged', { entries: this.entries.map(e => ({ ...e })) });
  }

  private emit<K extends keyof QueueEvents>(event: K, payload: QueueEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  private trimHistory(): void {
    const activeEntries = this.entries.filter(e => !this.isTerminal(e.status));
    const terminalEntries = this.entries
      .filter(e => this.isTerminal(e.status))
      .sort((a, b) => (a.completedAt ?? a.createdAt) - (b.completedAt ?? b.createdAt));
    const keptTerminal = terminalEntries.slice(-this.config.maxHistorySize);
    this.entries = [...activeEntries, ...keptTerminal];
  }

  private isTerminal(status: QueueEntry['status']): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  }

  private createEntryId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
