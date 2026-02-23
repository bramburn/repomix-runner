import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Text,
  Checkbox,
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
  loadMoreContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

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

  // Load threads on mount
  useEffect(() => {
    loadInitialThreads();
  }, []);

  const loadInitialThreads = () => {
    setIsLoading(true);
    vscode.postMessage({
      command: 'getThreads',
    });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'threadList') {
        setThreads(message.threads || []);
        setIsLoading(false);
      }
      if (message.command === 'threadsSearchResult') {
        setThreads(message.threads || []);
        setHasMore(false);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setIsLoading(true);
    
    if (!query.trim()) {
      // If search is cleared, reload all threads
      loadInitialThreads();
      return;
    }

    vscode.postMessage({
      command: 'searchThreads',
      query: query.trim(),
      showArchived,
    });
  }, [showArchived]);

  const handleToggleArchived = useCallback(() => {
    const newValue = !showArchived;
    setShowArchived(newValue);
    vscode.postMessage({
      command: 'showArchivedThreads',
      show: newValue,
    });
    
    // Reload threads with new archived setting
    if (searchQuery.trim()) {
      vscode.postMessage({
        command: 'searchThreads',
        query: searchQuery.trim(),
        showArchived: newValue,
      });
    } else {
      loadInitialThreads();
    }
  }, [showArchived, searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor) return;
    
    setIsLoading(true);
    vscode.postMessage({
      command: 'getThreadHistoryPage',
      before: nextCursor,
      limit: 50,
    });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'threadList' && message.append) {
        setThreads((prev) => [...prev, ...(message.threads || [])]);
        setHasMore(message.hasMore || false);
        setNextCursor(message.nextCursor || null);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [nextCursor]);

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
          onClick={loadInitialThreads}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      <div className={styles.threadList}>
        {threads.length === 0 ? (
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
          </>
        )}
      </div>
    </div>
  );
};
