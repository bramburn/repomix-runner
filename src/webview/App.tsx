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

interface BundleItemProps {
  bundle: Bundle;
  state: 'idle' | 'queued' | 'running';
  onRun: (id: string) => void;
  onCancel: (id: string) => void;
  onCopy: (id: string) => void;
}

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

    return (
      <div style={{ maxWidth: '300px' }}>
        <div>{fileCount} files, {folderCount} folders</div>
        <div style={{ marginTop: '5px', fontSize: '12px', opacity: 0.8 }}>
          {filesToShow.map((file, index) => (
            <div key={index}>• {file}</div>
          ))}
          {remaining > 0 && <div>... and {remaining} more</div>}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '10px',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Text weight="semibold">{bundle.name}</Text>
          {bundle.description && (
            <Text size={200} style={{ opacity: 0.8, display: 'block', marginTop: '4px' }}>
              {bundle.description}
            </Text>
          )}
          <Text size={200} style={{ opacity: 0.6, display: 'block', marginTop: '4px' }}>
            {fileCount} files, {folderCount} folders
          </Text>
        </div>
        <Button
          appearance="subtle"
          size="small"
          icon={<CopyRegular />}
          disabled={disabled || !bundle.outputFileExists}
          onClick={() => onCopy(bundle.id)}
          title="Copy output to clipboard"
        />
      </div>

      <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
        {isRunning || isQueued ? (
          <Button
            appearance="secondary"
            disabled={!isRunning}
            onClick={() => onCancel(bundle.id)}
            size="small"
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
          title={`${fileCount} files, ${folderCount} folders`}
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

// NEW COMPONENT: Agent View
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
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
        return;
    }
    vscode.postMessage({ command: 'saveApiKey', apiKey: trimmedKey });
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
          icon={isRunning ? <Spinner size="tiny" /> : <PlayRegular />}
          disabled={isRunning || !query}
          onClick={handleRun}
        >
          {isRunning ? 'Agent Working...' : 'Run Agent'}
        </Button>
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <Label weight="semibold">Smart Agent Configuration</Label>

        {hasKey ? (
           <Text size={200} style={{ color: '#4caf50' }}>
             ✅ API Key Configured
           </Text>
        ) : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <Text size={200} style={{ color: '#ffb74d' }}>
               ⚠️ API Key Missing
             </Text>
             <Text size={100} style={{ opacity: 0.8 }}>
               Please configure your Google API Key below to use the Smart Agent.
             </Text>
           </div>
        )}

        <div style={{ display: 'flex', gap: '5px' }}>
          <Input
            type="password"
            placeholder="Paste Gemini API Key"
            value={apiKey}
            onChange={(e, data) => setApiKey(data.value)}
            style={{ flexGrow: 1 }}
          />
          <Button
            icon={<SaveRegular />}
            onClick={handleSaveKey}
            disabled={!apiKey.trim()}
          >
            Save
          </Button>
        </div>
        <Text size={100} style={{ opacity: 0.7 }}>
          Key is stored securely in VS Code Secrets.
        </Text>
      </div>
    </div>
  );
};

// MAIN APP
export const App = () => {
  const [selectedTab, setSelectedTab] = useState<string>('bundles');
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

  const handleCopy = (id: string) => {
    vscode.postMessage({ command: 'copyBundleOutput', bundleId: id });
  };

  return (
    <FluentProvider theme={webDarkTheme} style={{ background: 'transparent' }}>
      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>

        {/* TAB HEADER */}
        <TabList
          selectedValue={selectedTab}
          onTabSelect={(_, data) => setSelectedTab(data.value as string)}
          style={{ marginBottom: '10px' }}
        >
          <Tab value="bundles">Bundles</Tab>
          <Tab value="agent">Smart Agent</Tab>
        </TabList>

        {/* TAB CONTENT */}
        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
          {selectedTab === 'bundles' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {bundles.length === 0 ? <Text>No bundles found.</Text> : (
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
          ) : (
            <AgentView />
          )}
        </div>

        {/* FOOTER */}
        <Text size={100} style={{ opacity: 0.5, textAlign: 'center', marginTop: '10px' }}>
          v{version}
        </Text>
      </div>
    </FluentProvider>
  );
};