import React from 'react';
import { Button, Text } from '@fluentui/react-components';
import type { QueueEntry } from '../../../chat/queue/types';

interface QueuePanelProps {
  entries: QueueEntry[];
  currentlyProcessing: QueueEntry | null;
  onCancelEntry: (entryId: string) => void;
  onClearQueue: () => void;
  isVisible: boolean;
  onClose: () => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  entries,
  currentlyProcessing,
  onCancelEntry,
  onClearQueue,
  isVisible,
  onClose,
}) => {
  if (!isVisible) {
    return null;
  }

  const queuedEntries = entries.filter(entry => entry.status === 'queued');

  return (
    <div
      style={{
        marginBottom: '10px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '10px',
        padding: '10px',
        background: 'rgba(0, 0, 0, 0.25)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <Text weight="semibold">Message Queue</Text>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="small" appearance="subtle" onClick={onClearQueue}>
            Clear queued
          </Button>
          <Button size="small" appearance="subtle" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {currentlyProcessing && (
        <div style={{ marginBottom: '8px', opacity: 0.9 }}>
          <Text size={200}>Processing: {currentlyProcessing.text}</Text>
        </div>
      )}

      {queuedEntries.length === 0 ? (
        <Text size={200} style={{ opacity: 0.75 }}>
          No queued messages
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {queuedEntries.map(entry => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Text size={200} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.text}
              </Text>
              <Button size="small" appearance="subtle" onClick={() => onCancelEntry(entry.id)}>
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
