import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { vscode } from '../../vscode-api.js';
import { PackageCard } from './PackageCard.js';
import { PackagePreview } from './PackagePreview.js';
import type { PackagePreviewData, PackageStatus, PackageSummary, PackageType } from './packageTypes.js';

const STATUS_PRIORITY: Record<PackageStatus, number> = {
  draft: 0,
  pending: 1,
  submitted: 2,
  processing: 2,
  completed: 3,
  failed: 4,
  cancelled: 5,
};

type StatusFilter = 'all' | PackageStatus;
type TypeFilter = 'all' | PackageType;

export interface PackagesTabProps {
  /** Navigate to the Chat tab for a specific thread (e.g. "Apply to Thread"). */
  onNavigateToThread?: (threadId: string) => void;
}

export const PackagesTab: React.FC<PackagesTabProps> = ({ onNavigateToThread }) => {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [preview, setPreview] = useState<PackagePreviewData | null>(null);

  const requestList = useCallback(() => {
    vscode.postMessage({
      command: 'listPackages',
      status: statusFilter === 'all' ? undefined : statusFilter,
      packageType: typeFilter === 'all' ? undefined : typeFilter,
    });
  }, [statusFilter, typeFilter]);

  // Re-fetch whenever filters change
  useEffect(() => {
    requestList();
  }, [requestList]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'packageList' && Array.isArray(message.packages)) {
        setPackages(message.packages as PackageSummary[]);
      }
      if (message?.command === 'packagePreview' && message.package) {
        setPreview(message.package as PackagePreviewData);
      }
      // Listen for batch status changes and refresh the list
      if (message?.command === 'batchStatus') {
        requestList();
      }
      // Listen for bulk send results
      if (message?.command === 'packagesBulkSendResult') {
        requestList();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [requestList]);

  const filtered = useMemo(
    () =>
      [...packages].sort((a, b) => {
        const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }
        return b.createdAt - a.createdAt;
      }),
    [packages]
  );

  const approvedCount = filtered.filter((pkg) => pkg.status === 'pending').length;

  /**
   * Fire-and-forget: send a command to the extension.
   * The extension will reply with an updated `packageList` message,
   * so we do NOT need to call requestList() here.
   */
  const onAction = (command: string, packageId?: string) => {
    vscode.postMessage(packageId ? { command, packageId } : { command });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text size={500} weight="semibold">
          Packages
        </Text>
        <Button
          appearance="primary"
          disabled={approvedCount === 0}
          onClick={() => onAction('sendAllApproved')}
        >
          Send All Approved ({approvedCount})
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ padding: '6px', borderRadius: '6px' }}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Approved</option>
          <option value="submitted">Submitted</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          style={{ padding: '6px', borderRadius: '6px' }}
        >
          <option value="all">All types</option>
          <option value="plan">Plan</option>
          <option value="code_change">Code Change</option>
          <option value="code_review">Code Review</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div
          style={{
            border: '1px dashed var(--vscode-editorWidget-border)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <Text weight="semibold" block>
            No packages yet
          </Text>
          <Text block size={200} style={{ opacity: 0.8, marginTop: '4px' }}>
            Packages appear here when you complete the context-gathering phase in a chat thread.
            Each package can be reviewed, approved, and sent to the Anthropic Batch API.
          </Text>
        </div>
      )}

      {filtered.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          onPreview={() => onAction('getPackagePreview', pkg.id)}
          onApprove={() => onAction('approvePackage', pkg.id)}
          onUnapprove={() => onAction('unapprovePackage', pkg.id)}
          onSend={() => onAction('sendPackage', pkg.id)}
          onDelete={() => onAction('deletePackage', pkg.id)}
          onCancel={() => onAction('cancelBatch', pkg.id)}
          onStatus={() => onAction('viewBatchStatus', pkg.id)}
          onRetry={() => onAction('retryPackage', pkg.id)}
          onApplyToThread={() => {
            if (pkg.threadId && onNavigateToThread) {
              onNavigateToThread(pkg.threadId);
            }
          }}
        />
      ))}

      {preview && (
        <PackagePreview
          preview={preview}
          onClose={() => setPreview(null)}
          onSaveDraft={(data) => {
            vscode.postMessage({
              command: 'updatePackageDraft',
              packageId: preview.id,
              goal: data.goal,
              outputInstruction: data.outputInstruction,
            });
          }}
        />
      )}
    </div>
  );
};
