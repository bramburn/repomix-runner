import React from 'react';
import { Button, Text, Spinner } from '@fluentui/react-components';
import { CopyRegular } from '@fluentui/react-icons';
import { LongPressButton } from './LongPressButton.js';
import { DefaultRepomixItemProps } from '../types.js';

export const DefaultRepomixItem: React.FC<DefaultRepomixItemProps> = ({ state, info, onRun, onCancel, onCopy }) => {
  const isRunning = state === 'running';
  const isQueued = state === 'queued';
  const disabled = isRunning || isQueued;

  // Extract filename for display
  const outputFileName = info.outputFilePath ? info.outputFilePath.split(/[/\\]/).pop() : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 12px',
        marginBottom: '10px',
        backgroundColor: 'var(--vscode-button-secondaryBackground)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div style={{ flexGrow: 1, marginRight: '10px' }}>
        <Text
          weight="semibold"
          style={{
            display: 'block',
            color: 'var(--vscode-button-secondaryForeground)'
          }}
        >
          Run Default Repomix
        </Text>
        <Text size={200} style={{ opacity: 0.8, color: 'var(--vscode-button-secondaryForeground)' }}>
          Run on entire repository
        </Text>
        {info.outputFilePath && (
          <Text size={100} style={{ opacity: 0.6, color: 'var(--vscode-button-secondaryForeground)', display: 'block' }} title={info.outputFilePath}>
            Output: {outputFileName}
          </Text>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          appearance="subtle"
          icon={<CopyRegular />}
          onClick={onCopy}
          disabled={disabled}
          title="Copy Default Output to Clipboard"
          style={{ minWidth: '32px', color: 'var(--vscode-button-secondaryForeground)' }}
        />

        {disabled ? (
          <Button
            appearance="secondary"
            onClick={onCancel}
            style={{ minWidth: '80px', color: 'var(--vscode-errorForeground)', backgroundColor: 'var(--vscode-editor-background)' }}
            title="Cancel execution"
          >
            Cancel
          </Button>
        ) : null}

        <LongPressButton
          appearance="primary"
          disabled={disabled}
          onClick={() => onRun(false)}
          onLongPress={() => onRun(true)}
          style={{ minWidth: '100px' }}
          title="Run Repomix on the entire repository with default settings (Hold to compress)"
        >
          {isRunning ? (
            <>
              <Spinner size="tiny" style={{ marginRight: '8px' }} />
              Running...
            </>
          ) : isQueued ? (
            'Queued...'
          ) : (
            'Run'
          )}
        </LongPressButton>
      </div>
    </div>
  );
};
