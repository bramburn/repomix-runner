import React, { useState, useEffect } from 'react';
import { Button, Text, Badge } from '@fluentui/react-components';
import { ArrowSyncRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

interface IndexHistoryEntry {
  id: number;
  timestamp: number;
  repoId: string;
  filePath: string;
  eventType: 'queued' | 'flush' | 'embedding_complete' | 'embedding_failed';
  status: 'pending' | 'indexed' | 'failed' | null;
  details?: string;
}

interface IndexHistoryStats {
  queued: number;
  flush: number;
  embeddingComplete: number;
  embeddingFailed: number;
}

export const IndexHistoryTab = () => {
  const [entries, setEntries] = useState<IndexHistoryEntry[]>([]);
  const [stats, setStats] = useState<IndexHistoryStats>({
    queued: 0,
    flush: 0,
    embeddingComplete: 0,
    embeddingFailed: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'indexHistoryUpdate') {
        setEntries(message.entries);
        setStats(message.stats);
        setIsLoading(false);
      } else if (message.command === 'indexHistoryEvent') {
        // Real-time push: prepend new event to list
        setEntries(prev => {
          const newEntries = [message.entry, ...prev];
          // Keep only last 500 entries in UI
          return newEntries.slice(0, 500);
        });
        // Update stats based on event type
        setStats(prev => {
          const newStats = { ...prev };
          switch (message.entry.eventType) {
            case 'queued':
              newStats.queued++;
              break;
            case 'flush':
              newStats.flush++;
              break;
            case 'embedding_complete':
              newStats.embeddingComplete++;
              break;
            case 'embedding_failed':
              newStats.embeddingFailed++;
              break;
          }
          return newStats;
        });
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'getIndexHistory' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRefresh = () => {
    setIsLoading(true);
    vscode.postMessage({ command: 'getIndexHistory' });
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getEventBadgeColor = (eventType: string): 'informative' | 'success' | 'danger' | 'warning' => {
    switch (eventType) {
      case 'queued':
        return 'informative';
      case 'flush':
        return 'warning';
      case 'embedding_complete':
        return 'success';
      case 'embedding_failed':
        return 'danger';
      default:
        return 'informative';
    }
  };

  const getEventLabel = (eventType: string): string => {
    switch (eventType) {
      case 'queued':
        return 'QUEUED';
      case 'flush':
        return 'FLUSH';
      case 'embedding_complete':
        return 'INDEXED';
      case 'embedding_failed':
        return 'FAILED';
      default:
        return eventType.toUpperCase();
    }
  };

  const getStatusColor = (status: string | null): string => {
    switch (status) {
      case 'pending':
        return 'var(--vscode-charts-blue)';
      case 'indexed':
        return 'var(--vscode-charts-green)';
      case 'failed':
        return 'var(--vscode-errorForeground)';
      default:
        return 'var(--vscode-foreground)';
    }
  };

  const truncatePath = (filePath: string, maxLength: number = 40): string => {
    if (filePath.length <= maxLength) return filePath;
    return '...' + filePath.slice(-(maxLength - 3));
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text weight="semibold">Index History</Text>
        <Button
          appearance="subtle"
          icon={<ArrowSyncRegular />}
          onClick={handleRefresh}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Stats Summary */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '8px 12px',
        backgroundColor: 'var(--vscode-editor-background)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-widget-border)',
        flexWrap: 'wrap'
      }}>
        <Text size={100}>
          <span style={{ color: 'var(--vscode-charts-blue)' }}>{stats.queued}</span> queued
        </Text>
        <Text size={100}>
          <span style={{ color: 'var(--vscode-charts-yellow)' }}>{stats.flush}</span> flush
        </Text>
        <Text size={100}>
          <span style={{ color: 'var(--vscode-charts-green)' }}>{stats.embeddingComplete}</span> indexed
        </Text>
        <Text size={100}>
          <span style={{ color: 'var(--vscode-errorForeground)' }}>{stats.embeddingFailed}</span> failed
        </Text>
      </div>

      {/* History List */}
      {isLoading ? (
        <Text style={{ opacity: 0.7 }}>Loading...</Text>
      ) : entries.length === 0 ? (
        <Text style={{ opacity: 0.7 }}>No index history recorded yet.</Text>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          maxHeight: '400px',
          overflowY: 'auto',
          border: '1px solid var(--vscode-widget-border)',
          borderRadius: '4px'
        }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 70px 1fr auto',
                gap: '8px',
                padding: '6px 10px',
                backgroundColor: 'var(--vscode-editor-background)',
                alignItems: 'center',
                borderBottom: '1px solid var(--vscode-widget-border)',
                fontSize: '12px'
              }}
            >
              {/* Timestamp */}
              <Text size={100} style={{ fontFamily: 'monospace', opacity: 0.7 }}>
                {formatTimestamp(entry.timestamp)}
              </Text>

              {/* Event Type Badge */}
              <Badge
                appearance="filled"
                color={getEventBadgeColor(entry.eventType)}
                size="small"
              >
                {getEventLabel(entry.eventType)}
              </Badge>

              {/* File Path */}
              <Text
                size={100}
                style={{
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={entry.filePath}
              >
                {truncatePath(entry.filePath)}
              </Text>

              {/* Status */}
              {entry.status && (
                <Text
                  size={100}
                  style={{
                    color: getStatusColor(entry.status),
                    fontWeight: 500
                  }}
                >
                  {entry.status}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      <Text size={100} style={{ opacity: 0.5, fontStyle: 'italic' }}>
        Showing last {entries.length} events (max 500)
      </Text>
    </div>
  );
};
