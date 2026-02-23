import React from 'react';
import { Button, Text } from '@fluentui/react-components';
import { BatchStatusBadge } from './BatchStatusBadge.js';
import { CostEstimator } from './CostEstimator.js';
import type { PackageSummary } from './packageTypes.js';

interface PackageCardProps {
  pkg: PackageSummary;
  onPreview: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onSend: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onStatus: () => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  pkg,
  onPreview,
  onApprove,
  onUnapprove,
  onSend,
  onDelete,
  onCancel,
  onStatus,
}) => {
  return (
    <div
      style={{
        border: '1px solid var(--vscode-editorWidget-border)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <Text weight="semibold">{pkg.goal || '(untitled package)'}</Text>
        <BatchStatusBadge status={pkg.status} />
      </div>
      <Text block size={200} style={{ opacity: 0.8, marginTop: '4px' }}>
        Thread: {pkg.threadId ?? 'n/a'} | Type: {pkg.packageType}
      </Text>
      <Text block size={200} style={{ opacity: 0.8 }}>
        Files: {pkg.contextFileCount} | Est. tokens: {pkg.estimatedTokens.toLocaleString()}
      </Text>
      <div style={{ marginTop: '6px' }}>
        <CostEstimator inputTokens={pkg.estimatedTokens} />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        <Button onClick={onPreview}>Preview</Button>
        {pkg.status === 'draft' && (
          <>
            <Button appearance="primary" onClick={onApprove}>
              Approve
            </Button>
            <Button onClick={onDelete}>Delete</Button>
          </>
        )}
        {pkg.status === 'pending' && (
          <>
            <Button appearance="primary" onClick={onSend}>
              Send
            </Button>
            <Button onClick={onUnapprove}>Unapprove</Button>
          </>
        )}
        {(pkg.status === 'submitted' || pkg.status === 'processing') && (
          <>
            <Button onClick={onStatus}>View Status</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </>
        )}
        {pkg.status === 'completed' && <Button onClick={onPreview}>View Response</Button>}
        {(pkg.status === 'failed' || pkg.status === 'cancelled') && (
          <>
            <Button onClick={onPreview}>View Error</Button>
            <Button onClick={onDelete} disabled={pkg.status !== 'failed'}>
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
