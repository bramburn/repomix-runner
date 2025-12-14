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
}

interface BundleItemProps {
  bundle: Bundle;
  state: 'idle' | 'queued' | 'running';
  onRun: (id: string) => void;
}

const BundleItem: React.FC<BundleItemProps> = ({ bundle, state, onRun }) => {
  const isRunning = state === 'running';
  const isQueued = state === 'queued';
  const disabled = isRunning || isQueued;

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
      <Text
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flexGrow: 1,
          marginRight: '10px',
        }}
        title={bundle.name}
      >
        {bundle.name}
      </Text>
      <Button
        appearance="primary"
        disabled={disabled}
        onClick={() => onRun(bundle.id)}
        style={{ minWidth: '100px' }}
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
  );
};

export const App = () => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleStates, setBundleStates] = useState<Record<string, 'idle' | 'queued' | 'running'>>({});

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
              />
            ))}
          </div>
        )}
      </div>
    </FluentProvider>
  );
};
