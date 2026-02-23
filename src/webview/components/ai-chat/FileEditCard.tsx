import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardPreview,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Edit20Regular,
  Delete20Regular,
  Checkmark20Regular,
  Dismiss20Regular,
  Eye20Regular,
} from '@fluentui/react-icons';

export interface FileEditCardProps {
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  preview: string;
  lineCount: number;
  status: 'pending' | 'applied' | 'failed' | 'skipped';
  error?: string;
  onApply: (filePath: string) => void;
  onSkip: (filePath: string) => void;
  onViewDiff: (filePath: string) => void;
}

const useStyles = makeStyles({
  card: {
    marginBottom: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
  },
  fileContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
    minWidth: 0,
  },
  fileIcon: {
    flexShrink: 0,
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    flex: 1,
    minWidth: 0,
  },
  filePath: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileMeta: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  content: {
    padding: tokens.spacingVerticalS,
    paddingTop: 0,
  },
  preview: {
    backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    maxHeight: '200px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
  },
});

export const FileEditCard: React.FC<FileEditCardProps> = ({
  filePath,
  action,
  preview,
  lineCount,
  status,
  error,
  onApply,
  onSkip,
  onViewDiff,
}) => {
  const styles = useStyles();

  const getActionIcon = () => {
    switch (action) {
      case 'create':
        return <Add20Regular />;
      case 'edit':
        return <Edit20Regular />;
      case 'delete':
        return <Delete20Regular />;
    }
  };

  const getActionColor = () => {
    switch (action) {
      case 'create':
        return tokens.colorPaletteGreenForeground1;
      case 'edit':
        return tokens.colorPaletteBlueForeground2;
      case 'delete':
        return tokens.colorPaletteRedForeground1;
    }
  };

  const getStatusAppearance = (): 'success' | 'warning' | 'subtle' | 'danger' => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'applied':
        return 'success';
      case 'failed':
        return 'danger';
      case 'skipped':
        return 'subtle';
    }
  };

  const getStatusLabel = () => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <Card className={styles.card}>
      <CardHeader
        className={styles.header}
        header={
          <div className={styles.fileContainer}>
            <CardPreview className={styles.fileIcon} style={{ color: getActionColor() }}>
              {getActionIcon()}
            </CardPreview>
            <div className={styles.fileInfo}>
              <Text className={styles.filePath} title={filePath}>
                {filePath}
              </Text>
              <div className={styles.fileMeta}>
                <Badge appearance="outline" color="subtle">
                  {action}
                </Badge>
                <Text>{lineCount} lines</Text>
                <Badge appearance="outline" color={getStatusAppearance()}>
                  {getStatusLabel()}
                </Badge>
              </div>
            </div>
          </div>
        }
        action={
          status === 'pending' ? (
            <div className={styles.actions}>
              <Button
                icon={<Checkmark20Regular />}
                onClick={() => onApply(filePath)}
                title="Apply this edit"
                size="small"
                appearance="subtle"
              >
                Apply
              </Button>
              <Button
                icon={<Dismiss20Regular />}
                onClick={() => onSkip(filePath)}
                title="Skip this edit"
                size="small"
                appearance="subtle"
              >
                Skip
              </Button>
              <Button
                icon={<Eye20Regular />}
                onClick={() => onViewDiff(filePath)}
                title="View full diff"
                size="small"
                appearance="subtle"
              />
            </div>
          ) : null
        }
      />
      <div className={styles.content}>
        <div className={styles.preview}>
          {preview}
          {lineCount > 20 && (
            <Text size={200} color="neutralForeground3">
              {'\n'}... ({lineCount - 20} more lines)
            </Text>
          )}
        </div>
        {error && status === 'failed' && (
          <div className={styles.error}>
            <Text weight="semibold">Error:</Text>
            <Text>{error}</Text>
          </div>
        )}
      </div>
    </Card>
  );
};
