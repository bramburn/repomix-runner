// TEMP: Smart Agent tab is deprecated for now.
// The agent workflow remains available for future integration into Search.
const ENABLE_SMART_AGENT_TAB = false;

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
import { ApplyTab } from './components/ApplyTab.js';
import { ChatTab } from './components/ChatTab.js';
import { Bundle, DefaultRepomixInfo, PineconeIndex } from './types.js';
import { updateVsState } from './utils.js';

// --- CLIENT OS DETECTION ---

function detectClientOs(): { os: 'win32' | 'darwin' | 'linux' | 'unknown'; arch: 'x64' | 'arm64' | 'unknown' } {
  // Try to get from process if available (some webview contexts have it)
  if (typeof process !== 'undefined' && process.platform) {
    const os = process.platform as 'win32' | 'darwin' | 'linux';
    const arch = (process.arch === 'arm64' ? 'arm64' : 'x64') as 'x64' | 'arm64';
    return { os, arch };
  }

  // Fallback to navigator.userAgent
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return { os: 'win32', arch: 'x64' };
  if (ua.includes('Mac')) return { os: 'darwin', arch: 'arm64' };
  if (ua.includes('Linux')) return { os: 'linux', arch: 'x64' };

  return { os: 'unknown', arch: 'unknown' };
}

// --- MAIN APP ---

export const App = () => {
  console.log('[quick-repomix] ===== APP COMPONENT RENDER START =====');

  const [selectedTab, setSelectedTab] = useState<string>(() => {
    const savedTab = vscode.getState()?.selectedTab;

    if (savedTab === 'indexHistory') return 'debug';
    if (savedTab === 'agent' && !ENABLE_SMART_AGENT_TAB) return 'search';

    return savedTab || 'bundles';
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
    console.log('[quick-repomix] ===== APP USE EFFECT START =====');

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[quick-repomix] Message received from extension:', message.command);
      switch (message.command) {
        case 'hydrate':
          // Handle consolidated hydrate state
          console.log('[quick-repomix] Received hydrate state');
          if (message.version) {
            setVersion(message.version);
          }
          if (message.bundles) {
            setBundles(message.bundles);
          }
          if (message.defaultRepomix) {
            setDefaultRepomixInfo(message.defaultRepomix);
          }
          break;
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

        case 'updateSelectedPineconeIndex':
          setSelectedPineconeIndex(message.index);
          updateVsState({ selectedPineconeIndex: message.index });
          break;
        case 'processRemoteFilesForClipboard':
          console.warn('[App] Received processRemoteFilesForClipboard - DEPRECATED/DISABLED due to webview sandbox limitations');
          // Immediately reject to prevent hanging
          vscode.postMessage({
            command: 'remoteClipboardProcessingComplete',
            success: false,
            error: 'Remote clipboard processing via webview is disabled.',
            resolverKey: (message as any).resolverKey
          });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    console.log('[quick-repomix] Message handler registered, posting webviewLoaded...');

    vscode.postMessage({ command: 'webviewLoaded' });
    console.log('[quick-repomix] webviewLoaded message posted to extension');

    // Report client OS info to extension host for remote clipboard support
    const clientInfo = detectClientOs();
    vscode.postMessage({
      command: 'reportClientInfo',
      clientOs: clientInfo.os,
      clientArch: clientInfo.arch,
    });

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
          Repomix Runner Plus
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
          {ENABLE_SMART_AGENT_TAB && <Tab value="agent">Smart Agent</Tab>}
          <Tab value="search">Search</Tab>
          <Tab value="chat">Chat</Tab>
          <Tab value="settings">Settings</Tab>
          <Tab value="apply">Apply</Tab>
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
          {ENABLE_SMART_AGENT_TAB && selectedTab === 'agent' && <AgentView />}
          {selectedTab === 'search' && <SearchTab />}
          {selectedTab === 'chat' && <ChatTab />}
          {selectedTab === 'settings' && (
            <SettingsTab
              pineconeIndexes={pineconeIndexes}
              selectedPineconeIndex={selectedPineconeIndex}
              indexError={pineconeIndexError}
            // We can pass setter logic via vscode messages in SettingsTab,
            // but we need to update local state too? No, messages will loop back.
            />
          )}
          {selectedTab === 'apply' && <ApplyTab />}

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
