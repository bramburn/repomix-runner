import React from 'react';
import { Button, Text, Spinner } from '@fluentui/react-components';
import { CopyRegular } from '@fluentui/react-icons';
import { LongPressButton } from './LongPressButton.js';
import { BundleItemProps } from '../types.js';
import { useStyles } from '../styles.js';

export const BundleItem: React.FC<BundleItemProps> = ({ bundle, state, onRun, onCancel, onCopy }) => {
  const styles = useStyles();
  // State logic from main
  const isRunning = state === 'running';
  const isQueued = state === 'queued';
  const disabled = isRunning || isQueued;

  // UI/Tooltip logic
  const fileCount = bundle.stats?.files || 0;
  const folderCount = bundle.stats?.folders || 0;

  const getTooltipContent = () => {
    if ((bundle.files?.length || 0) === 0) return 'No files selected';

    const maxFilesToShow = 10;
    const filesToShow = (bundle.files || []).slice(0, maxFilesToShow);
    const remaining = (bundle.files?.length || 0) - maxFilesToShow;

    let content = `Run repomix on:\n${filesToShow.join('\n')}`;
    if (remaining > 0) {
      content += `\n...and ${remaining} more`;
    }
    content += '\n(Hold to compress)';
    return content;
  };

  const sanitizedDescription = bundle.description
    ? bundle.description.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    : undefined;

  return (
    <div className={styles.bundleItem}>
      <div className={styles.bundleInfo}>
        <Text
          className={styles.textEllipsis}
          title={bundle.name}
        >
          {bundle.name}
        </Text>
        {bundle.description && (
          <Text
            size={200}
            style={{
              opacity: 0.7,
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={sanitizedDescription}
          >
            {bundle.description}
          </Text>
        )}
        <Text size={200} style={{ opacity: 0.7 }}>
          {fileCount} files, {folderCount} folders
        </Text>
      </div>
      <div className={styles.buttonsContainer}>
        <Button
          appearance="subtle"
          icon={<CopyRegular />}
          onClick={() => onCopy(bundle.id)}
          disabled={disabled}
          title="Copy Output File to Clipboard"
          style={{ minWidth: '32px' }}
        />

        {disabled ? (
          <Button
            appearance="secondary"
            onClick={() => onCancel(bundle.id)}
            style={{ minWidth: '80px', color: 'var(--vscode-errorForeground)' }}
            title="Cancel execution"
          >
            Cancel
          </Button>
        ) : null}

        <LongPressButton
          appearance="primary"
          disabled={disabled}
          onClick={() => onRun(bundle.id, false)}
          onLongPress={() => onRun(bundle.id, true)}
          style={{ minWidth: '100px' }}
          title={getTooltipContent()}
        >
          {isRunning ? (
            <>
              <Spinner size="tiny" style={{ marginRight: '8px' }} />
              Running...
            </>
          ) : isQueued ? (
            'Queued...'
          ) : (
            'Generate'
          )}
        </LongPressButton>
      </div>
    </div>
  );
};
