import React from 'react';
import { Button, Textarea, Label, Spinner } from '@fluentui/react-components';
import { PlayRegular, CopyRegular } from '@fluentui/react-icons';

interface AgentInputProps {
  query: string;
  onQueryChange: (val: string) => void;
  isRunning: boolean;
  onRun: () => void;
  lastOutputPath?: string;
  lastFileCount?: number;
  onCopyLastOutput: () => void;
}

export const AgentInput: React.FC<AgentInputProps> = ({
  query,
  onQueryChange,
  isRunning,
  onRun,
  lastOutputPath,
  lastFileCount,
  onCopyLastOutput
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Label weight="semibold">Ask the Agent</Label>
      <Textarea
        placeholder="e.g., 'Package all auth logic excluding tests'"
        value={query}
        onChange={(e, data) => onQueryChange(data.value)}
        rows={4}
      />
      <Button
        appearance="primary"
        icon={isRunning ? <Spinner size="tiny"/> : <PlayRegular />}
        disabled={isRunning || !query}
        onClick={onRun}
      >
        {isRunning ? 'Agent Working...' : 'Run Agent'}
      </Button>

      {/* Copy Button - appears after successful run */}
      {lastOutputPath && !isRunning && (
        <Button
          appearance="subtle"
          icon={<CopyRegular />}
          onClick={onCopyLastOutput}
          style={{ width: '100%' }}
          title={`Copy generated file (${lastFileCount} files packaged)`}
        >
          Copy Generated File ({lastFileCount} files)
        </Button>
      )}
    </div>
  );
};
