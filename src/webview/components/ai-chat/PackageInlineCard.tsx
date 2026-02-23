import React from 'react';
import { Button, Text } from '@fluentui/react-components';
import type { PackagePayload } from './packageTypes.js';
import { CostEstimator } from './CostEstimator.js';

interface PackageInlineCardProps {
  packageId?: string;
  payload: PackagePayload;
  estimatedTokens: number;
  onViewPackages: () => void;
  onQuickSend: () => void;
  onReject: () => void;
}

export const PackageInlineCard: React.FC<PackageInlineCardProps> = ({
  payload,
  estimatedTokens,
  onViewPackages,
  onQuickSend,
  onReject,
}) => {
  return (
    <div
      style={{
        border: '1px solid var(--vscode-editorWidget-border)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        background: 'var(--vscode-editorWidget-background)',
      }}
    >
      <Text weight="semibold">Package Ready</Text>
      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
        <Text block>Goal: {payload.goal}</Text>
        <Text block>Type: {payload.outputInstruction}</Text>
        <Text block>
          Context: {payload.contextFiles.length} files ({estimatedTokens.toLocaleString()} tokens)
        </Text>
      </div>
      <CostEstimator inputTokens={estimatedTokens} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <Button onClick={onViewPackages}>View in Packages Tab</Button>
        <Button appearance="primary" onClick={onQuickSend}>
          Quick Send
        </Button>
        <Button onClick={onReject}>Reject</Button>
      </div>
    </div>
  );
};
