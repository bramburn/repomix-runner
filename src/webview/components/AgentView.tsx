import React, { useState, useEffect } from 'react';
import { Divider } from '@fluentui/react-components';
import { vscode } from '../vscode-api.js';
import { updateVsState } from '../utils.js';
import { AgentState, AgentRunHistoryItem } from '../types.js';
import { AgentInput } from './agent/AgentInput.js';
import { AgentStatus } from './agent/AgentStatus.js';
import { AgentConfiguration } from './agent/AgentConfiguration.js';
import { AgentHistory } from './agent/AgentHistory.js';

export const AgentView = () => {
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
      if (event.data.command === 'secretStatus' && event.data.key === 'googleApiKey') {
        setHasKey(event.data.exists);
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
    // Check both for compatibility/robustness
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
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
    if (!agentState.lastOutputPath) return;
    vscode.postMessage({ command: 'copyLastAgentOutput', outputPath: agentState.lastOutputPath });
  };

  const handleRegenerateAgentRun = (runId: string) => {
    vscode.postMessage({ command: 'regenerateAgentRun', runId });
  };

  const handleOpenFile = (path: string) => {
    vscode.postMessage({ command: 'openFile', path });
  };

  const handleSaveKey = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
        return;
    }
    vscode.postMessage({ command: 'saveSecret', key: 'googleApiKey', value: trimmedKey });
    setApiKey(''); // Clear input for security
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px 0' }}>
      <AgentInput
        query={query}
        onQueryChange={(val) => {
          setQuery(val);
          updateVsState({ agentQuery: val });
        }}
        isRunning={isRunning}
        onRun={handleRun}
        lastOutputPath={agentState.lastOutputPath}
        lastFileCount={agentState.lastFileCount}
        onCopyLastOutput={handleCopyLastAgentOutput}
      />

      <AgentStatus
        lastOutputPath={agentState.lastOutputPath}
        lastFileCount={agentState.lastFileCount}
        lastQuery={agentState.lastQuery}
        lastTokens={agentState.lastTokens}
        runFailed={agentState.runFailed}
        isRunning={isRunning}
        query={query}
      />

      <Divider />

      <AgentConfiguration
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        hasKey={hasKey}
        onSaveKey={handleSaveKey}
      />

      <Divider />

      <AgentHistory
        history={history}
        onRerun={handleRerunAgent}
        onCopyOutput={handleCopyAgentOutput}
        onRegenerate={handleRegenerateAgentRun}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
};
