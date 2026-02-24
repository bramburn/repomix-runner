import React, { useEffect, useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Text,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { ChatTab } from './components/ai-chat/ChatTab.js';
import { MemoryPanel } from './components/ai-chat/MemoryPanel.js';
import { PackagesTab } from './components/ai-chat/PackagesTab.js';
import { ChatSettingsTab } from './components/ai-chat/ChatSettingsTab.js';
import { ChatHistoryTab } from './components/ai-chat/ChatHistoryTab.js';
import { vscode } from './vscode-api.js';

export const AiChatRoot = () => {
  console.log('[AiChatRoot] Component rendered');
  
  const [activeTab, setActiveTab] = useState('Chat');
  const [chatDisabledMessage, setChatDisabledMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'chatDisabled' && typeof message.message === 'string') {
        setChatDisabledMessage(message.message);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'webviewLoaded' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <Text size={500} weight="semibold">
            AI Developer Chat Main
          </Text>
        </div>

        {chatDisabledMessage && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              border: '1px solid var(--vscode-inputValidation-warningBorder)',
              background: 'var(--vscode-inputValidation-warningBackground)',
              borderRadius: '6px',
            }}
          >
            <Text>{chatDisabledMessage}</Text>
          </div>
        )}

        {/* Tab Navigation */}
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => {
            setActiveTab(data.value as string);
          }}
          style={{ marginBottom: '15px' }}
        >
          <Tab value="Chat">Chat</Tab>
          <Tab value="Packages">Packages</Tab>
          <Tab value="Memory">Memory</Tab>
          <Tab value="Settings">Settings</Tab>
          <Tab value="History">History</Tab>
        </TabList>

        {/* Content Area */}
        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'Chat' && <ChatTab onOpenPackagesTab={() => setActiveTab('Packages')} />}

          {activeTab === 'Packages' && (
            <PackagesTab
              onNavigateToThread={(threadId) => {
                vscode.postMessage({ command: 'setActiveThread', threadId });
                setActiveTab('Chat');
              }}
            />
          )}

          {activeTab === 'Memory' && <MemoryPanel />}
          
          {activeTab === 'Settings' && <ChatSettingsTab />}
          
          {activeTab === 'History' && (
            <ChatHistoryTab
              onResumeThread={(threadId) => {
                setActiveTab('Chat');
              }}
            />
          )}
        </div>
      </div>
    </FluentProvider>
  );
};
