/**
 * Message Queue System Types (PRD 007)
 */

/**
 * Status of a queue entry.
 */
export type QueueStatus = 'queued' | 'processing' | 'completed' | 'cancelled' | 'failed';

/**
 * Priority level for queue entries.
 */
export type QueuePriority = 'normal' | 'force';

/**
 * Represents a message in the queue.
 */
export interface QueueEntry {
  id: string;
  threadId: string;
  text: string;
  priority: QueuePriority;
  status: QueueStatus;
  createdAt: number; // timestamp in ms
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/**
 * Configuration for the message queue.
 */
export interface QueueConfig {
  /**
   * Maximum number of entries to keep in history (completed/failed/cancelled).
   * Default: 100
   */
  maxHistorySize?: number;
}

/**
 * Event emitted when the queue changes.
 */
export interface QueueChangedEvent {
  entries: QueueEntry[];
}

/**
 * Event emitted when processing starts on an entry.
 */
export interface ProcessingStartedEvent {
  entry: QueueEntry;
}

/**
 * Event emitted when processing completes on an entry.
 */
export interface ProcessingCompletedEvent {
  entry: QueueEntry;
  success: boolean;
}

/**
 * Status of the queue.
 */
export interface QueueStatusInfo {
  queueLength: number;
  currentlyProcessing: QueueEntry | null;
  entries: QueueEntry[];
}

/**
 * Type for queue event listeners.
 */
export type QueueEventListener<T> = (data: T) => void;

/**
 * Map of event types to their listener signatures.
 */
export interface QueueEvents {
  queueChanged: QueueChangedEvent;
  processingStarted: ProcessingStartedEvent;
  processingCompleted: ProcessingCompletedEvent;
}
