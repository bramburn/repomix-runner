import React, { useState } from 'react';
import {
  Badge,
  Button,
  Text,
  Textarea,
  Card,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Edit20Regular, Delete20Regular, Checkmark20Regular, Dismiss20Regular } from '@fluentui/react-icons';

export interface MemoryEntryProps {
  id: string;
  memoryKey: string;
  value: string;
  source: 'user' | 'auto';
  createdAt: number;
  updatedAt: number;
  onUpdate: (id: string, value: string) => void;
  onDelete: (id: string) => void;
}

const useStyles = makeStyles({
  card: {
    marginBottom: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
  },
  keyContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
    minWidth: 0,
  },
  key: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  content: {
    padding: tokens.spacingVerticalS,
    paddingTop: 0,
  },
  value: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  editTextarea: {
    width: '100%',
    minHeight: '80px',
  },
  editActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
    justifyContent: 'flex-end',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: tokens.spacingVerticalXS,
    paddingRight: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  confirmDeleteActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  confirmText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
});

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MemoryEntryCard: React.FC<MemoryEntryProps> = ({
  id,
  memoryKey,
  value,
  source,
  createdAt,
  updatedAt,
  onUpdate,
  onDelete,
}) => {
  const styles = useStyles();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleSave = () => {
    if (editValue.trim() && editValue !== value) {
      onUpdate(id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleDeleteClick = () => {
    setIsConfirmingDelete(true);
  };

  const handleConfirmDelete = () => {
    setIsConfirmingDelete(false);
    onDelete(id);
  };

  const handleCancelDelete = () => {
    setIsConfirmingDelete(false);
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div className={styles.keyContainer}>
          <Text className={styles.key}>{memoryKey}</Text>
          <Badge
            className={styles.badge}
            appearance="tint"
            color={source === 'auto' ? 'informative' : 'success'}
          >
            {source === 'auto' ? 'Auto' : 'Manual'}
          </Badge>
        </div>
        <div className={styles.actions}>
          {!isEditing && !isConfirmingDelete && (
            <>
              <Button
                icon={<Edit20Regular />}
                appearance="subtle"
                size="small"
                onClick={() => setIsEditing(true)}
                title="Edit memory"
              />
              <Button
                icon={<Delete20Regular />}
                appearance="subtle"
                size="small"
                onClick={handleDeleteClick}
                title="Delete memory"
              />
            </>
          )}
        </div>
      </div>

      {isConfirmingDelete && (
        <div className={styles.confirmDeleteActions}>
          <Text className={styles.confirmText}>Delete "{memoryKey}"?</Text>
          <Button appearance="primary" size="small" onClick={handleConfirmDelete}>
            Yes, delete
          </Button>
          <Button appearance="subtle" size="small" onClick={handleCancelDelete}>
            Cancel
          </Button>
        </div>
      )}

      <div className={styles.content}>
        {isEditing ? (
          <>
            <Textarea
              className={styles.editTextarea}
              value={editValue}
              onChange={(e, data) => setEditValue(data.value)}
              resize="vertical"
            />
            <div className={styles.editActions}>
              <Button
                icon={<Dismiss20Regular />}
                appearance="subtle"
                size="small"
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                icon={<Checkmark20Regular />}
                appearance="primary"
                size="small"
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </>
        ) : (
          <Text className={styles.value}>{value}</Text>
        )}
      </div>

      <div className={styles.footer}>
        <Text size={200}>
          {createdAt !== updatedAt ? `Updated ${formatTimestamp(updatedAt)}` : `Created ${formatTimestamp(createdAt)}`}
        </Text>
      </div>
    </Card>
  );
};
