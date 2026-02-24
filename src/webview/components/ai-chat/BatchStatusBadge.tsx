import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';

export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface BatchStatusBadgeProps {
  status: BatchStatus;
  count?: number;
}

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
  },
  pending: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteYellowForeground1,
    border: `1px solid ${tokens.colorPaletteYellowBorder1}`,
  },
  processing: {
    backgroundColor: tokens.colorPaletteBlueBorderActive,
    color: tokens.colorNeutralForegroundOnBrand,
    border: `1px solid ${tokens.colorPaletteBlueBorderActive}`,
  },
  completed: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  failed: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
  },
  cancelled: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

const statusConfig: Record<BatchStatus, { icon: string; label: string }> = {
  pending: { icon: '🔵', label: 'Batch pending' },
  processing: { icon: '⏳', label: 'Processing' },
  completed: { icon: '✅', label: 'Completed' },
  failed: { icon: '❌', label: 'Failed' },
  cancelled: { icon: '⚪', label: 'Cancelled' },
};

export const BatchStatusBadge: React.FC<BatchStatusBadgeProps> = ({ status, count }) => {
  const styles = useStyles();
  const config = statusConfig[status] || statusConfig.pending;
  const statusClass = styles[status] || styles.pending;

  return (
    <span className={`${styles.badge} ${statusClass}`}>
      <span>{config.icon}</span>
      <Text size={200} weight="semibold">
        {config.label}
        {count !== undefined && count > 0 ? ` (${count})` : ''}
      </Text>
    </span>
  );
};
