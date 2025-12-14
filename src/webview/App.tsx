import React, { useEffect, useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Button,
  Text,
  Spinner,
} from '@fluentui/react-components';
import { vscode } from './vscode-api.js';

interface Bundle {
  id: string;
  name: string;
  description?: string;
  files: string[];
}

interface BundleItemProps {
  bundle: Bundle;
  state: 'idle' | 'queued' | 'running';
  onRun: (id: string) => void;
  onCancel: (id: string) => void;
}

const BundleItem: React.FC<BundleItemProps> = ({ bundle, state, onRun, onCancel }) => {
  // State logic from main
  const isRunning = state === 'running';
  const isQueued = state === 'queued';
  const disabled = isRunning || isQueued;

  // UI/Tooltip logic from improve-bundle-ui
  const fileCount = bundle.files?.length || 0;

  const getTooltipContent = () => {
    if (fileCount === 0) return 'No files selected';

    const maxFilesToShow = 10;
    const filesToShow = bundle.files.slice(0, maxFilesToShow);
    const remaining = fileCount - maxFilesToShow;

    let content = `Run repomix on ${fileCount} files:\n${filesToShow.join('\n')}`;
    if (remaining > 0) {
      content += `\n...and ${remaining} more`;
    }
    return content;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div style={{ flexGrow: 1, marginRight: '10px', overflow: 'hidden' }}>
        <Text
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block'
          }}
          title={bundle.name}
        >
          {bundle.name}
        </Text>
        <Text size={200} style={{ opacity: 0.7 }}>
          {fileCount} files
        </Text>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
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

        <Button
          appearance="primary"
          disabled={disabled}
          onClick={() => onRun(bundle.id)}
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
        </Button>
      </div>
    </div>
  );
};

export const App = () => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleStates, setBundleStates] = useState<Record<string, 'idle' | 'queued' | 'running'>>({});
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'updateBundles':
          setBundles(message.bundles);
          break;
        case 'executionStateChange':
          setBundleStates(prev => ({
            ...prev,
            [message.bundleId]: message.status
          }));
          break;
        case 'updateVersion':
          setVersion(message.version);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial data
    vscode.postMessage({ command: 'webviewLoaded' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRun = (id: string) => {
    vscode.postMessage({ command: 'runBundle', bundleId: id });
  };

  const handleCancel = (id: string) => {
    vscode.postMessage({ command: 'cancelBundle', bundleId: id });
  };

  return (
    <FluentProvider theme={webDarkTheme} style={{ background: 'transparent' }}>
      <div
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          height: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <Text size={500} weight="semibold" style={{ marginBottom: '10px' }}>
          Repomix Runner Control Panel
        </Text>

        {bundles.length === 0 ? (
          <Text>No bundles found.</Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {bundles.map((bundle) => (
              <BundleItem
                key={bundle.id}
                bundle={bundle}
                state={bundleStates[bundle.id] || 'idle'}
                onRun={handleRun}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}

        {version && (
          <div
            style={{
              marginTop: 'auto',
              alignSelf: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              backgroundColor: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-widget-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text size={100} style={{ opacity: 0.7 }}>
              v{version}
            </Text>
          </div>
        )}
      </div>
    </FluentProvider>
  );
};
