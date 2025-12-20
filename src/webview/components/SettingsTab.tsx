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

// --- Interfaces ---

interface PineconeIndex {
  name: string;
  host: string;
  dimension?: number;
  metric?: string;
  spec?: any;
  status?: any;
}

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

export const SettingsTab = () => {
  const [googleKey, setGoogleKey] = useState('');
  const [pineconeKey, setPineconeKey] = useState('');
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);

  const [pineconeIndexes, setPineconeIndexes] = useState<PineconeIndex[]>([]);
  const [selectedPineconeIndex, setSelectedPineconeIndex] = useState<PineconeIndex | null>(null);
  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  useEffect(() => {
    if (!pineconeKey) {
      setIsFetchingIndexes(false);
      setIndexError(null);
      return;
    }
    setIsFetchingIndexes(true);
    const timer = setTimeout(() => {
      vscode.postMessage({ command: 'fetchPineconeIndexes', apiKey: pineconeKey });
    }, 1000);
    return () => clearTimeout(timer);
  }, [pineconeKey]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'secretStatus':
          if (message.key === 'googleApiKey') {
            setGoogleKeyExists(message.exists);
          } else if (message.key === 'pineconeApiKey') {
            setPineconeKeyExists(message.exists);
            if (message.exists) {
              setIsFetchingIndexes(true);
              vscode.postMessage({ command: 'fetchPineconeIndexes' });
            }
          }
          break;
        case 'updatePineconeIndexes':
          setIsFetchingIndexes(false);
          if (message.error) {
            setIndexError(message.error);
            setPineconeIndexes([]);
          } else {
            setIndexError(null);
            setPineconeIndexes(message.indexes);
          }
          break;
        case 'updateSelectedIndex':
          setSelectedPineconeIndex(message.index);
          break;
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
      setSelectedPineconeIndex(index);
      vscode.postMessage({ command: 'savePineconeIndex', index });
    }
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
              onClick={() => vscode.postMessage({ command: 'fetchPineconeIndexes' })}
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