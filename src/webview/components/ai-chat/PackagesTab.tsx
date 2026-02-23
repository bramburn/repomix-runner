import React, { useEffect, useMemo, useState } from 'react';
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

export const PackagesTab: React.FC = () => {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [preview, setPreview] = useState<PackagePreviewData | null>(null);

  const requestList = () => {
    vscode.postMessage({
      command: 'listPackages',
      status: statusFilter === 'all' ? undefined : statusFilter,
      packageType: typeFilter === 'all' ? undefined : typeFilter,
    });
  };

  useEffect(() => {
    requestList();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'packageList' && Array.isArray(message.packages)) {
        setPackages(message.packages as PackageSummary[]);
      }
      if (message?.command === 'packagePreview' && message.package) {
        setPreview(message.package as PackagePreviewData);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

  const onAction = (command: string, packageId?: string) => {
    vscode.postMessage(packageId ? { command, packageId } : { command });
    requestList();
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
          Send All Approved
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <select
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
            padding: '16px',
          }}
        >
          <Text>No packages found for the selected filters.</Text>
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
        />
      ))}

      {preview && (
        <PackagePreview
          preview={preview}
          onClose={() => setPreview(null)}
          onSaveDraft={(data) =>
            vscode.postMessage({
              command: 'updatePackageDraft',
              packageId: preview.id,
              goal: data.goal,
              outputInstruction: data.outputInstruction,
            })
          }
        />
      )}
    </div>
  );
};
