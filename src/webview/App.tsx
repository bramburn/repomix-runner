import React, { useEffect, useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Button,
  Text,
  Spinner,
  TabList,
  Tab,
  Textarea,
  Input,
  Label,
  Divider,
} from '@fluentui/react-components';
import { vscode } from './vscode-api.js';
import { CopyRegular, PlayRegular, SaveRegular } from '@fluentui/react-icons';

// --- Interfaces ---

interface Bundle {
  id: string;
  name: string;
  description?: string;
  files: string[];
  outputFileExists?: boolean;
  outputFilePath?: string;
  stats?: {
    files: number;
    folders: number;
    totalSize: number;
  };
}

interface DefaultRepomixInfo {
  outputFileExists: boolean;
  outputFilePath: string;
}

interface BundleItemProps {
  bundle: Bundle;
  state: 'idle' | 'queued' | 'running';
  onRun: (id: string) => void;
  onCancel: (id: string) => void;
  onCopy: (id: string) => void;
}

interface DefaultRepomixItemProps {
  state: 'idle' | 'queued' | 'running';
  info: DefaultRepomixInfo;
  onRun: () => void;
  onCancel: () => void;
  onCopy: () => void;
}

// --- Components ---

const AgentView = () => {
  const [query, setQuery] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    // Check if we have a key saved
    const handler = (event: MessageEvent) => {
      if (event.data.command === 'apiKeyStatus') {
        setHasKey(event.data.hasKey);
      }
      if (event.data.command === 'agentStateChange') {
        setIsRunning(event.data.status === 'running');
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'checkApiKey' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRun = () => {
    if (!query) return;
    vscode.postMessage({ command: 'runSmartAgent', query });
  };

  const handleSaveKey = () => {
    vscode.postMessage({ command: 'saveApiKey', apiKey });
    setApiKey(''); // Clear input for security
    setHasKey(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Label weight="semibold">Ask the Agent</Label>
        <Textarea
          placeholder="e.g., 'Package all auth logic excluding tests'"
          value={query}
          onChange={(e, data) => setQuery(data.value)}
          rows={4}
        />
        <Button
          appearance="primary"
          icon={isRunning ? <Spinner size="tiny"/> : <PlayRegular />}
          disabled={isRunning || !query}
          onClick={handleRun}
        >
          {isRunning ? 'Agent Working...' : 'Run Agent'}
        </Button>
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <Label weight="semibold">Configuration</Label>
        <Text size={200}>
           Status: {hasKey ? "✅ API Key Saved" : "⚠️ API Key Missing"}
        </Text>
        <div style={{ display: 'flex', gap: '5px' }}>
          <Input
            type="password"
            placeholder="Paste Gemini API Key"
            value={apiKey}
            onChange={(e, data) => setApiKey(data.value)}
            style={{ flexGrow: 1 }}
          />
          <Button icon={<SaveRegular />} onClick={handleSaveKey}>Save</Button>
        </div>
        <Text size={100} style={{opacity: 0.7}}>
          Key is stored securely in VS Code Secrets.
        </Text>
      </div>
    </div>
  );
};

const BundleItem: React.FC<BundleItemProps> = ({ bundle, state, onRun, onCancel, onCopy }) => {
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
          {fileCount} files, {folderCount} folders
        </Text>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {bundle.outputFileExists && !disabled && (
           <Button
             appearance="subtle"
             icon={<CopyRegular />}
             onClick={() => onCopy(bundle.id)}
             title="Copy Output File to Clipboard"
             style={{ minWidth: '32px' }}
           />
        )}

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

interface DefaultRepomixItemProps {
  state: 'idle' | 'queued' | 'running';
  info: DefaultRepomixInfo;
  onRun: () => void;
  onCancel: () => void;
  onCopy: () => void;
}

const DefaultRepomixItem: React.FC<DefaultRepomixItemProps> = ({ state, info, onRun, onCancel, onCopy }) => {
  const isRunning = state === 'running';
  const isQueued = state === 'queued';
  const disabled = isRunning || isQueued;

  // Extract filename for display
  const outputFileName = info.outputFilePath ? info.outputFilePath.split(/[/\\]/).pop() : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 12px',
        marginBottom: '10px',
        backgroundColor: 'var(--vscode-button-secondaryBackground)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div style={{ flexGrow: 1, marginRight: '10px' }}>
        <Text
          weight="semibold"
          style={{
            display: 'block',
            color: 'var(--vscode-button-secondaryForeground)'
          }}
        >
          Run Default Repomix
        </Text>
        <Text size={200} style={{ opacity: 0.8, color: 'var(--vscode-button-secondaryForeground)' }}>
          Run on entire repository
        </Text>
        {info.outputFilePath && (
          <Text size={100} style={{ opacity: 0.6, color: 'var(--vscode-button-secondaryForeground)', display: 'block' }} title={info.outputFilePath}>
            Output: {outputFileName}
          </Text>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {info.outputFileExists && !disabled && (
           <Button
             appearance="subtle"
             icon={<CopyRegular />}
             onClick={onCopy}
             title="Copy Default Output to Clipboard"
             style={{ minWidth: '32px', color: 'var(--vscode-button-secondaryForeground)' }}
           />
        )}

        {disabled ? (
          <Button
            appearance="secondary"
            onClick={onCancel}
            style={{ minWidth: '80px', color: 'var(--vscode-errorForeground)', backgroundColor: 'var(--vscode-editor-background)' }}
            title="Cancel execution"
          >
            Cancel
          </Button>
        ) : null}

        <Button
          appearance="primary"
          disabled={disabled}
          onClick={onRun}
          style={{ minWidth: '100px' }}
          title="Run Repomix on the entire repository with default settings"
        >
          {isRunning ? (
            <>
              <Spinner size="tiny" style={{ marginRight: '8px' }} />
              Running...
            </>
          ) : isQueued ? (
            'Queued...'
          ) : (
            'Run'
          )}
        </Button>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export const App = () => {
  const [selectedTab, setSelectedTab] = useState<string>('bundles');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleStates, setBundleStates] = useState<Record<string, 'idle' | 'queued' | 'running'>>({});
  const [version, setVersion] = useState<string>('');

  // Default Repomix State
  const [defaultRepomixState, setDefaultRepomixState] = useState<'idle' | 'queued' | 'running'>('idle');
  const [defaultRepomixInfo, setDefaultRepomixInfo] = useState<DefaultRepomixInfo>({ outputFileExists: false, outputFilePath: '' });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'updateBundles':
          setBundles(message.bundles);
          break;
        case 'updateDefaultRepomix':
           setDefaultRepomixInfo(message.data);
           break;
        case 'executionStateChange':
          if (message.bundleId === '__default__') {
             setDefaultRepomixState(message.status);
          } else {
             setBundleStates(prev => ({
               ...prev,
               [message.bundleId]: message.status
             }));
          }
          break;
        case 'updateVersion':
          setVersion(message.version);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
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

  const handleCopy = (id: string) => {
    vscode.postMessage({ command: 'copyBundleOutput', bundleId: id });
  };

  const handleRunDefault = () => {
     vscode.postMessage({ command: 'runDefaultRepomix' });
  };

  const handleCancelDefault = () => {
     vscode.postMessage({ command: 'cancelDefaultRepomix' });
  };

  const handleCopyDefault = () => {
     vscode.postMessage({ command: 'copyDefaultRepomixOutput' });
  };

  return (
    <FluentProvider theme={webDarkTheme} style={{ background: 'transparent' }}>
      <div
        style={{
          padding: '10px', // Reduced padding slightly to save space
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <Text size={500} weight="semibold" style={{ marginBottom: '10px' }}>
          Repomix Runner
        </Text>

        {/* TAB HEADER */}
        <TabList
          selectedValue={selectedTab}
          onTabSelect={(_, data) => setSelectedTab(data.value as string)}
          style={{ marginBottom: '15px' }}
        >
          <Tab value="bundles">Bundles</Tab>
          <Tab value="agent">Smart Agent</Tab>
        </TabList>

        {/* TAB CONTENT */}
        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {selectedTab === 'bundles' ? (
             <>
                <DefaultRepomixItem
                    state={defaultRepomixState}
                    info={defaultRepomixInfo}
                    onRun={handleRunDefault}
                    onCancel={handleCancelDefault}
                    onCopy={handleCopyDefault}
                />

                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <Text weight="semibold">Your Bundles</Text>
                  {bundles.length === 0 ? (
                    <Text style={{ opacity: 0.7 }}>No bundles found.</Text>
                  ) : (
                    bundles.map((bundle) => (
                      <BundleItem
                        key={bundle.id}
                        bundle={bundle}
                        state={bundleStates[bundle.id] || 'idle'}
                        onRun={handleRun}
                        onCancel={handleCancel}
                        onCopy={handleCopy}
                      />
                    ))
                  )}
                </div>
             </>
          ) : (
            <AgentView />
          )}
        </div>

        {/* FOOTER */}
        {version && (
          <div
            style={{
              marginTop: '10px',
              alignSelf: 'center',
              padding: '2px 6px',
              borderRadius: '4px',
              opacity: 0.5
            }}
          >
            <Text size={100}>v{version}</Text>
          </div>
        )}
      </div>
    </FluentProvider>
  );
};