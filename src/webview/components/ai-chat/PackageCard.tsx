import React from 'react';
import { Button, Text } from '@fluentui/react-components';
import { BatchStatusBadge } from './BatchStatusBadge.js';
import { CostEstimator } from './CostEstimator.js';
import type { PackageSummary } from './packageTypes.js';
import type { BatchStatus } from './BatchStatusBadge.js';

interface PackageCardProps {
  pkg: PackageSummary;
  onPreview: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onSend: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onStatus: () => void;
  onRetry: () => void;
  onApplyToThread: () => void;
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
  onRetry,
  onApplyToThread,
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
        <BatchStatusBadge status={pkg.status as BatchStatus} />
      </div>
      <Text block size={200} style={{ opacity: 0.8, marginTop: '4px' }}>
        Thread: {pkg.threadId ?? 'n/a'} | Type: {pkg.packageType}
      </Text>
      <Text block size={200} style={{ opacity: 0.8 }}>
        Files: {pkg.contextFileCount} | Est. tokens: {pkg.estimatedTokens.toLocaleString()}
      </Text>
      {pkg.errorMessage && (pkg.status === 'failed' || pkg.status === 'cancelled') && (
        <Text
          block
          size={200}
          style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}
        >
          Error: {pkg.errorMessage}
        </Text>
      )}
      <div style={{ marginTop: '6px' }}>
        <CostEstimator inputTokens={pkg.estimatedTokens} />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
        {/* --- Draft actions --- */}
        {pkg.status === 'draft' && (
          <>
            <Button onClick={onPreview}>Preview</Button>
            <Button appearance="primary" onClick={onApprove}>
              Approve
            </Button>
            <Button onClick={onDelete}>Delete</Button>
          </>
        )}

        {/* --- Approved / Pending actions --- */}
        {pkg.status === 'pending' && (
          <>
            <Button onClick={onPreview}>Preview</Button>
            <Button appearance="primary" onClick={onSend}>
              Send
            </Button>
            <Button onClick={onUnapprove}>Unapprove</Button>
          </>
        )}

        {/* --- Submitted / Processing actions --- */}
        {(pkg.status === 'submitted' || pkg.status === 'processing') && (
          <>
            <Button onClick={onStatus}>View Status</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </>
        )}

        {/* --- Completed actions --- */}
        {pkg.status === 'completed' && (
          <>
            <Button onClick={onPreview}>View Response</Button>
            {pkg.threadId && (
              <Button appearance="primary" onClick={onApplyToThread}>
                Apply to Thread
              </Button>
            )}
          </>
        )}

        {/* --- Failed actions --- */}
        {pkg.status === 'failed' && (
          <>
            <Button onClick={onPreview}>View Error</Button>
            <Button appearance="primary" onClick={onRetry}>
              Retry
            </Button>
            <Button onClick={onDelete}>Delete</Button>
          </>
        )}

        {/* --- Cancelled actions --- */}
        {pkg.status === 'cancelled' && (
          <Button onClick={onPreview}>View Details</Button>
        )}
      </div>
    </div>
  );
};
