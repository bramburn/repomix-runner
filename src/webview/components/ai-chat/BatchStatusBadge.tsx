import React from 'react';
import type { PackageStatus } from './packageTypes.js';

const STATUS_STYLES: Record<PackageStatus, { label: string; color: string; background: string }> = {
  draft: { label: 'Draft', color: '#9a6700', background: '#fff8c5' },
  pending: { label: 'Approved', color: '#1a7f37', background: '#dafbe1' },
  submitted: { label: 'Submitted', color: '#0969da', background: '#ddf4ff' },
  processing: { label: 'Processing', color: '#0969da', background: '#ddf4ff' },
  completed: { label: 'Completed', color: '#1a7f37', background: '#dafbe1' },
  failed: { label: 'Failed', color: '#cf222e', background: '#ffebe9' },
  cancelled: { label: 'Cancelled', color: '#57606a', background: '#f6f8fa' },
};

interface BatchStatusBadgeProps {
  status: PackageStatus;
}

export const BatchStatusBadge: React.FC<BatchStatusBadgeProps> = ({ status }) => {
  const style = STATUS_STYLES[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        color: style.color,
        background: style.background,
      }}
    >
      {style.label}
    </span>
  );
};
