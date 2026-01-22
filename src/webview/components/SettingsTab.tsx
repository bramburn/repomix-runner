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
  ChevronDownRegular,
  WarningRegular,
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
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
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
  indexError,
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
  const [qdrantTestLoading, setQdrantTestLoading] = useState(false);

  const [qdrantCollections, setQdrantCollections] = useState<Array<{ name: string }>>([]);
  const [qdrantCollectionsError, setQdrantCollectionsError] = useState<string | null>(null);
  const [isFetchingQdrantCollections, setIsFetchingQdrantCollections] = useState(false);

  // Embedding Provider State
  const [embeddingProvider, setEmbeddingProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('nomic-embed-text');
  const [ollamaDimension, setOllamaDimension] = useState(768);
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string }>>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const [isFetchingOllamaModels, setIsFetchingOllamaModels] = useState(false);
  const [isTestingDimension, setIsTestingDimension] = useState(false);

  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);
  const [copyMode, setCopyMode] = useState<string>('file');

  // Compatibility status state
  const [compatibilityStatus, setCompatibilityStatus] = useState<{
    compatible: boolean;
    blocked: boolean;
    embeddingDimension: number;
    indexDimension?: number;
    message: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Auto-fetch indexes if we have the key but no indexes yet
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

  // Fetch Qdrant collections when URL changes
  useEffect(() => {
    if (!qdrantUrl.trim() || vectorDbProvider !== 'qdrant') {
      return;
    }
    setIsFetchingQdrantCollections(true);
    const timer = setTimeout(() => {
      vscode.postMessage({ command: 'fetchQdrantCollections' });
    }, 500);
    return () => clearTimeout(timer);
  }, [qdrantUrl, vectorDbProvider]);

  // Sync fetching state with collections response
  useEffect(() => {
    if (qdrantCollections.length > 0 || qdrantCollectionsError) {
      setIsFetchingQdrantCollections(false);
    }
  }, [qdrantCollections, qdrantCollectionsError]);

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

        case 'qdrantConnectionResult':
          console.log('[SettingsTab] Received qdrantConnectionResult:', message);
          setQdrantTestLoading(false);
          if (message.success) {
            console.log('[SettingsTab] Connection successful:', message.message);
            vscode.postMessage({
              command: 'showNotification',
              type: 'info',
              message: message.message,
            });
          } else {
            console.error('[SettingsTab] Connection failed:', message.error);
            vscode.postMessage({
              command: 'showNotification',
              type: 'error',
              message: `Connection failed: ${message.error}`,
            });
          }
          break;

        case 'updateQdrantCollections':
          setQdrantCollections(message.collections || []);
          setQdrantCollectionsError(message.error || null);
          setIsFetchingQdrantCollections(false);
          break;

        case 'embeddingConfig':
          setEmbeddingProvider(message.provider);
          setOllamaUrl(message.ollamaUrl || 'http://localhost:11434');
          setOllamaModel(message.ollamaModel || 'nomic-embed-text');
          setOllamaDimension(message.ollamaDimension || 768);
          break;

        case 'ollamaModelsResult':
          setOllamaModels(message.models || []);
          setOllamaModelsError(message.error || null);
          setIsFetchingOllamaModels(false);
          break;

        case 'ollamaDimensionResult':
          setIsTestingDimension(false);
          if (message.dimension) {
            setOllamaDimension(message.dimension);
          }
          if (message.error) {
            vscode.postMessage({
              command: 'showNotification',
              type: 'error',
              message: `Dimension test failed: ${message.error}`,
            });
          }
          break;

        case 'compatibilityStatus':
          setCompatibilityStatus({
            compatible: message.compatible,
            blocked: message.blocked,
            embeddingDimension: message.embeddingDimension,
            indexDimension: message.indexDimension,
            message: message.message,
          });
          break;

        case 'vectorIndexReset':
          setIsResetting(false);
          break;
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
    vscode.postMessage({ command: 'getEmbeddingConfig' });
    vscode.postMessage({ command: 'checkCompatibility' });

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
    // Explicit check to ensure we never send empty values causing Zod errors
    const url = qdrantUrl.trim();
    const collection = qdrantCollection.trim();

    if (!url || !collection) return;

    vscode.postMessage({
      command: 'setQdrantConfig',
      url: url,
      collection: collection,
    });
  };

  const handleTestQdrantConnection = () => {
    // Debug logging before sending message
    console.log('[SettingsTab] === Qdrant Test Connection Started ===');
    console.log('[SettingsTab] qdrantUrl:', qdrantUrl);
    console.log('[SettingsTab] qdrantUrl.trim():', qdrantUrl.trim());
    console.log('[SettingsTab] qdrantCollection:', qdrantCollection);
    console.log('[SettingsTab] qdrantCollection.trim():', qdrantCollection.trim());
    console.log('[SettingsTab] qdrantKey present:', !!qdrantKey);
    console.log('[SettingsTab] qdrantKey.trim():', qdrantKey.trim());
    console.log('[SettingsTab] apiKey to send:', qdrantKey.trim() || undefined);

    setQdrantTestLoading(true);
    const message = {
      command: 'testQdrantConnection',
      url: qdrantUrl.trim(),
      collection: qdrantCollection.trim(),
      apiKey: qdrantKey.trim() || undefined,
    };
    console.log('[SettingsTab] Sending message to extension:', JSON.stringify(message, null, 2));
    vscode.postMessage(message);
    console.log('[SettingsTab] Message sent, waiting for response...');
  };

  const handleProviderChange = (_e: any, data: any) => {
    const p = data.optionValue === 'qdrant' ? 'qdrant' : 'pinecone';
    setVectorDbProvider(p);
    vscode.postMessage({ command: 'setVectorDbProvider', provider: p });
  };


  const handleIndexSelect = (_e: any, data: any) => {
    const optionValue = data.optionValue as string | undefined;
    const index = pineconeIndexes.find(i => i.name === optionValue);
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

  const handleEmbeddingProviderChange = (_e: any, data: any) => {
    const provider = data.optionValue as 'gemini' | 'ollama';
    setEmbeddingProvider(provider);
  };

  const handleFetchOllamaModels = () => {
    setIsFetchingOllamaModels(true);
    setOllamaModelsError(null);
    vscode.postMessage({ command: 'fetchOllamaModels', url: ollamaUrl });
  };

  const handleOllamaModelSelect = (_e: any, data: any) => {
    const modelName = data.optionValue as string;
    setOllamaModel(modelName);
    
    // Auto-test dimension when model is selected
    setIsTestingDimension(true);
    vscode.postMessage({ 
      command: 'testOllamaDimension', 
      url: ollamaUrl,
      model: modelName 
    });
  };

  const handleSaveEmbeddingConfig = () => {
    if (embeddingProvider === 'ollama') {
      if (!ollamaUrl.trim() || !ollamaModel.trim() || ollamaDimension <= 0) {
        vscode.postMessage({
          command: 'showNotification',
          type: 'error',
          message: 'Please fill in all Ollama configuration fields',
        });
        return;
      }
    }

    vscode.postMessage({
      command: 'setEmbeddingConfig',
      provider: embeddingProvider,
      ollamaUrl: ollamaUrl,
      ollamaModel: ollamaModel,
      ollamaDimension: ollamaDimension,
    });
  };

  const handleResetVectorIndex = () => {
    setIsResetting(true);
    vscode.postMessage({ command: 'resetVectorIndex' });
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Text size={400} weight="semibold">Configuration</Text>

      {/* Compatibility Status Alert */}
      {compatibilityStatus && (
        <div style={{
          padding: '12px',
          borderRadius: '4px',
          border: '1px solid',
          borderColor: compatibilityStatus.compatible
            ? 'var(--vscode-inputValidation-infoBorder)'
            : 'var(--vscode-inputValidation-errorBorder)',
          backgroundColor: compatibilityStatus.compatible
            ? 'var(--vscode-inputValidation-infoBackground)'
            : 'var(--vscode-inputValidation-errorBackground)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {compatibilityStatus.compatible ? (
              <CheckmarkCircleRegular style={{ color: 'var(--vscode-charts-green)', fontSize: '20px' }} />
            ) : (
              <WarningRegular style={{ color: 'var(--vscode-errorForeground)', fontSize: '20px' }} />
            )}
            <Text weight="semibold" style={{
              color: compatibilityStatus.compatible
                ? 'var(--vscode-charts-green)'
                : 'var(--vscode-errorForeground)'
            }}>
              {compatibilityStatus.compatible ? 'System Ready' : 'Dimension Mismatch Detected'}
            </Text>
          </div>
          <Text size={200} style={{ display: 'block', marginTop: '8px' }}>
            {compatibilityStatus.message}
          </Text>
          {!compatibilityStatus.compatible && (
            <div style={{ marginTop: '12px' }}>
              <Text size={100} style={{ display: 'block', marginBottom: '8px', opacity: 0.8 }}>
                Indexing is disabled until the dimension mismatch is resolved.
                Reset the vector index to recreate it with the new embedding dimension.
              </Text>
              <Button
                appearance="primary"
                onClick={handleResetVectorIndex}
                disabled={isResetting}
                style={{ backgroundColor: 'var(--vscode-errorForeground)' }}
              >
                {isResetting ? 'Resetting...' : 'Reset & Recreate Index'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">General Settings</Label>
        <div style={{ paddingLeft: '20px' }}>
          <Switch
            label={copyMode === 'content' ? 'Copy content to clipboard (Text)' : 'Copy file to clipboard (File Object)'}
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

      {/* Embedding Provider Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Embedding Provider</Label>
        <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <Label size="small">Active Provider</Label>
            <Dropdown 
              value={embeddingProvider} 
              onOptionSelect={handleEmbeddingProviderChange} 
              style={{ width: '240px', marginTop: '4px' }}
            >
              <Option value="gemini">Google Gemini (768d)</Option>
              <Option value="ollama">Ollama (Local)</Option>
            </Dropdown>
            <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
              Choose which embedding model to use for vector search indexing.
            </Text>
          </div>

          {/* Ollama Configuration Accordion */}
          {embeddingProvider === 'ollama' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px',
              padding: '12px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--vscode-editor-background)'
            }}>
              <Label weight="semibold" size="small">Ollama Connection Settings</Label>

              {/* Endpoint Input */}
              <div>
                <Label size="small">Ollama URL</Label>
                <Input
                  placeholder="http://localhost:11434"
                  value={ollamaUrl}
                  onChange={(_e, data) => setOllamaUrl(data.value)}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  URL of your Ollama server
                </Text>
              </div>

              {/* Model Manager */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <Label size="small">Model</Label>
                  <Button
                    size="small"
                    appearance="secondary"
                    icon={isFetchingOllamaModels ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                    onClick={handleFetchOllamaModels}
                    disabled={!ollamaUrl.trim() || isFetchingOllamaModels}
                  >
                    Fetch Models
                  </Button>
                </div>
                <Dropdown
                  placeholder="Select a model"
                  value={ollamaModel}
                  onOptionSelect={handleOllamaModelSelect}
                  disabled={ollamaModels.length === 0}
                >
                  {ollamaModels.map((model) => (
                    <Option key={model.name} value={model.name}>{model.name}</Option>
                  ))}
                </Dropdown>
                {ollamaModelsError && (
                  <Text size={100} style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}>
                    {ollamaModelsError}
                  </Text>
                )}
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Recommended: nomic-embed-text, mxbai-embed-large, or all-minilm
                </Text>
              </div>

              {/* Dimension Input */}
              <div>
                <Label size="small">Embedding Dimension</Label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <Input
                    type="number"
                    value={ollamaDimension.toString()}
                    onChange={(_e, data) => {
                      const val = parseInt(data.value);
                      if (!isNaN(val) && val > 0) {
                        setOllamaDimension(val);
                      }
                    }}
                    style={{ width: '120px' }}
                    disabled={isTestingDimension}
                  />
                  {isTestingDimension && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Spinner size="tiny" />
                      <Text size={100}>Testing...</Text>
                    </div>
                  )}
                </div>
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Auto-detected when you select a model. Common values: 768, 1024, 384
                </Text>
              </div>

              {/* Save Button */}
              <Button
                appearance="primary"
                onClick={handleSaveEmbeddingConfig}
                disabled={!ollamaUrl.trim() || !ollamaModel.trim() || ollamaDimension <= 0}
              >
                Save Embedding Configuration
              </Button>
            </div>
          )}

          {/* Gemini Info */}
          {embeddingProvider === 'gemini' && (
            <div style={{ 
              padding: '12px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--vscode-editor-background)'
            }}>
              <Text size={200}>Using Google Gemini embedding model (768 dimensions)</Text>
              <Text size={100} style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
                Ensure your Google Gemini API Key is configured above.
              </Text>
              <Button
                appearance="primary"
                onClick={handleSaveEmbeddingConfig}
                style={{ marginTop: '12px' }}
              >
                Save Embedding Configuration
              </Button>
            </div>
          )}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <Dropdown
              placeholder="Select or enter collection name"
              value={qdrantCollection}
              onOptionSelect={(_e, data) => setQdrantCollection(data.optionValue || '')}
              style={{ flexGrow: 1 }}
            >
              {qdrantCollections.map((collection) => (
                <Option key={collection.name} value={collection.name}>{collection.name}</Option>
              ))}
            </Dropdown>
            <Button
              icon={isFetchingQdrantCollections ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
              onClick={() => {
                setIsFetchingQdrantCollections(true);
                vscode.postMessage({ command: 'fetchQdrantCollections' });
              }}
              disabled={!qdrantUrl.trim() || isFetchingQdrantCollections}
              appearance="secondary"
            />
          </div>
          {qdrantCollectionsError && <Text size={100} style={{ color: 'var(--vscode-errorForeground)' }}>{qdrantCollectionsError}</Text>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Label size="small">Or enter new collection name</Label>
            <Input
              placeholder="e.g. repomix_vectors"
              value={qdrantCollection}
              onChange={(_e, data) => setQdrantCollection(data.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              onClick={handleTestQdrantConnection}
              disabled={!qdrantUrl.trim() || !qdrantCollection.trim() || qdrantTestLoading}
              appearance="secondary"
            >
              {qdrantTestLoading ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSaveQdrantConfig}
              disabled={!qdrantUrl.trim() || !qdrantCollection.trim()}
            >
              Save Qdrant Settings
            </Button>
          </div>
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