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
  onDelete?: () => void;
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
  onDelete,
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
            {isConfigured && onDelete && (
              <Button
                appearance="secondary"
                icon={<ErrorCircleRegular />}
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
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
  const [postgresConnectionString, setPostgresConnectionString] = useState('');

  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);
  const [qdrantKeyExists, setQdrantKeyExists] = useState(false);
  const [postgresConnectionExists, setPostgresConnectionExists] = useState(false);

  const [vectorDbProvider, setVectorDbProvider] = useState<'pinecone' | 'qdrant'>('pinecone');

  const [qdrantUrl, setQdrantUrl] = useState('');
  const [qdrantCollection, setQdrantCollection] = useState('');
  const [qdrantTestLoading, setQdrantTestLoading] = useState(false);

  // Debug logging for Qdrant state changes
  useEffect(() => {
    console.log('[SettingsTab] Qdrant state updated:', {
      url: qdrantUrl,
      collection: qdrantCollection,
      hasKey: !!qdrantKey,
      keyLength: qdrantKey.length,
      provider: vectorDbProvider
    });
  }, [qdrantUrl, qdrantCollection, qdrantKey, vectorDbProvider]);

  const [qdrantCollections, setQdrantCollections] = useState<Array<{ name: string }>>([]);
  const [qdrantCollectionsError, setQdrantCollectionsError] = useState<string | null>(null);
  const [isFetchingQdrantCollections, setIsFetchingQdrantCollections] = useState(false);

  // Embedding Provider State
  const [embeddingProvider, setEmbeddingProvider] = useState<'gemini' | 'ollama' | 'lmstudio' | 'openrouter'>('gemini');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('nomic-embed-text');
  const [ollamaDimension, setOllamaDimension] = useState(768);
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string }>>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const [isFetchingOllamaModels, setIsFetchingOllamaModels] = useState(false);
  const [isTestingDimension, setIsTestingDimension] = useState(false);
  
  // LM Studio State
  const [lmstudioBaseUrl, setLmstudioBaseUrl] = useState('http://localhost:1234/v1');
  const [lmstudioApiKey, setLmstudioApiKey] = useState('');
  const [lmstudioModel, setLmstudioModel] = useState('');
  const [lmstudioDimension, setLmstudioDimension] = useState(768);
  const [lmstudioModels, setLmstudioModels] = useState<Array<{ id: string }>>([]);
  const [lmstudioModelsError, setLmstudioModelsError] = useState<string | null>(null);
  const [isFetchingLMStudioModels, setIsFetchingLMStudioModels] = useState(false);
  const [isTestingLMStudioDimension, setIsTestingLMStudioDimension] = useState(false);

  // OpenRouter State
  const [openrouterBaseUrl, setOpenrouterBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState('openai/text-embedding-3-small');
  const [openrouterDimension, setOpenrouterDimension] = useState(1536);
  const [openrouterProviderOrder, setOpenrouterProviderOrder] = useState(['nebius']);
  const [openrouterAllowFallbacks, setOpenrouterAllowFallbacks] = useState(true);
  const [openrouterQuantizations, setOpenrouterQuantizations] = useState(['fp8']);
  const [openrouterModels, setOpenrouterModels] = useState<Array<{ id: string; name?: string; description?: string; context_length?: number }>>([]);
  const [openrouterModelsError, setOpenrouterModelsError] = useState<string | null>(null);
  const [isFetchingOpenRouterModels, setIsFetchingOpenRouterModels] = useState(false);
  const [isTestingOpenRouterDimension, setIsTestingOpenRouterDimension] = useState(false);
  const [isTestingOpenRouterConnection, setIsTestingOpenRouterConnection] = useState(false);

  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);
  const [copyMode, setCopyMode] = useState<string>('file');

  // Token Budget State
  const [tokenBudget, setTokenBudget] = useState<number>(50000);
  
  // Search Result Grouping State
  const [enableGrouping, setEnableGrouping] = useState<boolean>(true);
  
  // Load initial grouping setting
  useEffect(() => {
    vscode.postMessage({ command: 'getEnableGrouping' });
  }, []);

  // Compatibility status state
  const [compatibilityStatus, setCompatibilityStatus] = useState<{
    compatible: boolean;
    blocked: boolean;
    embeddingDimension: number;
    indexDimension?: number;
    message: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Repository Analysis State
  const [analysisStatus, setAnalysisStatus] = useState<{
    exists: boolean;
    valid: boolean;
    repoId?: string;
    generatedAt?: number;
    expiresAt?: number;
    framework?: string;
    configFileCount?: number;
    patternsCount?: number;
    guidesCount?: number;
    tokensUsed?: number;
    invalidationReason?: 'ttl' | 'hash' | 'git' | 'manual' | null;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{
    phase: string;
    current: number;
    total: number;
  } | null>(null);

  // Runner Configuration State
  const [respectGitignoreInMarkdown, setRespectGitignoreInMarkdown] = useState<boolean>(false);

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

  // Fetch Qdrant collections when URL or key changes
  useEffect(() => {
    if (!qdrantUrl.trim() || vectorDbProvider !== 'qdrant') {
      return;
    }
    console.log('[SettingsTab] Auto-fetching Qdrant collections due to URL/key change');
    setIsFetchingQdrantCollections(true);
    const timer = setTimeout(() => {
      vscode.postMessage({ 
        command: 'fetchQdrantCollections',
        apiKey: qdrantKey.trim() || undefined
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [qdrantUrl, qdrantKey, vectorDbProvider]);

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
        case 'enableGrouping':
          setEnableGrouping(message.enabled);
          break;
        case 'secretStatus':
          if (message.key === 'googleApiKey') setGoogleKeyExists(message.exists);
          else if (message.key === 'pineconeApiKey') setPineconeKeyExists(message.exists);
          else if (message.key === 'qdrantApiKey') setQdrantKeyExists(message.exists);
          break;

        case 'postgresConnectionStatus':
          setPostgresConnectionExists(message.exists);
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

        case 'tokenBudget':
          setTokenBudget(message.budget ?? 50000);
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
          setLmstudioBaseUrl(message.lmstudioBaseUrl || 'http://localhost:1234/v1');
          setLmstudioApiKey(message.lmstudioApiKey || '');
          setLmstudioModel(message.lmstudioModel || '');
          setLmstudioDimension(message.lmstudioDimension || 768);
          setOpenrouterBaseUrl(message.openrouterBaseUrl || 'https://openrouter.ai/api/v1');
          setOpenrouterApiKey(message.openrouterApiKey || '');
          setOpenrouterModel(message.openrouterModel || 'qwen/qwen3-embedding-8b');
          setOpenrouterDimension(message.openrouterDimension || 4096);
          setOpenrouterProviderOrder(message.openrouterProviderOrder || ['nebius']);
          setOpenrouterAllowFallbacks(message.openrouterAllowFallbacks ?? false);
          setOpenrouterQuantizations(message.openrouterQuantizations || ['fp8']);
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

        case 'lmstudioConfig':
          setLmstudioBaseUrl(message.baseUrl || 'http://localhost:1234/v1');
          setLmstudioApiKey(message.apiKey || '');
          setLmstudioModel(message.model || '');
          setLmstudioDimension(message.dimension || 768);
          break;

        case 'lmstudioModelsResult':
          setLmstudioModels(message.models || []);
          setLmstudioModelsError(message.error || null);
          setIsFetchingLMStudioModels(false);
          break;

        case 'lmstudioDimensionResult':
          setIsTestingLMStudioDimension(false);
          if (message.dimension) {
            setLmstudioDimension(message.dimension);
          }
          if (message.error) {
            vscode.postMessage({
              command: 'showNotification',
              type: 'error',
              message: `Dimension test failed: ${message.error}`,
            });
          }
          break;

        case 'openrouterConfig':
          setOpenrouterBaseUrl(message.baseUrl || 'https://openrouter.ai/api/v1');
          setOpenrouterApiKey(message.apiKey || '');
          setOpenrouterModel(message.model || 'qwen/qwen3-embedding-8b');
          setOpenrouterDimension(message.dimension || 4096);
          setOpenrouterProviderOrder(message.providerOrder || ['nebius']);
          setOpenrouterAllowFallbacks(message.allowFallbacks ?? false);
          setOpenrouterQuantizations(message.quantizations || ['fp8']);
          break;

        case 'openrouterModelsResult':
          setOpenrouterModels(message.models || []);
          setOpenrouterModelsError(message.error || null);
          setIsFetchingOpenRouterModels(false);
          break;

        case 'openrouterDimensionResult':
          setIsTestingOpenRouterDimension(false);
          if (message.dimension) {
            setOpenrouterDimension(message.dimension);
          }
          if (message.error) {
            vscode.postMessage({
              command: 'showNotification',
              type: 'error',
              message: `Dimension test failed: ${message.error}`,
            });
          }
          break;

        case 'openrouterConnectionResult':
          setIsTestingOpenRouterConnection(false);
          if (message.success) {
            vscode.postMessage({
              command: 'showNotification',
              type: 'info',
              message: message.message || 'OpenRouter connection test successful!',
            });
          } else {
            vscode.postMessage({
              command: 'showNotification',
              type: 'error',
              message: `Connection test failed: ${message.error}`,
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

        case 'analysisProgress':
          setAnalysisProgress({
            phase: message.phase,
            current: message.current,
            total: message.total
          });
          break;

        case 'analysisComplete':
          setIsAnalyzing(false);
          setAnalysisProgress(null);
          break;

        case 'analysisStatus':
          setAnalysisStatus({
            exists: message.exists,
            valid: message.valid,
            repoId: message.repoId,
            generatedAt: message.generatedAt,
            expiresAt: message.expiresAt,
            framework: message.framework,
            configFileCount: message.configFileCount,
            patternsCount: message.patternsCount,
            guidesCount: message.guidesCount,
            tokensUsed: message.tokensUsed,
            invalidationReason: message.invalidationReason
          });
          break;

        case 'runnerConfig':
          setRespectGitignoreInMarkdown(message.config.respectGitignoreInMarkdown);
          break;
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'qdrantApiKey' });
    vscode.postMessage({ command: 'checkPostgresConnection' });

    vscode.postMessage({ command: 'getVectorDbProvider' });
    vscode.postMessage({ command: 'getQdrantConfig' });

    vscode.postMessage({ command: 'getPineconeIndex' });
    vscode.postMessage({ command: 'getCopyMode' });
    vscode.postMessage({ command: 'getTokenBudget' });
    vscode.postMessage({ command: 'getEmbeddingConfig' });
    vscode.postMessage({ command: 'getLMStudioConfig' });
    vscode.postMessage({ command: 'checkCompatibility' });
    vscode.postMessage({ command: 'getAnalysisStatus' });
    vscode.postMessage({ command: 'getRunnerConfig' });

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

  const handleSavePostgresConnection = () => {
    vscode.postMessage({ command: 'savePostgresConnection', value: postgresConnectionString.trim() });
    setPostgresConnectionString('');
  };

  const handleDeletePostgresConnection = () => {
    vscode.postMessage({ command: 'deletePostgresConnection' });
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
    const provider = data.optionValue as 'gemini' | 'ollama' | 'lmstudio' | 'openrouter';
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

  const handleFetchLMStudioModels = () => {
    setIsFetchingLMStudioModels(true);
    setLmstudioModelsError(null);
    vscode.postMessage({ command: 'fetchLMStudioModels', baseUrl: lmstudioBaseUrl, apiKey: lmstudioApiKey });
  };

  const handleLMStudioModelSelect = (_e: any, data: any) => {
    const modelName = data.optionValue as string;
    setLmstudioModel(modelName);
    
    // Auto-test dimension when model is selected
    setIsTestingLMStudioDimension(true);
    vscode.postMessage({ 
      command: 'testLMStudioDimension', 
      baseUrl: lmstudioBaseUrl,
      apiKey: lmstudioApiKey,
      model: modelName 
    });
  };

  const handleFetchOpenRouterModels = () => {
    setIsFetchingOpenRouterModels(true);
    setOpenrouterModelsError(null);
    vscode.postMessage({ command: 'fetchOpenRouterModels' });
  };

  const handleOpenRouterModelSelect = (_e: any, data: any) => {
    const modelName = data.optionValue as string;
    setOpenrouterModel(modelName);
    
    // Auto-test dimension when model is selected
    setIsTestingOpenRouterDimension(true);
    vscode.postMessage({ 
      command: 'testOpenRouterDimension', 
      baseUrl: openrouterBaseUrl,
      apiKey: openrouterApiKey,
      model: modelName,
      providerOrder: openrouterProviderOrder,
      allowFallbacks: openrouterAllowFallbacks,
      quantizations: openrouterQuantizations
    });
  };

  const handleTestOpenRouterConnection = () => {
    if (!openrouterApiKey.trim()) {
      vscode.postMessage({
        command: 'showNotification',
        type: 'error',
        message: 'Please enter your OpenRouter API key first',
      });
      return;
    }

    setIsTestingOpenRouterConnection(true);
    vscode.postMessage({ 
      command: 'testOpenRouterConnection', 
      baseUrl: openrouterBaseUrl,
      apiKey: openrouterApiKey,
      model: openrouterModel,
      providerOrder: openrouterProviderOrder,
      allowFallbacks: openrouterAllowFallbacks,
      quantizations: openrouterQuantizations
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

    if (embeddingProvider === 'lmstudio') {
      if (!lmstudioBaseUrl.trim() || !lmstudioModel.trim() || lmstudioDimension <= 0) {
        vscode.postMessage({
          command: 'showNotification',
          type: 'error',
          message: 'Please fill in all LM Studio configuration fields',
        });
        return;
      }
    }

    if (embeddingProvider === 'openrouter') {
      if (!openrouterBaseUrl.trim() || !openrouterModel.trim() || openrouterDimension <= 0) {
        vscode.postMessage({
          command: 'showNotification',
          type: 'error',
          message: 'Please fill in all OpenRouter configuration fields',
        });
        return;
      }
    }

    const message: any = {
      command: 'setEmbeddingConfig',
      provider: embeddingProvider,
    };

    if (embeddingProvider === 'ollama') {
      message.ollamaUrl = ollamaUrl;
      message.ollamaModel = ollamaModel;
      message.ollamaDimension = ollamaDimension;
    } else if (embeddingProvider === 'lmstudio') {
      message.lmstudioBaseUrl = lmstudioBaseUrl;
      message.lmstudioApiKey = lmstudioApiKey;
      message.lmstudioModel = lmstudioModel;
      message.lmstudioDimension = lmstudioDimension;
    } else if (embeddingProvider === 'openrouter') {
      message.openrouterBaseUrl = openrouterBaseUrl;
      message.openrouterApiKey = openrouterApiKey;
      message.openrouterModel = openrouterModel;
      message.openrouterDimension = openrouterDimension;
      message.openrouterProviderOrder = openrouterProviderOrder;
      message.openrouterAllowFallbacks = openrouterAllowFallbacks;
      message.openrouterQuantizations = openrouterQuantizations;
    }

    vscode.postMessage(message);
  };

  const handleResetVectorIndex = () => {
    setIsResetting(true);
    vscode.postMessage({ command: 'resetVectorIndex' });
  };

  const handleAnalyzeRepository = () => {
    setIsAnalyzing(true);
    setAnalysisProgress(null);
    vscode.postMessage({ command: 'analyzeRepository' });
  };

  const handleRespectGitignoreToggle = (_ev: any, data: { checked: boolean }) => {
    const newValue = data.checked;
    setRespectGitignoreInMarkdown(newValue);
    vscode.postMessage({ 
      command: 'setRunnerConfig', 
      config: { respectGitignoreInMarkdown: newValue } 
    });
  };

  // Check if prerequisites are met for repository analysis
  const canAnalyze = googleKeyExists && (
    (vectorDbProvider === 'pinecone' && pineconeKeyExists && selectedPineconeIndex) ||
    (vectorDbProvider === 'qdrant' && qdrantUrl.trim() && qdrantCollection.trim())
  );

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

      {/* Context Budget Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Context Budget</Label>
        <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Label size="small">Token Limit</Label>
          <Dropdown 
            value={tokenBudget.toString()} 
            onOptionSelect={(_e, data) => {
              const budget = parseInt(data.optionValue as string) || 50000;
              setTokenBudget(budget);
              vscode.postMessage({ command: 'setTokenBudget', budget });
            }}
            style={{ width: '160px' }}
          >
            <Option value="20000">20k (Compact)</Option>
            <Option value="35000">35k (Balanced)</Option>
            <Option value="50000">50k (Standard)</Option>
            <Option value="75000">75k (Detailed)</Option>
            <Option value="100000">100k (Full)</Option>
          </Dropdown>
          <Text size={100} style={{ opacity: 0.7 }}>
            Controls how aggressively files are compressed during Smart Agent runs.
            Smaller budgets use more skeleton/summary compression.
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

      {/* Search Result Diversity Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Search Result Diversity</Label>
        <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="enable-grouping"
              type="checkbox"
              checked={enableGrouping}
              onChange={(e) => {
                setEnableGrouping(e.target.checked);
                // Save to extension state
                vscode.postMessage({ 
                  command: 'setEnableGrouping', 
                  enabled: e.target.checked 
                });
              }}
            />
            <Label htmlFor="enable-grouping" style={{ margin: 0 }}>
              Enable file-level grouping (one best chunk per file)
            </Label>
          </div>
          <Text size={100} style={{ opacity: 0.7 }}>
            When enabled, search results show the single best matching chunk from each file,
            ensuring diverse results across your codebase rather than multiple chunks from the same files.
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
              <Option value="lmstudio">LM Studio (Local)</Option>
              <Option value="openrouter">OpenRouter (Cloud)</Option>
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

          {/* LM Studio Configuration Accordion */}
          {embeddingProvider === 'lmstudio' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px',
              padding: '12px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--vscode-editor-background)'
            }}>
              <Label weight="semibold" size="small">LM Studio Connection Settings</Label>

              {/* Base URL Input */}
              <div>
                <Label size="small">Base URL</Label>
                <Input
                  placeholder="http://localhost:1234/v1"
                  value={lmstudioBaseUrl}
                  onChange={(_e, data) => setLmstudioBaseUrl(data.value)}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  LM Studio API base URL (usually http://localhost:1234/v1)
                </Text>
              </div>

              {/* API Key Input */}
              <div>
                <Label size="small">API Key (Optional)</Label>
                <Input
                  type="password"
                  placeholder="Leave blank if not required"
                  value={lmstudioApiKey}
                  onChange={(_e, data) => setLmstudioApiKey(data.value)}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  LM Studio API key (optional, leave blank if authentication is disabled)
                </Text>
              </div>

              {/* Model Manager */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <Label size="small">Model</Label>
                  <Button
                    size="small"
                    appearance="secondary"
                    icon={isFetchingLMStudioModels ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                    onClick={handleFetchLMStudioModels}
                    disabled={!lmstudioBaseUrl.trim() || isFetchingLMStudioModels}
                  >
                    Fetch Models
                  </Button>
                </div>
                <Dropdown
                  placeholder="Select a model"
                  value={lmstudioModel}
                  onOptionSelect={handleLMStudioModelSelect}
                  disabled={lmstudioModels.length === 0}
                >
                  {lmstudioModels.map((model) => (
                    <Option key={model.id} value={model.id}>{model.id}</Option>
                  ))}
                </Dropdown>
                {lmstudioModelsError && (
                  <Text size={100} style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}>
                    {lmstudioModelsError}
                  </Text>
                )}
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Select an embedding model loaded in LM Studio
                </Text>
              </div>

              {/* Dimension Input */}
              <div>
                <Label size="small">Embedding Dimension</Label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <Input
                    type="number"
                    value={lmstudioDimension.toString()}
                    onChange={(_e, data) => {
                      const val = parseInt(data.value);
                      if (!isNaN(val) && val > 0) {
                        setLmstudioDimension(val);
                      }
                    }}
                    style={{ width: '120px' }}
                    disabled={isTestingLMStudioDimension}
                  />
                  {isTestingLMStudioDimension && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Spinner size="tiny" />
                      <Text size={100}>Testing...</Text>
                    </div>
                  )}
                </div>
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Auto-detected when you select a model. Common values: 768, 1024, 4096
                </Text>
              </div>

              {/* Save Button */}
              <Button
                appearance="primary"
                onClick={handleSaveEmbeddingConfig}
                disabled={!lmstudioBaseUrl.trim() || !lmstudioModel.trim() || lmstudioDimension <= 0}
              >
                Save Embedding Configuration
              </Button>
            </div>
          )}

          {/* OpenRouter Configuration Accordion */}
          {embeddingProvider === 'openrouter' && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px',
              padding: '12px',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--vscode-editor-background)'
            }}>
              <Label weight="semibold" size="small">OpenRouter Connection Settings</Label>

              {/* Base URL Input */}
              <div>
                <Label size="small">Base URL</Label>
                <Input
                  placeholder="https://openrouter.ai/api/v1"
                  value={openrouterBaseUrl}
                  onChange={(_e, data) => setOpenrouterBaseUrl(data.value)}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  OpenRouter API base URL
                </Text>
              </div>

              {/* API Key Input */}
              <div>
                <Label size="small">API Key (Required)</Label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Input
                    type="password"
                    placeholder="Enter your OpenRouter API key"
                    value={openrouterApiKey}
                    onChange={(_e, data) => setOpenrouterApiKey(data.value)}
                    style={{ flexGrow: 1, marginTop: '4px' }}
                  />
                  <Button
                    appearance="secondary"
                    onClick={handleTestOpenRouterConnection}
                    disabled={!openrouterApiKey.trim() || isTestingOpenRouterConnection}
                    style={{ marginTop: '4px' }}
                  >
                    {isTestingOpenRouterConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  OpenRouter API key (required for authentication). Test to verify connection.
                </Text>
              </div>

              {/* Model Manager */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <Label size="small">Model</Label>
                  <Button
                    size="small"
                    appearance="secondary"
                    icon={isFetchingOpenRouterModels ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                    onClick={handleFetchOpenRouterModels}
                    disabled={isFetchingOpenRouterModels}
                  >
                    Fetch Models
                  </Button>
                </div>
                <Dropdown
                  placeholder="Select a model"
                  value={openrouterModel}
                  onOptionSelect={handleOpenRouterModelSelect}
                  disabled={openrouterModels.length === 0}
                >
                  {openrouterModels.map((model) => (
                    <Option key={model.id} value={model.id}>{model.name || model.id}</Option>
                  ))}
                </Dropdown>
                {openrouterModelsError && (
                  <Text size={100} style={{ color: 'var(--vscode-errorForeground)', marginTop: '4px' }}>
                    {openrouterModelsError}
                  </Text>
                )}
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Recommended: qwen/qwen3-embedding-8b (4096d, 32k context)
                </Text>
              </div>

              {/* Provider Routing */}
              <div>
                <Label size="small">Provider Order (Optional)</Label>
                <Input
                  placeholder="nebius"
                  value={openrouterProviderOrder.join(', ')}
                  onChange={(_e, data) => {
                    const providers = data.value.split(',').map(p => p.trim()).filter(p => p);
                    setOpenrouterProviderOrder(providers);
                  }}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Comma-separated list of providers to route through (e.g., "nebius")
                </Text>
              </div>

              {/* Quantization */}
              <div>
                <Label size="small">Quantizations (Optional)</Label>
                <Input
                  placeholder="fp8"
                  value={openrouterQuantizations.join(', ')}
                  onChange={(_e, data) => {
                    const quants = data.value.split(',').map(q => q.trim()).filter(q => q);
                    setOpenrouterQuantizations(quants);
                  }}
                  style={{ marginTop: '4px' }}
                />
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Comma-separated quantization levels (e.g., "fp8", "fp16")
                </Text>
              </div>

              {/* Dimension Input */}
              <div>
                <Label size="small">Embedding Dimension</Label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <Input
                    type="number"
                    value={openrouterDimension.toString()}
                    onChange={(_e, data) => {
                      const val = parseInt(data.value);
                      if (!isNaN(val) && val > 0) {
                        setOpenrouterDimension(val);
                      }
                    }}
                    style={{ width: '120px' }}
                    disabled={isTestingOpenRouterDimension}
                  />
                  {isTestingOpenRouterDimension && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Spinner size="tiny" />
                      <Text size={100}>Testing...</Text>
                    </div>
                  )}
                </div>
                <Text size={100} style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                  Auto-detected when you select a model. Default: 4096 for qwen3
                </Text>
              </div>

              {/* Save Button */}
              <Button
                appearance="primary"
                onClick={handleSaveEmbeddingConfig}
                disabled={!openrouterBaseUrl.trim() || !openrouterModel.trim() || openrouterDimension <= 0}
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
        title="PostgreSQL Connection String"
        isConfigured={postgresConnectionExists}
        value={postgresConnectionString}
        onChange={setPostgresConnectionString}
        onSave={handleSavePostgresConnection}
        onDelete={handleDeletePostgresConnection}
        placeholder="postgresql://user:password@localhost:5432/database"
        description="Securely stored connection string for chat history persistence. Contains database credentials - stored encrypted in VS Code secrets."
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
                console.log('[SettingsTab] Manual fetch Qdrant collections with current key');
                setIsFetchingQdrantCollections(true);
                vscode.postMessage({ 
                  command: 'fetchQdrantCollections',
                  apiKey: qdrantKey.trim() || undefined
                });
              }}
              disabled={!qdrantUrl.trim() || isFetchingQdrantCollections}
              appearance="secondary"
            />
          </div>
          {qdrantCollections.length > 0 && (
            <Text size={100} style={{ color: 'var(--vscode-charts-green)' }}>
              ✓ Found {qdrantCollections.length} collection{qdrantCollections.length !== 1 ? 's' : ''}
            </Text>
          )}
          {isFetchingQdrantCollections && (
            <Text size={100} style={{ color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
              Fetching collections...
            </Text>
          )}
          {qdrantCollectionsError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Text size={100} style={{ color: 'var(--vscode-errorForeground)' }}>
                {qdrantCollectionsError}
              </Text>
              <Text size={100} style={{ color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                Tip: Check your Qdrant URL, API key, and network connectivity
              </Text>
            </div>
          )}
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

      <Divider />

      {/* Markdown Generation Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Label weight="semibold">Markdown Generation</Label>
        <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="respect-gitignore-markdown"
              type="checkbox"
              checked={respectGitignoreInMarkdown}
              onChange={(e) => {
                setRespectGitignoreInMarkdown(e.target.checked);
                vscode.postMessage({ 
                  command: 'setRunnerConfig', 
                  config: { respectGitignoreInMarkdown: e.target.checked } 
                });
              }}
            />
            <Label htmlFor="respect-gitignore-markdown" style={{ margin: 0 }}>
              Respect .gitignore in markdown generation
            </Label>
          </div>
          <Text size={100} style={{ opacity: 0.7 }}>
            When enabled, markdown generation (context menu actions) will exclude files that match .gitignore patterns,
            including those in subfolders. Explicit file selections are always included.
          </Text>
        </div>
      </div>

      <Divider />

      {/* Repository Analysis Section */}
      {canAnalyze && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Label weight="semibold">Repository Analysis</Label>
          <div style={{
            padding: '12px',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            backgroundColor: 'var(--vscode-editor-background)'
          }}>
            {/* Status Display */}
            {analysisStatus?.exists ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {analysisStatus.valid ? (
                    <CheckmarkCircleRegular style={{ color: 'var(--vscode-charts-green)' }} />
                  ) : (
                    <WarningRegular style={{ color: 'var(--vscode-editorWarning-foreground)' }} />
                  )}
                  <Text weight="semibold">
                    Status: {analysisStatus.valid ? 'Valid' : 'Stale'}
                    {analysisStatus.invalidationReason && ` (${analysisStatus.invalidationReason})`}
                  </Text>
                </div>
                {analysisStatus.generatedAt && (
                  <Text size={200}>
                    Last analyzed: {new Date(analysisStatus.generatedAt).toLocaleString()}
                  </Text>
                )}
                {analysisStatus.framework && (
                  <Text size={200}>Framework: {analysisStatus.framework}</Text>
                )}
                <div style={{ display: 'flex', gap: '16px' }}>
                  <Text size={100} style={{ opacity: 0.7 }}>
                    Config files: {analysisStatus.configFileCount || 0}
                  </Text>
                  <Text size={100} style={{ opacity: 0.7 }}>
                    Patterns: {analysisStatus.patternsCount || 0}
                  </Text>
                  <Text size={100} style={{ opacity: 0.7 }}>
                    Guides: {analysisStatus.guidesCount || 0}
                  </Text>
                </div>
                {analysisStatus.expiresAt && (
                  <Text size={100} style={{ opacity: 0.7 }}>
                    Expires: {new Date(analysisStatus.expiresAt).toLocaleString()}
                  </Text>
                )}
              </div>
            ) : (
              <Text size={200} style={{ opacity: 0.7 }}>
                No analysis available. Click below to analyze your repository.
              </Text>
            )}

            {/* Progress Indicator */}
            {isAnalyzing && analysisProgress && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Spinner size="tiny" />
                  <Text size={200}>{analysisProgress.phase}</Text>
                </div>
                <div style={{
                  height: '4px',
                  backgroundColor: 'var(--vscode-progressBar-background)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(analysisProgress.current / analysisProgress.total) * 100}%`,
                    backgroundColor: 'var(--vscode-progressBar-foreground)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <Text size={100} style={{ opacity: 0.7, marginTop: '4px' }}>
                  Step {analysisProgress.current} of {analysisProgress.total}
                </Text>
              </div>
            )}

            {/* Analyze Button */}
            <Button
              appearance="primary"
              onClick={handleAnalyzeRepository}
              disabled={isAnalyzing}
              style={{ marginTop: '12px' }}
            >
              {isAnalyzing ? (
                <>
                  <Spinner size="tiny" style={{ marginRight: '8px' }} />
                  Analyzing...
                </>
              ) : analysisStatus?.exists ? (
                'Re-analyze Repository'
              ) : (
                'Analyze Repository'
              )}
            </Button>

            <Text size={100} style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
              Generates architectural insights and development guides for your repository.
              Uses LLM to identify patterns and create how-to documentation.
            </Text>
          </div>
        </div>
      )}
    </div>
  );
};