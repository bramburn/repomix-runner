import React, { useState, useEffect } from 'react';
import { Button, Text, Spinner, Label, Textarea, Input, Divider } from '@fluentui/react-components';
import { PlayRegular, CopyRegular, SaveRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { updateVsState } from '../utils.js';
import { AgentState, AgentRunHistoryItem } from '../types.js';
import { useStyles } from '../styles.js';

export const AgentView = () => {
  const styles = useStyles();
  const initialState = vscode.getState() || {};

  const [query, setQuery] = useState(initialState.agentQuery || '');
  const [apiKey, setApiKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [history, setHistory] = useState<AgentRunHistoryItem[]>([]);
  const [agentState, setAgentState] = useState<AgentState>({
    lastOutputPath: initialState.agentLastRun?.lastOutputPath,
    lastFileCount: initialState.agentLastRun?.lastFileCount,
    lastQuery: initialState.agentLastRun?.lastQuery,
    lastTokens: initialState.agentLastRun?.lastTokens,
    runFailed: initialState.agentLastRun?.runFailed ?? false
  });

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.command === 'apiKeyStatus') {
        setHasKey(event.data.hasKey);
      }
      if (event.data.command === 'agentStateChange') {
        setIsRunning(event.data.status === 'running');
      }
      if (event.data.command === 'agentRunComplete') {
        setIsRunning(false);
        const newState = {
          lastOutputPath: event.data.outputPath,
          lastFileCount: event.data.fileCount,
          lastQuery: event.data.query,
          lastTokens: event.data.tokens,
          runFailed: false
        };
        setAgentState(newState);
        updateVsState({ agentLastRun: newState });
      }
      if (event.data.command === 'agentRunFailed') {
        setIsRunning(false);
        setAgentState(prev => {
          const newState = {
            ...prev,
            runFailed: true,
            lastOutputPath: undefined,
            lastFileCount: 0
          };
          updateVsState({ agentLastRun: newState });
          return newState;
        });
      }
      if (event.data.command === 'agentHistory') {
        setHistory(event.data.history || []);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'checkApiKey' });
    vscode.postMessage({ command: 'getAgentHistory' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRun = () => {
    if (!query) return;
    setAgentState(prev => ({
      ...prev,
      lastOutputPath: undefined, // Reset output path for new run
      runFailed: false
    }));
    vscode.postMessage({ command: 'runSmartAgent', query });
  };

  const handleRerunAgent = (runId: string, useSavedFiles: boolean) => {
    vscode.postMessage({ command: 'rerunAgent', runId, useSavedFiles });
  };

  const handleCopyAgentOutput = (runId: string) => {
    vscode.postMessage({ command: 'copyAgentOutput', runId });
  };

  const handleCopyLastAgentOutput = () => {
    if (!agentState.lastOutputPath) {
      // Error will be handled by the webview provider
      return;
    }
    vscode.postMessage({ command: 'copyLastAgentOutput', outputPath: agentState.lastOutputPath });
  };

  const handleSaveKey = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
        return;
    }
    vscode.postMessage({ command: 'saveApiKey', apiKey: trimmedKey });
    setApiKey(''); // Clear input for security
  };

  return (
    <div className={styles.agentViewContainer}>
      <div className={styles.agentInputContainer}>
        <Label weight="semibold">Ask the Agent</Label>
        <Textarea
          placeholder="e.g., 'Package all auth logic excluding tests'"
          value={query}
          onChange={(e, data) => {
            setQuery(data.value);
            updateVsState({ agentQuery: data.value });
          }}
          rows={4}
        />
        <Button
          appearance="primary"
          icon={isRunning ? <Spinner size="tiny"/> : <PlayRegular />}
          disabled={isRunning || !query}
          onClick={handleRun}
        >
          {isRunning ? 'Agent Working...' : 'Run Agent'}
        </Button>

        {/* Copy Button - appears after successful run */}
        {agentState.lastOutputPath && !isRunning && (
          <Button
            appearance="subtle"
            icon={<CopyRegular />}
            onClick={handleCopyLastAgentOutput}
            style={{ width: '100%' }}
            title={`Copy generated file (${agentState.lastFileCount} files packaged)`}
          >
            Copy Generated File ({agentState.lastFileCount} files)
          </Button>
        )}
      </div>

      {/* Success/Failure Message */}
      {agentState.lastOutputPath && !isRunning && (
        <div className={styles.successMessage}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Text size={100} style={{ color: 'var(--vscode-foreground)' }}>
              ✓ Successfully packaged {agentState.lastFileCount} files for: "{agentState.lastQuery}"
            </Text>

            {/* Token Usage Badge */}
            {agentState.lastTokens && agentState.lastTokens > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                background: 'var(--vscode-badge-background)',
                color: 'var(--vscode-badge-foreground)',
                padding: '2px 8px',
                borderRadius: '10px',
                opacity: 0.9,
                flexShrink: 0
              }} title="Total Gemini tokens used for this request">
                <span>⚡</span>
                <span>{agentState.lastTokens.toLocaleString()} tokens</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {agentState.runFailed && !isRunning && query && (
        <div className={styles.errorMessage}>
          <Text size={100} style={{ color: 'var(--vscode-foreground)' }}>
            ⚠ No relevant files found for the query
          </Text>
        </div>
      )}

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <Label weight="semibold">Smart Agent Configuration</Label>

        {hasKey ? (
           <Text size={200} style={{ color: '#4caf50' }}>
             ✅ API Key Configured
           </Text>
        ) : (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <Text size={200} style={{ color: '#ffb74d' }}>
               ⚠️ API Key Missing
             </Text>
             <Text size={100} style={{ opacity: 0.8 }}>
               Please configure your Google API Key below to use the Smart Agent.
             </Text>
           </div>
        )}

        <div style={{ display: 'flex', gap: '5px' }}>
          <Input
            type="password"
            placeholder="Paste Gemini API Key"
            value={apiKey}
            onChange={(e, data) => {
              setApiKey(data.value);
            }}
            style={{ flexGrow: 1 }}
          />
          <Button
            icon={<SaveRegular />}
            onClick={handleSaveKey}
            disabled={!apiKey.trim()}
          >
            Save
          </Button>
        </div>
        <Text size={100} style={{opacity: 0.7}}>
          Key is stored securely in VS Code Secrets.
        </Text>
      </div>

      <Divider />

      {/* Agent History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Label weight="semibold">Agent Run History</Label>
        {history.length === 0 ? (
          <Text size={200} style={{ opacity: 0.7 }}>
            No agent runs yet
          </Text>
        ) : (
          <div className={styles.historyList}>
            {history.map(item => (
              <div
                key={item.id}
                className={styles.historyItem}
                style={{
                  opacity: item.success ? 1 : 0.7,
                }}
                title={`${item.query}\n${item.fileCount} files${item.duration ? ` • ${Math.round(item.duration / 1000)}s` : ''}${item.error ? `\nError: ${item.error}` : ''}`}
                onClick={() => {
                  if (item.outputPath) {
                    vscode.postMessage({
                      command: 'openFile',
                      path: item.outputPath
                    });
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <Text size={200} style={{
                    fontWeight: 'semibold',
                    color: item.success ? 'var(--vscode-foreground)' : 'var(--vscode-errorForeground)',
                    flex: 1,
                    marginRight: '8px'
                  }}>
                    {item.query.substring(0, 50)}
                    {item.query.length > 50 ? '...' : ''}
                  </Text>
                  <Text size={100} style={{
                    opacity: 0.7,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text size={100} style={{ opacity: 0.7 }}>
                    {item.fileCount} file{item.fileCount !== 1 ? 's' : ''} • {item.success ? 'Success' : 'Failed'}
                    {item.duration && ` • ${Math.round(item.duration / 1000)}s`}
                  </Text>
                  {item.outputPath && (
                    <Text
                      size={100}
                      style={{
                        opacity: 0.8,
                        color: 'var(--vscode-textLink-foreground)',
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        vscode.postMessage({
                          command: 'openFile',
                          path: item.outputPath
                        });
                      }}
                    >
                      View Output
                    </Text>
                  )}
                </div>
                {item.error && (
                  <Text
                    size={100}
                    style={{
                      opacity: 0.8,
                      color: 'var(--vscode-errorForeground)',
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}
                  >
                    {item.error.substring(0, 100)}
                    {item.error.length > 100 ? '...' : ''}
                  </Text>
                )}

                {/* Action Buttons */}
                {item.success && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<PlayRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRerunAgent(item.id, false);
                      }}
                      title="Re-run query on latest files"
                    >
                      Fresh Scan
                    </Button>

                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<CopyRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRerunAgent(item.id, true);
                      }}
                      title="Re-pack using saved file list"
                    >
                      Re-pack Files
                    </Button>

                    {item.outputPath && (
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<CopyRegular />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyAgentOutput(item.id);
                        }}
                        title="Copy generated output"
                      >
                        Copy Output
                      </Button>
                    )}

                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<ArrowClockwiseRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        vscode.postMessage({ command: 'regenerateAgentRun', runId: item.id });
                      }}
                      disabled={!item.success}
                      title="Regenerate this output file"
                    >
                      Regenerate
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
