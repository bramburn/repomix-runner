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
  Switch,
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
  const [qdrantKey, setQdrantKey] = useState('');

  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);
  const [qdrantKeyExists, setQdrantKeyExists] = useState(false);

  const [vectorDbProvider, setVectorDbProvider] = useState<'pinecone' | 'qdrant'>('pinecone');

  const [qdrantUrl, setQdrantUrl] = useState('');
  const [qdrantCollection, setQdrantCollection] = useState('');

  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);
  const [copyMode, setCopyMode] = useState<string>('file');

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
          if (message.key === 'googleApiKey') setGoogleKeyExists(message.exists);
          else if (message.key === 'pineconeApiKey') setPineconeKeyExists(message.exists);
          else if (message.key === 'qdrantApiKey') setQdrantKeyExists(message.exists);
          break;

        case 'vectorDbProvider':
          setVectorDbProvider(message.provider ?? 'pinecone');
          break;

        case 'qdrantConfig':
          setQdrantUrl(message.url ?? '');
          setQdrantCollection(message.collection ?? '');
          break;

        case 'updateCopyMode':
          setCopyMode(message.mode);
          break;
        // updatePineconeIndexes and updateSelectedIndex are handled by App.tsx
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'qdrantApiKey' });

    vscode.postMessage({ command: 'getVectorDbProvider' });
    vscode.postMessage({ command: 'getQdrantConfig' });

    vscode.postMessage({ command: 'getPineconeIndex' });
    vscode.postMessage({ command: 'getCopyMode' });

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

  const handleSaveQdrantKey = () => {
    vscode.postMessage({ command: 'saveSecret', key: 'qdrantApiKey', value: qdrantKey.trim() });
    setQdrantKey('');
  };

  const handleSaveQdrantConfig = () => {
    vscode.postMessage({
      command: 'setQdrantConfig',
      url: qdrantUrl.trim(),
      collection: qdrantCollection.trim(),
    });
  };

  const handleProviderChange = (_e: any, data: any) => {
    const p = data.optionValue === 'qdrant' ? 'qdrant' : 'pinecone';
    setVectorDbProvider(p);
    vscode.postMessage({ command: 'setVectorDbProvider', provider: p });
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

  const handleCopyModeChange = (_ev: any, data: { checked: boolean }) => {
    const newMode = data.checked ? 'content' : 'file';
    setCopyMode(newMode);
    vscode.postMessage({ command: 'setCopyMode', mode: newMode });
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Text size={400} weight="semibold">Configuration</Text>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">General Settings</Label>
        <div style={{ paddingLeft: '20px' }}>
          <Switch
            label={copyMode === 'content' ? "Copy content to clipboard (Text)" : "Copy file to clipboard (File Object)"}
            checked={copyMode === 'content'}
            onChange={handleCopyModeChange}
          />
          <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
            Select whether to copy the raw text content or the file object itself when using the copy button.
          </Text>
        </div>
      </div>

      <Divider />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Vector DB</Label>
        <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Label size="small">Active Provider</Label>
          <Dropdown value={vectorDbProvider} onOptionSelect={handleProviderChange} style={{ width: '240px' }}>
            <Option value="pinecone">Pinecone</Option>
            <Option value="qdrant">Qdrant</Option>
          </Dropdown>
          <Text size={100} style={{ opacity: 0.7 }}>
            Choose which vector database Repomix uses for search (and indexing where supported).
          </Text>
        </div>
      </div>

      <Divider />


      <ConfigSection
        title="Google Gemini API Key"
        isConfigured={googleKeyExists}
        value={googleKey}
        onChange={setGoogleKey}
        onSave={handleSaveGoogleKey}
        placeholder="Enter Gemini API Key (starts with AIza...)"
        description="Reserved for upcoming Agent-in-Search experience. Not required for Search-only usage today."
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

      <ConfigSection
        title="Qdrant API Key (optional)"
        isConfigured={qdrantKeyExists}
        value={qdrantKey}
        onChange={setQdrantKey}
        onSave={handleSaveQdrantKey}
        placeholder="Enter Qdrant API Key (optional)"
        description="Used for Qdrant Cloud or secured deployments. Stored securely."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          <Label size="small">Qdrant URL</Label>
          <Input
            placeholder="https://xxxx.cloud.qdrant.io or http://localhost:6333"
            value={qdrantUrl}
            onChange={(_e, data) => setQdrantUrl(data.value)}
          />
          <Label size="small">Collection</Label>
          <Input
            placeholder="e.g. repomix_vectors"
            value={qdrantCollection}
            onChange={(_e, data) => setQdrantCollection(data.value)}
          />
          <Button onClick={handleSaveQdrantConfig} disabled={!qdrantUrl.trim() || !qdrantCollection.trim()}>
            Save Qdrant Settings
          </Button>
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
