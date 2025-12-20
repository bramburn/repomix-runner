import React from 'react';
import { Text } from '@fluentui/react-components';

interface AgentStatusProps {
  lastOutputPath?: string;
  lastFileCount?: number;
  lastQuery?: string;
  lastTokens?: number;
  runFailed: boolean;
  isRunning: boolean;
  query: string;
}

export const AgentStatus: React.FC<AgentStatusProps> = ({
  lastOutputPath,
  lastFileCount,
  lastQuery,
  lastTokens,
  runFailed,
  isRunning,
  query
}) => {
  if (isRunning) return null;

  if (lastOutputPath) {
    return (
      <div style={{
        padding: '12px',
        backgroundColor: 'var(--vscode-inputValidation-infoBackground)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-inputValidation-infoBorder)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <Text size={100} style={{ color: 'var(--vscode-foreground)' }}>
            ✓ Successfully packaged {lastFileCount} files for: "{lastQuery}"
          </Text>

          {/* Token Usage Badge */}
          {lastTokens && lastTokens > 0 && (
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
              <span>{lastTokens.toLocaleString()} tokens</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (runFailed && query) {
    return (
      <div style={{
        padding: '8px',
        backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-inputValidation-warningBorder)'
      }}>
        <Text size={100} style={{ color: 'var(--vscode-foreground)' }}>
          ⚠ No relevant files found for the query
        </Text>
      </div>
    );
  }

  return null;
};
