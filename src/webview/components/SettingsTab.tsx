import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Divider,
  Dropdown,
  Option,
  Spinner,
} from '@fluentui/react-components';
import {
  SaveRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ArrowClockwiseRegular,
  SearchRegular,
  ChevronRightRegular,
  ChevronDownRegular
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { PineconeIndex } from '../types.js';

// --- Interfaces ---

interface ConfigSectionProps {
  title: string;
  isConfigured: boolean;
  value: string;
  onChange: (val: string) => void;
  onSave: () => void;
  placeholder: string;
  description: string;
  children?: React.ReactNode;
}

interface SettingsTabProps {
  pineconeIndexes: PineconeIndex[];
  selectedPineconeIndex: PineconeIndex | null;
  indexError: string | null;
}

// --- Reusable Components ---

const ConfigSection: React.FC<ConfigSectionProps> = ({
  title,
  isConfigured,
  value,
  onChange,
  onSave,
  placeholder,
  description,
  children
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
          <Label weight="semibold" style={{ cursor: 'pointer' }}>{title}</Label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isConfigured ? (
            <>
              <CheckmarkCircleRegular style={{ color: 'var(--vscode-charts-green)' }} />
              <Text size={200} style={{ color: 'var(--vscode-charts-green)' }}>Configured</Text>
            </>
          ) : (
            <>
              <ErrorCircleRegular style={{ color: 'var(--vscode-errorForeground)' }} />
              <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>Missing</Text>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '20px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              type="password"
              placeholder={placeholder}
              value={value}
              onChange={(e, data) => onChange(data.value)}
              style={{ flexGrow: 1 }}
            />
            <Button
              icon={<SaveRegular />}
              onClick={onSave}
              disabled={!value.trim()}
            >
              Save
            </Button>
          </div>
          <Text size={100} style={{ opacity: 0.7 }}>
            {description}
          </Text>
          {children}
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

export const SettingsTab: React.FC<SettingsTabProps> = ({
  pineconeIndexes,
  selectedPineconeIndex,
  indexError
}) => {
  const [googleKey, setGoogleKey] = useState('');
  const [pineconeKey, setPineconeKey] = useState('');
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);
  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);

  // Auto-fetch indexes if we have the key but no indexes yet
  // This replaces the generic fetch-on-mount logic
  useEffect(() => {
    if (pineconeKeyExists && pineconeIndexes.length === 0 && !isFetchingIndexes) {
      setIsFetchingIndexes(true);
      vscode.postMessage({ command: 'fetchPineconeIndexes' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pineconeKeyExists]);

  // Handle explicit key entry (debounce)
  useEffect(() => {
    if (!pineconeKey) {
      // Don't modify fetching state here, just return
      return;
    }
    setIsFetchingIndexes(true);
    const timer = setTimeout(() => {
      vscode.postMessage({ command: 'fetchPineconeIndexes', apiKey: pineconeKey });
    }, 1000);
    return () => clearTimeout(timer);
  }, [pineconeKey]);

  // Sync fetching state with props change
  useEffect(() => {
    if (pineconeIndexes.length > 0 || indexError) {
      setIsFetchingIndexes(false);
    }
  }, [pineconeIndexes, indexError]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'secretStatus':
          if (message.key === 'googleApiKey') {
            setGoogleKeyExists(message.exists);
          } else if (message.key === 'pineconeApiKey') {
            setPineconeKeyExists(message.exists);
          }
          break;
        // updatePineconeIndexes and updateSelectedIndex are handled by App.tsx
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });
    vscode.postMessage({ command: 'getPineconeIndex' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSaveGoogleKey = () => {
    vscode.postMessage({ command: 'saveSecret', key: 'googleApiKey', value: googleKey.trim() });
    setGoogleKey('');
  };

  const handleSavePineconeKey = () => {
    vscode.postMessage({ command: 'saveSecret', key: 'pineconeApiKey', value: pineconeKey.trim() });
    setPineconeKey('');
  };

  const handleIndexSelect = (_e: any, data: any) => {
    const index = pineconeIndexes.find(i => i.name === data.optionValue);
    if (index) {
      vscode.postMessage({ command: 'savePineconeIndex', index });
    }
  };

  const handleRefreshIndexes = () => {
    setIsFetchingIndexes(true);
    vscode.postMessage({ command: 'fetchPineconeIndexes' });
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Text size={400} weight="semibold">Configuration</Text>

      <ConfigSection
        title="Google Gemini API Key"
        isConfigured={googleKeyExists}
        value={googleKey}
        onChange={setGoogleKey}
        onSave={handleSaveGoogleKey}
        placeholder="Enter Gemini API Key (starts with AIza...)"
        description="Required for Smart Agent functionality."
      />

      <Divider />

      <ConfigSection
        title="Pinecone API Key"
        isConfigured={pineconeKeyExists}
        value={pineconeKey}
        onChange={setPineconeKey}
        onSave={handleSavePineconeKey}
        placeholder="Enter Pinecone API Key"
        description="Required for vector search. Stored securely."
      >
        {/* Pinecone Index Selection UI nestled inside the section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          <Label size="small">Active Index</Label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Dropdown
              placeholder="Select an Index"
              disabled={!pineconeKeyExists}
              value={selectedPineconeIndex?.name}
              onOptionSelect={handleIndexSelect}
              style={{ flexGrow: 1 }}
            >
              {pineconeIndexes.map((index) => (
                <Option key={index.name} value={index.name}>{index.name}</Option>
              ))}
            </Dropdown>
            <Button
              icon={isFetchingIndexes ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
              onClick={handleRefreshIndexes}
              disabled={!pineconeKeyExists || isFetchingIndexes}
            />
          </div>
          {indexError && <Text size={100} style={{ color: 'var(--vscode-errorForeground)' }}>{indexError}</Text>}
        </div>
      </ConfigSection>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Vector Search (Preview)</Label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input placeholder="Enter search query..." style={{ flexGrow: 1 }} />
          <Button icon={<SearchRegular />}>Search</Button>
        </div>
      </div>
    </div>
  );
};
