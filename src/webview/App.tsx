import React, { useEffect, useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Text,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { vscode } from './vscode-api.js';
import { updateVsState } from './utils.js';
import { Bundle, DefaultRepomixInfo } from './types.js';
import { useStyles } from './styles.js';

import { BundleItem } from './components/BundleItem.js';
import { DefaultRepomixItem } from './components/DefaultRepomixItem.js';
import { AgentView } from './components/AgentView.js';

export const App = () => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<string>(() => {
    return vscode.getState()?.selectedTab || 'bundles';
  });
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
      <div className={styles.container}>
        <Text size={500} weight="semibold" className={styles.headerText}>
          Repomix Runner
        </Text>

        {/* TAB HEADER */}
        <TabList
          selectedValue={selectedTab}
          onTabSelect={(_, data) => {
            const val = data.value as string;
            setSelectedTab(val);
            updateVsState({ selectedTab: val });
          }}
          className={styles.tabList}
        >
          <Tab value="bundles">Bundles</Tab>
          <Tab value="agent">Smart Agent</Tab>
          <Tab value="settings">Settings</Tab>
          <Tab value="debug">Debug</Tab>
        </TabList>

        {/* TAB CONTENT */}
        <div className={styles.tabContent}>
          {selectedTab === 'bundles' && (
             <>
                <DefaultRepomixItem
                    state={defaultRepomixState}
                    info={defaultRepomixInfo}
                    onRun={handleRunDefault}
                    onCancel={handleCancelDefault}
                    onCopy={handleCopyDefault}
                />

                <div className={styles.bundleListContainer}>
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
          {selectedTab === 'settings' && (
            <div className={styles.debugPlaceholder}>
              <Text size={300} weight="semibold" style={{ opacity: 0.5 }}>
                Settings Placeholder
              </Text>
            </div>
          )}
          {selectedTab === 'debug' && (
            <div className={styles.debugPlaceholder}>
              <Text size={300} weight="semibold" style={{ opacity: 0.5 }}>
                Debug Monitor Placeholder
              </Text>
            </div>
          )}
        </div>

        {/* FOOTER */}
        {version && (
          <div className={styles.footer}>
            <Text size={100}>v{version}</Text>
          </div>
        )}
      </div>
    </FluentProvider>
  );
};
