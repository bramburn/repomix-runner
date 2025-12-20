import React from 'react';
import { Button, Text, Label } from '@fluentui/react-components';
import { CopyRegular, PlayRegular, ArrowClockwiseRegular } from '@fluentui/react-icons';
import { AgentRunHistoryItem } from '../../types.js';

interface AgentHistoryProps {
  history: AgentRunHistoryItem[];
  onRerun: (id: string, useSavedFiles: boolean) => void;
  onCopyOutput: (id: string) => void;
  onRegenerate: (id: string) => void;
  onOpenFile: (path: string) => void;
}

export const AgentHistory: React.FC<AgentHistoryProps> = ({
  history,
  onRerun,
  onCopyOutput,
  onRegenerate,
  onOpenFile
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Label weight="semibold">Agent Run History</Label>
      {history.length === 0 ? (
        <Text size={200} style={{ opacity: 0.7 }}>
          No agent runs yet
        </Text>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          maxHeight: '300px',
          overflowY: 'auto',
          paddingRight: '5px' // Add some padding for scrollbar
        }}>
          {history.map(item => (
            <div
              key={item.id}
              style={{
                padding: '10px',
                backgroundColor: 'var(--vscode-editor-background)',
                borderRadius: '4px',
                border: '1px solid var(--vscode-widget-border)',
                opacity: item.success ? 1 : 0.7,
                cursor: 'pointer'
              }}
              title={`${item.query}\n${item.fileCount} files${item.duration ? ` • ${Math.round(item.duration / 1000)}s` : ''}${item.error ? `\nError: ${item.error}` : ''}`}
              onClick={() => {
                if (item.outputPath) {
                  onOpenFile(item.outputPath);
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
                      onOpenFile(item.outputPath!);
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
                      onRerun(item.id, false);
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
                      onRerun(item.id, true);
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
                        onCopyOutput(item.id);
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
                      onRegenerate(item.id);
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
  );
};
