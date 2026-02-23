import React from 'react';
import { Button, Badge } from '@fluentui/react-components';

interface MessageQueueIndicatorProps {
  queueLength: number;
  isProcessing: boolean;
  onTogglePanel: () => void;
}

export const MessageQueueIndicator: React.FC<MessageQueueIndicatorProps> = ({
  queueLength,
  isProcessing,
  onTogglePanel,
}) => {
  return (
    <Button
      appearance="subtle"
      onClick={onTogglePanel}
      style={{
        minWidth: '36px',
        height: '36px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}
      title="Queue status"
    >
      <span style={{ fontSize: '14px' }}>{isProcessing ? '●' : '○'}</span>
      <Badge appearance="filled" color={isProcessing ? 'danger' : 'brand'}>
        {queueLength}
      </Badge>
    </Button>
  );
};
