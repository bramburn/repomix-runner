import React, { useEffect, useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Text,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { vscode } from './vscode-api.js';

// Clean imports from main
import { SettingsTab } from './components/SettingsTab.js';
import { SearchTab } from './components/SearchTab.js';
import { BundleItem } from './components/BundleItem.js';
import { DefaultRepomixItem } from './components/DefaultRepomixItem.js';
import { DebugTab } from './components/DebugTab.js';
import { AgentView } from './components/AgentView.js';
import { Bundle, DefaultRepomixInfo, PineconeIndex } from './types.js';
import { updateVsState } from './utils.js';

// --- MAIN APP ---

export const App = () => {
  const [selectedTab, setSelectedTab] = useState<string>(() => {
    return vscode.getState()?.selectedTab || 'bundles';
  });
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleStates, setBundleStates] = useState<Record<string, 'idle' | 'queued' | 'running'>>({});
  const [version, setVersion] = useState<string>('');

  // Default Repomix State
  const [defaultRepomixState, setDefaultRepomixState] = useState<'idle' | 'queued' | 'running'>('idle');
  const [defaultRepomixInfo, setDefaultRepomixInfo] = useState<DefaultRepomixInfo>({ outputFileExists: false, outputFilePath: '' });

  // Pinecone State (lifted from SettingsTab)
  const [pineconeIndexes, setPineconeIndexes] = useState<PineconeIndex[]>(() => {
    return vscode.getState()?.pineconeIndexes || [];
  });
  const [selectedPineconeIndex, setSelectedPineconeIndex] = useState<PineconeIndex | null>(() => {
    return vscode.getState()?.selectedPineconeIndex || null;
  });
  const [pineconeIndexError, setPineconeIndexError] = useState<string | null>(null);

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
        case 'updatePineconeIndexes':
          if (message.error) {
            setPineconeIndexError(message.error);
            setPineconeIndexes([]);
            updateVsState({ pineconeIndexes: [] });
          } else {
            setPineconeIndexError(null);
            setPineconeIndexes(message.indexes);
            updateVsState({ pineconeIndexes: message.indexes });
          }
          break;
        case 'updateSelectedIndex':
          setSelectedPineconeIndex(message.index);
          updateVsState({ selectedPineconeIndex: message.index });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'webviewLoaded' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleRun = (id: string, compress = false) => {
    vscode.postMessage({ command: 'runBundle', bundleId: id, compress });
  };

  const handleCancel = (id: string) => {
    vscode.postMessage({ command: 'cancelBundle', bundleId: id });
  };

  const handleCopy = (id: string) => {
    vscode.postMessage({ command: 'copyBundleOutput', bundleId: id });
  };

  const handleRunDefault = (compress = false) => {
    vscode.postMessage({ command: 'runDefaultRepomix', compress });
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
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <Text size={500} weight="semibold" style={{ marginBottom: '10px' }}>
          Repomix Runner
        </Text>

        <TabList
          selectedValue={selectedTab}
          onTabSelect={(_, data) => {
            const val = data.value as string;
            setSelectedTab(val);
            updateVsState({ selectedTab: val });
          }}
          style={{ marginBottom: '15px' }}
        >
          <Tab value="bundles">Bundles</Tab>
          <Tab value="agent">Smart Agent</Tab>
          <Tab value="search">Search</Tab>
          <Tab value="settings">Settings</Tab>
          <Tab value="debug">Debug</Tab>
        </TabList>

        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {selectedTab === 'bundles' && (
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
          )}
          {selectedTab === 'agent' && <AgentView />}
          {selectedTab === 'search' && <SearchTab />}
          {selectedTab === 'settings' && (
            <SettingsTab
              pineconeIndexes={pineconeIndexes}
              selectedPineconeIndex={selectedPineconeIndex}
              indexError={pineconeIndexError}
              // We can pass setter logic via vscode messages in SettingsTab,
              // but we need to update local state too? No, messages will loop back.
            />
          )}
          {selectedTab === 'debug' && <DebugTab />}
        </div>

        {version && (
          <div style={{ marginTop: '10px', alignSelf: 'center', opacity: 0.5 }}>
            <Text size={100}>v{version}</Text>
          </div>
        )}
      </div>
    </FluentProvider>
  );
};
