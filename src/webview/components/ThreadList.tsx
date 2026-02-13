import React, { useMemo, useState } from 'react';
import {
  Button,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  Checkmark24Regular,
  Delete24Regular,
  Dismiss24Regular,
  Edit24Regular,
  MoreHorizontal24Regular,
  Search24Regular,
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

export interface ThreadItem {
  id: string;
  title: string;
  updatedAt: number;
  preview?: string;
  planPath?: string;
}

interface ThreadListProps {
  threads: ThreadItem[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

function getGroupLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const previousWeek = new Date(today);
  previousWeek.setDate(previousWeek.getDate() - 7);
  const previousMonth = new Date(today);
  previousMonth.setDate(previousMonth.getDate() - 30);

  if (date >= today) {
    return 'Today';
  }
  if (date >= yesterday) {
    return 'Yesterday';
  }
  if (date >= previousWeek) {
    return 'Previous 7 Days';
  }
  if (date >= previousMonth) {
    return 'Previous 30 Days';
  }
  return 'Older';
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
}) => {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [filter, setFilter] = useState('');
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);

  const groupedThreads = useMemo(() => {
    const filteredThreads = threads.filter((thread) =>
      thread.title.toLowerCase().includes(filter.toLowerCase())
    );

    const groups = new Map<string, ThreadItem[]>();
    for (const thread of filteredThreads) {
      const label = getGroupLabel(thread.updatedAt);
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(thread);
    }

    for (const values of groups.values()) {
      values.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
    return order
      .filter((label) => (groups.get(label)?.length ?? 0) > 0)
      .map((label) => ({ label, items: groups.get(label)! }));
  }, [filter, threads]);

  const handleDelete = (threadId: string) => {
    vscode.postMessage({ command: 'deleteThread', threadId });
  };

  const handleExport = (threadId: string) => {
    vscode.postMessage({ command: 'exportThread', threadId });
  };

  const startRenaming = (threadId: string, title: string) => {
    setEditingThreadId(threadId);
    setEditTitle(title);
  };

  const cancelRenaming = () => {
    setEditingThreadId(null);
    setEditTitle('');
  };

  const saveRename = (threadId: string) => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      return;
    }
    vscode.postMessage({ command: 'renameThread', threadId, newName: nextTitle });
    setEditingThreadId(null);
    setEditTitle('');
  };

  return (
    <div style={{
      width: '260px',
      borderRight: '1px solid var(--vscode-widget-border)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--vscode-sideBar-background)',
      flexShrink: 0,
      height: '100%',
    }}>
      <div style={{ padding: '12px 12px 8px 12px' }}>
        <Input
          contentBefore={<Search24Regular style={{ opacity: 0.6 }} />}
          placeholder="Search chats..."
          value={filter}
          onChange={(_, data) => setFilter(data.value)}
          appearance="filled-darker"
        />
      </div>

      {threads.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
          <Text>No history yet.</Text>
        </div>
      )}

      <div style={{ flexGrow: 1, overflowY: 'auto', paddingBottom: '12px' }}>
        {threads.length > 0 && groupedThreads.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
            <Text>No matching chats.</Text>
          </div>
        )}

        {groupedThreads.map((group) => (
          <div key={group.label} style={{ marginBottom: '14px' }}>
            <div style={{
              padding: '0 16px 6px 16px',
              fontSize: '11px',
              fontWeight: 600,
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {group.label}
            </div>

            {group.items.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = editingThreadId === thread.id;
              const isHovered = hoveredThreadId === thread.id;
              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectThread(thread.id);
                    }
                  }}
                  onMouseEnter={() => setHoveredThreadId(thread.id)}
                  onMouseLeave={() => setHoveredThreadId((current) => current === thread.id ? null : current)}
                  style={{
                    margin: '2px 8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    backgroundColor: isActive
                      ? 'var(--vscode-list-activeSelectionBackground)'
                      : isHovered
                        ? 'var(--vscode-list-hoverBackground)'
                        : 'transparent',
                    color: isActive
                      ? 'var(--vscode-list-activeSelectionForeground)'
                      : 'var(--vscode-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Input
                          value={editTitle}
                          onChange={(_, data) => setEditTitle(data.value)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              event.stopPropagation();
                              saveRename(thread.id);
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              event.stopPropagation();
                              cancelRenaming();
                            }
                          }}
                          style={{ height: '24px', fontSize: '13px', minWidth: 0, flex: 1 }}
                          autoFocus
                        />
                        <Button
                          appearance="transparent"
                          icon={<Checkmark24Regular />}
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            saveRename(thread.id);
                          }}
                        />
                        <Button
                          appearance="transparent"
                          icon={<Dismiss24Regular />}
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelRenaming();
                          }}
                        />
                      </div>
                    ) : (
                      <Text truncate style={{ fontSize: '13px' }}>
                        {thread.title || 'Untitled Chat'}
                      </Text>
                    )}
                  </div>

                  {!isEditing && (
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button
                          appearance="transparent"
                          icon={<MoreHorizontal24Regular />}
                          size="small"
                          onClick={(event) => event.stopPropagation()}
                          style={{ opacity: isActive || isHovered ? 1 : 0.65 }}
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            icon={<Edit24Regular />}
                            onClick={(event) => {
                              event.stopPropagation();
                              startRenaming(thread.id, thread.title);
                            }}
                          >
                            Rename
                          </MenuItem>
                          <MenuItem
                            icon={<ArrowDownload24Regular />}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleExport(thread.id);
                            }}
                          >
                            Export JSON
                          </MenuItem>
                          <MenuItem
                            icon={<Delete24Regular />}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(thread.id);
                            }}
                          >
                            Delete
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
