import React, { useState, useRef, useEffect } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { MessageQueueIndicator } from './MessageQueueIndicator';
import { QueuePanel } from './QueuePanel';
import type { QueueEntry } from '../../../chat/queue/types';

interface ChatInputProps {
  onSend: (text: string) => void;
  onForceSend?: (text: string) => void;
  onStop?: () => void;
  onCancelQueued?: (entryId: string) => void;
  onClearQueue?: () => void;
  disabled?: boolean;
  queueLength?: number;
  isProcessing?: boolean;
  queuedEntries?: QueueEntry[];
  currentlyProcessing?: QueueEntry | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onForceSend,
  onStop,
  onCancelQueued,
  onClearQueue,
  disabled = false,
  queueLength = 0,
  isProcessing = false,
  queuedEntries = [],
  currentlyProcessing = null,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on content, with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (inputValue.trim()) {
      onSend(inputValue.trim());
      setInputValue('');
    }
  };

  const handleForceSend = () => {
    if (inputValue.trim() && onForceSend) {
      onForceSend(inputValue.trim());
      setInputValue('');
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const handleCancelEntry = (entryId: string) => {
    if (onCancelQueued) {
      onCancelQueued(entryId);
    }
  };

  const handleClearQueue = () => {
    if (onClearQueue) {
      onClearQueue();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasQueueUI = queueLength > 0 || isProcessing;

  return (
    <div
      style={{
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '10px',
      }}
    >
      {/* Queue Panel */}
      {showQueuePanel && (
        <QueuePanel
          entries={queuedEntries}
          currentlyProcessing={currentlyProcessing}
          onCancelEntry={handleCancelEntry}
          onClearQueue={handleClearQueue}
          isVisible={showQueuePanel}
          onClose={() => setShowQueuePanel(false)}
        />
      )}

      {/* Input Area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        {/* Queue Indicator */}
        {hasQueueUI && (
          <MessageQueueIndicator
            queueLength={queueLength}
            isProcessing={isProcessing}
            onTogglePanel={() => setShowQueuePanel(!showQueuePanel)}
          />
        )}

        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minHeight: '24px',
            maxHeight: '150px',
            padding: '8px 0',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'white',
            fontSize: '14px',
            lineHeight: '1.5',
            resize: 'none',
            fontFamily: 'inherit',
          }}
          placeholder="Type a message..."
          rows={1}
        />

        {/* Stop Button (visible when processing) */}
        {isProcessing && onStop && (
          <Tooltip content="Stop" relationship="label">
            <Button
              appearance="secondary"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: '16px', height: '16px' }}
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              }
              onClick={handleStop}
              style={{
                minWidth: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#ef4444',
                border: 'none',
              }}
            />
          </Tooltip>
        )}

        {/* Force Send Button */}
        {onForceSend && (
          <Tooltip content="Force Send (skip queue)" relationship="label">
            <Button
              appearance="secondary"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: '16px', height: '16px' }}
                >
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              }
              onClick={handleForceSend}
              disabled={disabled || !inputValue.trim()}
              style={{
                minWidth: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#f59e0b',
                border: 'none',
              }}
            />
          </Tooltip>
        )}

        {/* Normal Send Button */}
        <Button
          appearance="primary"
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 512 512"
              style={{ width: '16px', height: '16px', fill: 'white' }}
            >
              <path d="M0 288L512 0 448 480 271.8 404.5 208 512l-48-16V416 384L384 160 133 345 0 288z" />
            </svg>
          }
          onClick={handleSend}
          disabled={disabled || !inputValue.trim()}
          style={{
            minWidth: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            border: 'none',
          }}
        />
      </div>
    </div>
  );
};
