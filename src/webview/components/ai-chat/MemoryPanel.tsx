import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Textarea,
  Text,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Add20Regular } from '@fluentui/react-icons';
import { MemoryEntryCard } from './MemoryEntryCard.js';
import { vscode } from '../../vscode-api.js';

type MemoryScope = 'session' | 'repo';
type MemorySource = 'user' | 'auto';

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source: MemorySource;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
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
    marginBottom: tokens.spacingVerticalM,
  },
  tabList: {
    marginBottom: tokens.spacingVerticalM,
  },
  createForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  formRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
  },
  keyInput: {
    flex: '0 0 200px',
  },
  valueTextarea: {
    width: '100%',
    minHeight: '60px',
  },
  addButton: {
    flexShrink: 0,
  },
  memoryList: {
    flex: 1,
    overflow: 'auto',
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
  label: {
    marginBottom: tokens.spacingVerticalXS,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
});

export const MemoryPanel: React.FC = () => {
  const styles = useStyles();
  const [activeScope, setActiveScope] = useState<MemoryScope>('session');
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Request memories when scope changes
  useEffect(() => {
    vscode.postMessage({ command: 'getMemories', scope: activeScope });
  }, [activeScope]);

  // Listen for memory list updates
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'memoryList' && message.scope === activeScope) {
        setMemories(message.memories);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeScope]);

  const handleCreate = useCallback(() => {
    if (!newKey.trim() || !newValue.trim()) {
      return;
    }

    vscode.postMessage({
      command: 'createMemory',
      scope: activeScope,
      key: newKey.trim(),
      value: newValue.trim(),
    });

    setNewKey('');
    setNewValue('');
  }, [activeScope, newKey, newValue]);

  const handleUpdate = useCallback((id: string, value: string) => {
    vscode.postMessage({
      command: 'updateMemory',
      id,
      value,
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    vscode.postMessage({
      command: 'deleteMemory',
      id,
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && newKey.trim() && newValue.trim()) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate, newKey, newValue]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text size={500} weight="semibold">
          Memory Manager
        </Text>
      </div>

      <TabList
        className={styles.tabList}
        selectedValue={activeScope}
        onTabSelect={(_, data) => setActiveScope(data.value as MemoryScope)}
      >
        <Tab value="session">Session</Tab>
        <Tab value="repo">Repository</Tab>
      </TabList>

      <div className={styles.createForm}>
        <Text className={styles.label}>Add New Memory</Text>
        <div className={styles.formRow}>
          <Input
            className={styles.keyInput}
            placeholder="Key (e.g., user_preference)"
            value={newKey}
            onChange={(e, data) => setNewKey(data.value)}
            onKeyDown={handleKeyDown}
            maxLength={100}
          />
        </div>
        <Textarea
          className={styles.valueTextarea}
          placeholder="Value (e.g., Prefers TypeScript over JavaScript)"
          value={newValue}
          onChange={(e, data) => setNewValue(data.value)}
          resize="vertical"
          maxLength={10000}
        />
        <div className={styles.formRow}>
          <Button
            className={styles.addButton}
            icon={<Add20Regular />}
            appearance="primary"
            onClick={handleCreate}
            disabled={!newKey.trim() || !newValue.trim()}
          >
            Add Memory
          </Button>
        </div>
      </div>

      <div className={styles.memoryList}>
        {memories.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size={300}>No memories stored yet</Text>
            <Text size={200}>
              {activeScope === 'session'
                ? 'Session memories are specific to the current chat thread.'
                : 'Repository memories are shared across all threads in this project.'}
            </Text>
          </div>
        ) : (
          memories.map((memory) => (
            <MemoryEntryCard
              key={memory.id}
              id={memory.id}
              memoryKey={memory.key}
              value={memory.value}
              source={memory.source}
              createdAt={memory.createdAt}
              updatedAt={memory.updatedAt}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
};
