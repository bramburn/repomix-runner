import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Select,
  Option,
  Slider,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SecretInput } from './SecretInput.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { vscode } from '../../vscode-api.js';
import { Play20Regular, ArrowClockwise20Regular, Database20Regular } from '@fluentui/react-icons';

interface ChatSettings {
  postgresConnectionString?: string;
  planningModel?: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite';
  batchModel: string;
  batchMaxTokens: number;
  batchThinkingBudget: number;
  batchPollIntervalSeconds: number;
  contextThresholdPercent: number;
  maxRecentMessages: number;
  fileCompressionLevel?: 'auto' | 'full' | 'skeleton' | 'summary';
  editMode: 'full' | 'search_replace' | 'hybrid';
  hybridThresholdLines: number;
  fuzzyMatchThreshold: number;
  architectureRefreshHours: number;
  architectureLastGenerated?: number;
  architectureStatus?: 'fresh' | 'stale' | 'missing';
}

type ConnectionStatusType = 'disconnected' | 'connecting' | 'connected' | 'error';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
  },
  header: {
    marginBottom: tokens.spacingVerticalL,
  },
  section: {
    marginBottom: tokens.spacingVerticalXL,
    padding: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `2px solid ${tokens.colorNeutralStroke1}`,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: tokens.spacingVerticalM,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  formGroup: {
    marginBottom: tokens.spacingVerticalM,
  },
  label: {
    display: 'block',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    marginBottom: tokens.spacingVerticalXS,
  },
  description: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
  },
  buttonRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  slider: {
    width: '100%',
  },
});

export const ChatSettingsTab: React.FC = () => {
  const styles = useStyles();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>('disconnected');
  const [connectionError, setConnectionError] = useState<string>();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isRunningMigrations, setIsRunningMigrations] = useState(false);
  const [isRefreshingArchitecture, setIsRefreshingArchitecture] = useState(false);

  // Load settings on mount
  useEffect(() => {
    vscode.postMessage({ command: 'getChatSettings' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'chatSettingsResult') {
        setSettings(message.settings);
      }
      if (message.command === 'postgresConnectionResult') {
        setIsTestingConnection(false);
        if (message.success) {
          setConnectionStatus('connected');
          setConnectionError(undefined);
        } else {
          setConnectionStatus('error');
          setConnectionError(message.error);
        }
      }
      if (message.command === 'migrationsComplete') {
        setIsRunningMigrations(false);
        if (message.success) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          setConnectionError(message.error);
        }
      }
      if (message.command === 'architectureStatus') {
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                architectureLastGenerated: message.lastGenerated,
                architectureStatus: message.status,
              }
            : prev
        );
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleTestConnection = useCallback(() => {
    setIsTestingConnection(true);
    setConnectionStatus('connecting');
    vscode.postMessage({ command: 'testPostgresConnection' });
  }, []);

  const handleRunMigrations = useCallback(() => {
    setIsRunningMigrations(true);
    vscode.postMessage({ command: 'runMigrations' });
  }, []);

  const handleRefreshArchitecture = useCallback(() => {
    setIsRefreshingArchitecture(true);
    vscode.postMessage({ command: 'refreshArchitectureNow' });
    setTimeout(() => setIsRefreshingArchitecture(false), 5000);
  }, []);

  const handleSettingChange = useCallback((key: keyof ChatSettings, value: any) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    vscode.postMessage({
      command: 'setChatSetting',
      key,
      value,
    });
  }, []);

  if (!settings) {
    return (
      <div className={styles.container}>
        <Text>Loading settings...</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Chat Settings
        </Text>
      </div>

      {/* Section 1: Database Connection */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Database20Regular />
          Database Connection
        </div>
        <SecretInput
          secretKey="postgresConnectionString"
          label="PostgreSQL Connection String"
          placeholder="postgresql://user:pass@host:5432/dbname"
          description="Connection string for chat storage PostgreSQL database"
        />
        <ConnectionStatus status={connectionStatus} errorMessage={connectionError} />
        <div className={styles.buttonRow}>
          <Button
            appearance="primary"
            onClick={handleTestConnection}
            disabled={isTestingConnection || isRunningMigrations}
            icon={<Play20Regular />}
          >
            {isTestingConnection ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            appearance="secondary"
            onClick={handleRunMigrations}
            disabled={isRunningMigrations || connectionStatus !== 'connected'}
          >
            {isRunningMigrations ? 'Running...' : 'Run Migrations'}
          </Button>
        </div>
      </div>

      {/* Section 2: Planning LLM (Gemini Flash) */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🧠 Planning LLM (Gemini Flash)</div>
        <SecretInput
          secretKey="googleApiKey"
          label="Google API Key"
          placeholder="Enter your Google API key"
          description="API key for Gemini Flash planning model"
        />
        <div className={styles.formGroup}>
          <label className={styles.label}>Planning Model</label>
          <Select
            value={settings.planningModel || 'gemini-2.5-flash'}
            onChange={(_, data) =>
              handleSettingChange('planningModel', data.value as 'gemini-2.5-flash' | 'gemini-2.5-flash-lite')
            }
            style={{ width: '100%' }}
          >
            <Option value="gemini-2.5-flash">gemini-2.5-flash</Option>
            <Option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</Option>
          </Select>
          <div className={styles.description}>LLM model for planning and orchestration</div>
        </div>
      </div>

      {/* Section 3: Batch LLM (Claude Opus) */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🤖 Batch LLM (Claude Opus)</div>
        <SecretInput
          secretKey="anthropicApiKey"
          label="Anthropic API Key"
          placeholder="Enter your Anthropic API key"
          description="API key for Anthropic Batch API"
        />
        <div className={styles.formGroup}>
          <label className={styles.label}>Batch Model</label>
          <Input value={settings.batchModel} disabled readOnly />
          <div className={styles.description}>Anthropic model ID used for batch jobs</div>
        </div>
        <div className={styles.row}>
          <div className={styles.column}>
            <label className={styles.label}>Max Output Tokens</label>
            <Input
              type="number"
              value={settings.batchMaxTokens.toString()}
              onChange={(_, data) => handleSettingChange('batchMaxTokens', parseInt(data.value, 10))}
              min={1024}
              max={64000}
            />
            <div className={styles.description}>Maximum output tokens per batch request</div>
          </div>
          <div className={styles.column}>
            <label className={styles.label}>Thinking Budget</label>
            <Input
              type="number"
              value={settings.batchThinkingBudget.toString()}
              onChange={(_, data) => handleSettingChange('batchThinkingBudget', parseInt(data.value, 10))}
              min={0}
              max={32000}
            />
            <div className={styles.description}>Extended thinking token budget</div>
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Poll Interval (seconds)</label>
          <Input
            type="number"
            value={settings.batchPollIntervalSeconds.toString()}
            onChange={(_, data) => handleSettingChange('batchPollIntervalSeconds', parseInt(data.value, 10))}
            min={10}
            max={600}
          />
          <div className={styles.description}>How often to poll for batch job completion</div>
        </div>
      </div>

      {/* Section 4: Context Management */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🧠 Context Management</div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Context Threshold: {settings.contextThresholdPercent}%</label>
          <Slider
            className={styles.slider}
            min={50}
            max={95}
            step={1}
            value={settings.contextThresholdPercent}
            onChange={(_, data) => handleSettingChange('contextThresholdPercent', data.value)}
            showValue
          />
          <div className={styles.description}>
            Context window usage % that triggers automatic compression
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Max Recent Messages</label>
          <Input
            type="number"
            value={settings.maxRecentMessages.toString()}
            onChange={(_, data) => handleSettingChange('maxRecentMessages', parseInt(data.value, 10))}
            min={3}
            max={50}
          />
          <div className={styles.description}>Number of recent messages to keep in full before summarizing</div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>File Compression Level</label>
          <Select
            value={settings.fileCompressionLevel || 'auto'}
            onChange={(_, data) =>
              handleSettingChange('fileCompressionLevel', data.value as 'auto' | 'full' | 'skeleton' | 'summary')
            }
            style={{ width: '100%' }}
          >
            <Option value="auto">Auto (default)</Option>
            <Option value="full">Full (keep all content)</Option>
            <Option value="skeleton">Skeleton (AST structure only)</Option>
            <Option value="summary">Summary (AI-generated summary)</Option>
          </Select>
          <div className={styles.description}>How to compress files in chat context</div>
        </div>
      </div>

      {/* Section 5: File Edit Mode */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>✏️ File Edit Mode</div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Edit Mode</label>
          <Select
            value={settings.editMode}
            onChange={(_, data) => handleSettingChange('editMode', data.value as 'full' | 'search_replace' | 'hybrid')}
            style={{ width: '100%' }}
          >
            <Option value="full">Full (rewrite entire file)</Option>
            <Option value="search_replace">SEARCH/REPLACE (patch mode)</Option>
            <Option value="hybrid">Hybrid (auto-select based on file size)</Option>
          </Select>
          <div className={styles.description}>How to apply file edits from batch responses</div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Hybrid Threshold: {settings.hybridThresholdLines} lines</label>
          <Slider
            className={styles.slider}
            min={50}
            max={1000}
            step={10}
            value={settings.hybridThresholdLines}
            onChange={(_, data) => handleSettingChange('hybridThresholdLines', data.value)}
            showValue
          />
          <div className={styles.description}>
            Files with line count >= this threshold use SEARCH/REPLACE mode
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Fuzzy Match Threshold: {settings.fuzzyMatchThreshold.toFixed(2)}</label>
          <Slider
            className={styles.slider}
            min={0.5}
            max={1}
            step={0.01}
            value={settings.fuzzyMatchThreshold}
            onChange={(_, data) => handleSettingChange('fuzzyMatchThreshold', data.value)}
            showValue
          />
          <div className={styles.description}>Similarity threshold for fuzzy SEARCH/REPLACE matching</div>
        </div>
      </div>

      {/* Section 6: Architecture Document */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🏛️ Architecture Document</div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Auto-Refresh Interval: {settings.architectureRefreshHours} hours</label>
          <Input
            type="number"
            value={settings.architectureRefreshHours.toString()}
            onChange={(_, data) => handleSettingChange('architectureRefreshHours', parseInt(data.value, 10))}
            min={1}
            max={168}
          />
          <div className={styles.description}>Hours between automatic architecture document refreshes</div>
        </div>
        <div className={styles.buttonRow}>
          <Button
            appearance="primary"
            onClick={handleRefreshArchitecture}
            disabled={isRefreshingArchitecture}
            icon={<ArrowClockwise20Regular />}
          >
            {isRefreshingArchitecture ? 'Refreshing...' : 'Refresh Now'}
          </Button>
        </div>
        {settings.architectureLastGenerated && (
          <div className={styles.formGroup}>
            <Text size={200}>
              Last Generated:{' '}
              {new Date(settings.architectureLastGenerated).toLocaleString()}
            </Text>
          </div>
        )}
        {settings.architectureStatus && (
          <div className={styles.formGroup}>
            <Text size={200}>
              Status:{' '}
              <span
                style={{
                  color:
                    settings.architectureStatus === 'fresh'
                      ? tokens.colorPaletteGreenForeground1
                      : settings.architectureStatus === 'stale'
                      ? tokens.colorPaletteYellowForeground1
                      : tokens.colorNeutralForeground3,
                }}
              >
                {settings.architectureStatus.toUpperCase()}
              </span>
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};
