import React from 'react';
import { Button, Text, Tooltip } from '@fluentui/react-components';
import { Navigation24Regular, Add24Regular, Document24Regular } from '@fluentui/react-icons';

interface ChatHeaderProps {
  title: string;
  planPath?: string;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onOpenPlan: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  planPath,
  isHistoryOpen,
  onToggleHistory,
  onNewChat,
  onOpenPlan,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: 'var(--vscode-editor-background)',
      minHeight: '56px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <Tooltip content={isHistoryOpen ? 'Hide History' : 'Show History'} relationship="label">
          <Button
            appearance="subtle"
            icon={<Navigation24Regular />}
            onClick={onToggleHistory}
            aria-label="Toggle History"
          />
        </Tooltip>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Text
            weight="semibold"
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '260px',
            }}
          >
            {title || 'New Chat'}
          </Text>
          {planPath && (
            <Text
              style={{
                fontSize: '11px',
                opacity: 0.65,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '260px',
              }}
              title={planPath}
            >
              {planPath}
            </Text>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Tooltip content={planPath ? 'Open Plan' : 'No active plan path'} relationship="label">
          <Button
            appearance="subtle"
            icon={<Document24Regular />}
            size="small"
            onClick={onOpenPlan}
            disabled={!planPath}
          >
            Plan
          </Button>
        </Tooltip>
        <Tooltip content="New Chat" relationship="label">
          <Button
            appearance="primary"
            icon={<Add24Regular />}
            size="small"
            onClick={onNewChat}
          >
            New
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
