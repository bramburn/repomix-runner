import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Input,
  Text,
  Checkbox,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Search20Regular, ArrowCounterclockwise20Regular } from '@fluentui/react-icons';
import { ThreadCard } from './ThreadCard.js';
import { vscode } from '../../vscode-api.js';

interface ThreadSummary {
  id: string;
  title: string | null;
  updatedAt: number;
  createdAt: number;
  messageCount: number;
  tokenCount: number;
  preview?: string;
  hasPendingBatch?: boolean;
  isArchived?: boolean;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: tokens.spacingVerticalM,
    overflow: 'hidden',
  },
  header: {
    marginBottom: tokens.spacingVerticalL,
  },
  searchRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalM,
  },
  searchInput: {
    flex: 1,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  threadList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalS,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalL,
  },
  loadMoreContainer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: tokens.spacingVerticalM,
  },
});

const SEARCH_DEBOUNCE_MS = 400;

export const ChatHistoryTab: React.FC<{
  onResumeThread?: (threadId: string) => void;
}> = ({ onResumeThread }) => {
  const styles = useStyles();
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ timestamp: number; id: string } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Centralized message handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'threadList' && !message.append) {
        setThreads(message.threads || []);
        setHasMore(message.hasMore || false);
        setNextCursor(message.nextCursor || null);
        setIsLoading(false);
      }
      if (message.command === 'threadList' && message.append) {
        setThreads((prev) => [...prev, ...(message.threads || [])]);
        setHasMore(message.hasMore || false);
        setNextCursor(message.nextCursor || null);
        setIsLoading(false);
      }
      if (message.command === 'threadsSearchResult') {
        setThreads(message.threads || []);
        setHasMore(false);
        setNextCursor(null);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Load threads on mount
  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = useCallback(() => {
    setIsLoading(true);
    vscode.postMessage({
      command: 'getThreads',
    });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);

    // Clear previous debounce timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      setIsLoading(true);

      if (!query.trim()) {
        // If search is cleared, reload all threads
        vscode.postMessage({ command: 'getThreads' });
        return;
      }

      vscode.postMessage({
        command: 'searchThreads',
        query: query.trim(),
        showArchived,
      });
    }, SEARCH_DEBOUNCE_MS);
  }, [showArchived]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleSearch = handleSearchChange;

  const handleToggleArchived = useCallback(() => {
    const newValue = !showArchived;
    setShowArchived(newValue);
    setIsLoading(true);

    if (searchQuery.trim()) {
      vscode.postMessage({
        command: 'searchThreads',
        query: searchQuery.trim(),
        showArchived: newValue,
      });
    } else {
      vscode.postMessage({ command: 'getThreads' });
    }
  }, [showArchived, searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    vscode.postMessage({
      command: 'getThreadHistoryPage',
      before: nextCursor,
      limit: 20,
    });
  }, [nextCursor, isLoading]);

  const handleResume = useCallback((threadId: string) => {
    vscode.postMessage({
      command: 'setActiveThread',
      threadId,
    });
    
    if (onResumeThread) {
      onResumeThread(threadId);
    }
  }, [onResumeThread]);

  const handleExport = useCallback((threadId: string) => {
    vscode.postMessage({
      command: 'exportThread',
      threadId,
    });
  }, []);

  const handleArchive = useCallback((threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;

    if (thread.isArchived) {
      vscode.postMessage({
        command: 'unarchiveThread',
        threadId,
      });
    } else {
      vscode.postMessage({
        command: 'archiveThread',
        threadId,
      });
    }

    // Optimistically update UI
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId ? { ...t, isArchived: !t.isArchived } : t
      )
    );
  }, [threads]);

  const handleDelete = useCallback((threadId: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this thread and all its messages? This action cannot be undone.'
    );
    if (!confirmed) return;

    vscode.postMessage({
      command: 'deleteThread',
      threadId,
    });

    // Remove from list
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          📜 Chat History
        </Text>
      </div>

      <div className={styles.searchRow}>
        <Input
          className={styles.searchInput}
          placeholder="🔍 Search threads by title or content..."
          value={searchQuery}
          onChange={(_, data) => handleSearch(data.value)}
          contentBefore={<Search20Regular />}
          disabled={isLoading}
        />
      </div>

      <div className={styles.controls}>
        <Checkbox
          label="Show Archived"
          checked={showArchived}
          onChange={handleToggleArchived}
        />
        <Button
          appearance="subtle"
          icon={<ArrowCounterclockwise20Regular />}
          onClick={loadThreads}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      <div className={styles.threadList}>
        {isLoading && threads.length === 0 ? (
          <div className={styles.loadingContainer}>
            <Spinner size="small" label="Loading threads..." />
          </div>
        ) : threads.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size={400}>No chat threads found</Text>
            <Text size={300}>Start a new conversation to see it here</Text>
          </div>
        ) : (
          <>
            {threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onResume={handleResume}
                onExport={handleExport}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            ))}
            
            {hasMore && (
              <div className={styles.loadMoreContainer}>
                <Button
                  appearance="primary"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  Load More...
                </Button>
              </div>
            )}
            
            {isLoading && threads.length > 0 && (
              <div className={styles.loadingContainer}>
                <Spinner size="small" label="Loading more..." />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
