import React, { useState } from 'react';
import {
  FluentProvider,
  webDarkTheme,
  Text,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { ChatTab } from './components/ai-chat/ChatTab.js';

export const AiChatRoot = () => {
  console.log('[AiChatRoot] Component rendered');
  
  const [activeTab, setActiveTab] = useState('Chat');

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

        {/* Tab Navigation */}
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data) => {
            setActiveTab(data.value as string);
          }}
          style={{ marginBottom: '15px' }}
        >
          <Tab value="Chat">Chat</Tab>
          <Tab value="Settings">Settings</Tab>
          <Tab value="History">History</Tab>
        </TabList>

        {/* Content Area */}
        <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'Chat' && <ChatTab />}
          
          {activeTab === 'Settings' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Text style={{ opacity: 0.7 }}>Settings interface coming soon...</Text>
            </div>
          )}
          
          {activeTab === 'History' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Text style={{ opacity: 0.7 }}>History interface coming soon...</Text>
            </div>
          )}
        </div>
      </div>
    </FluentProvider>
  );
};