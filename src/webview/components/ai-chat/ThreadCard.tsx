import React from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Play20Regular, ArrowDownload20Regular, Archive20Regular, Delete20Regular } from '@fluentui/react-icons';
import { BatchStatusBadge } from './BatchStatusBadge.js';

interface ThreadCardProps {
  thread: {
    id: string;
    title: string | null;
    updatedAt: number;
    createdAt: number;
    messageCount: number;
    tokenCount: number;
    preview?: string;
    hasPendingBatch?: boolean;
    isArchived?: boolean;
  };
  onResume: (threadId: string) => void;
  onExport: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    transition: 'box-shadow 0.2s ease',
    ':hover': {
      boxShadow: tokens.shadow4,
    },
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  titleRow: {
    flex: 1,
    minWidth: 0, // Allows text truncation
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  metadata: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  preview: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS,
  },
  badgeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  onResume,
  onExport,
  onArchive,
  onDelete,
}) => {
  const styles = useStyles();

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const handleTitleClick = () => {
    onResume(thread.id);
  };

  const handleArchiveClick = () => {
    onArchive(thread.id);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Text 
            className={styles.title} 
            onClick={handleTitleClick}
            block
            truncate
          >
            {thread.title || 'Untitled Thread'}
          </Text>
          <div className={styles.metadata}>
            <span>{timeAgo(thread.updatedAt)}</span>
            <span>•</span>
            <span>{thread.messageCount} messages</span>
            <span>•</span>
            <span>{Math.round(thread.tokenCount / 1000)}K tokens</span>
          </div>
        </div>
        <div className={styles.badgeContainer}>
          {thread.hasPendingBatch && (
            <BatchStatusBadge status="pending" />
          )}
          {thread.isArchived && (
            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
              📦 Archived
            </Text>
          )}
        </div>
      </div>

      {thread.preview && (
        <div className={styles.preview}>
          "{thread.preview}"
        </div>
      )}

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<Play20Regular />}
          onClick={() => onResume(thread.id)}
          size="small"
        >
          Resume
        </Button>
        <Button
          appearance="secondary"
          icon={<ArrowDownload20Regular />}
          onClick={() => onExport(thread.id)}
          size="small"
        >
          Export
        </Button>
        <Button
          appearance="subtle"
          icon={<Archive20Regular />}
          onClick={handleArchiveClick}
          size="small"
        >
          {thread.isArchived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button
          appearance="subtle"
          icon={<Delete20Regular />}
          onClick={() => onDelete(thread.id)}
          size="small"
          style={{ color: tokens.colorPaletteRedForeground1 }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
};
