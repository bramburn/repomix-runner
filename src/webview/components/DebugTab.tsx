import React, { useState, useEffect, useRef } from 'react';
import { Button, Text, Accordion, AccordionItem, AccordionHeader, AccordionPanel, Badge } from '@fluentui/react-components';
import { CopyRegular, DeleteRegular, ArrowCounterclockwiseRegular, ArrowSyncRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { DebugRun, EnvironmentInfo, IndexHistoryEntry, IndexHistoryStats } from '../types.js';

export const DebugTab = () => {
  const [runs, setRuns] = useState<DebugRun[]>([]);
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());
  const [environmentInfo, setEnvironmentInfo] = useState<EnvironmentInfo | null>(null);

  // Index History State
  const [indexEntries, setIndexEntries] = useState<IndexHistoryEntry[]>([]);
  const [indexStats, setIndexStats] = useState<IndexHistoryStats>({
    queued: 0,
    flush: 0,
    embeddingComplete: 0,
    embeddingFailed: 0
  });
  const [isIndexHistoryLoading, setIsIndexHistoryLoading] = useState(true);

  // Tracks the current "loading safety timeout" so we can cancel it reliably
  const indexHistoryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.command) {
        case 'updateDebugRuns':
          setRuns(message.runs);
          return;

        case 'updateEnvironmentInfo':
          setEnvironmentInfo(message.environmentInfo);
          return;

        case 'indexHistoryUpdate':
          // Clear loading timeout when we receive data
          if (indexHistoryTimeoutRef.current !== null) {
            clearTimeout(indexHistoryTimeoutRef.current);
            indexHistoryTimeoutRef.current = null;
          }
        
          setIndexEntries(message.entries);
          setIndexStats(message.stats);
          setIsIndexHistoryLoading(false);
          return;

        case 'indexHistoryEvent':
          setIndexEntries(prev => [message.entry, ...prev].slice(0, 500));
          setIndexStats(prev => {
            const next = { ...prev };
            switch (message.entry.eventType) {
              case 'queued': next.queued++; break;
              case 'flush': next.flush++; break;
              case 'embedding_complete': next.embeddingComplete++; break;
              case 'embedding_failed': next.embeddingFailed++; break;
            }
            return next;
          });
          return;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'getDebugRuns' });
    vscode.postMessage({ command: 'getEnvironmentInfo' });
    
    setIsIndexHistoryLoading(true);
    vscode.postMessage({ command: 'getIndexHistory' });

    // Safety: don't show loading forever if extension never responds
    if (indexHistoryTimeoutRef.current !== null) {
      clearTimeout(indexHistoryTimeoutRef.current);
    }
    indexHistoryTimeoutRef.current = window.setTimeout(() => {
      setIsIndexHistoryLoading(false);
      indexHistoryTimeoutRef.current = null;
    }, 5000);

    return () => {
      if (indexHistoryTimeoutRef.current !== null) {
        clearTimeout(indexHistoryTimeoutRef.current);
        indexHistoryTimeoutRef.current = null;
      }
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleReRun = (files: string[]) => {
    vscode.postMessage({ command: 'reRunDebug', files });
  };

  const handleCopy = (runId?: number) => {
    if (runId !== undefined) {
      vscode.postMessage({ command: 'copyDebugOutput', runId });
    } else {
      // Fallback for latest run if no ID provided
      vscode.postMessage({ command: 'copyDebugOutput' });
    }
  };

  const toggleExpanded = (runId: number) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
  };

  const handleDelete = (id: number) => {
    vscode.postMessage({ command: 'deleteDebugRun', id });
  };

  // --- Index History Helpers (VS Code theme + FluentUI v9 compatible) ---
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getEventLabel = (eventType: IndexHistoryEntry['eventType']): string => {
    switch (eventType) {
      case 'queued': return 'QUEUED';
      case 'flush': return 'FLUSH';
      case 'embedding_complete': return 'INDEXED';
      case 'embedding_failed': return 'FAILED';
      default: return String(eventType).toUpperCase();
    }
  };

  const getEventBadgeColor = (
    eventType: IndexHistoryEntry['eventType']
  ): 'informative' | 'success' | 'danger' | 'warning' => {
    switch (eventType) {
      case 'queued': return 'informative';
      case 'flush': return 'warning';
      case 'embedding_complete': return 'success';
      case 'embedding_failed': return 'danger';
      default: return 'informative';
    }
  };

  const getStatusColor = (status: IndexHistoryEntry['status']) => {
    switch (status) {
      case 'pending':
        return 'var(--vscode-charts-blue)';
      case 'indexed':
        return 'var(--vscode-charts-green)';
      case 'failed':
        return 'var(--vscode-errorForeground)';
      default:
        return 'var(--vscode-foreground)';
    }
  };

  const truncatePath = (p: string, maxLength: number = 80) => {
    if (p.length <= maxLength) return p;
    const keep = Math.floor((maxLength - 3) / 2);
    return `${p.slice(0, keep)}...${p.slice(-keep)}`;
  };

  const handleIndexHistoryRefresh = () => {
    if (indexHistoryTimeoutRef.current !== null) {
      clearTimeout(indexHistoryTimeoutRef.current);
      indexHistoryTimeoutRef.current = null;
    }

    setIsIndexHistoryLoading(true);
    vscode.postMessage({ command: 'getIndexHistory' });

    indexHistoryTimeoutRef.current = window.setTimeout(() => {
      setIsIndexHistoryLoading(false);
      indexHistoryTimeoutRef.current = null;
    }, 5000);
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Text weight="semibold">Recent Runs (Run on Selection)</Text>

      <Text size={100} style={{ opacity: 0.7, fontStyle: 'italic', marginBottom: '5px' }}>
        Debug output may contain sensitive data.
      </Text>

      {runs.length === 0 ? (
        <Text style={{ opacity: 0.7 }}>No runs recorded yet.</Text>
      ) : (
        runs.map((run, index) => (
          <div
            key={run.id}
            style={{
              padding: '10px',
              backgroundColor: 'var(--vscode-editor-background)',
              borderRadius: '4px',
              border: '1px solid var(--vscode-widget-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text size={200} weight="semibold">
                {new Date(run.timestamp).toLocaleString()}
              </Text>
              <div style={{ display: 'flex', gap: '5px' }}>
                <Button
                  appearance="subtle"
                  icon={<CopyRegular />}
                  onClick={() => handleCopy(run.id)}
                  title="Copy output from this run"
                >
                  Copy Output
                </Button>
                <Button
                  appearance="subtle"
                  icon={<ArrowCounterclockwiseRegular />}
                  onClick={() => handleReRun(run.files)}
                  title="Re-run this selection"
                >
                  Re-run
                </Button>
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  onClick={() => handleDelete(run.id)}
                  title="Delete this run"
                >
                  Delete
                </Button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {run.files.slice(0, 3).map((file, idx) => (
                <Text key={idx} size={100} style={{
                  backgroundColor: 'var(--vscode-textBlockQuote-background)',
                  padding: '2px 4px',
                  borderRadius: '2px',
                  opacity: 0.9
                }}>
                  {file}
                </Text>
              ))}
              {run.files.length > 3 && (
                <Text size={100} style={{
                  backgroundColor: 'var(--vscode-textBlockQuote-background)',
                  padding: '2px 4px',
                  borderRadius: '2px',
                  opacity: 0.9,
                  fontStyle: 'italic'
                }}>
                  +{run.files.length - 3} selection
                </Text>
              )}
            </div>
            <Text size={100} style={{ opacity: 0.7 }}>
              {run.files.length} items
            </Text>

            {/* Show output/error if available */}
            {(run.output || run.error) && (
              <Accordion
                openItems={expandedRuns.has(run.id) ? [run.id.toString()] : []}
                onToggle={() => toggleExpanded(run.id)}
                collapsible
              >
                <AccordionItem value={run.id.toString()}>
                  <AccordionHeader>
                    <Text size={100} weight="semibold">
                      {run.error ? 'Error Details' : 'Output'}
                    </Text>
                  </AccordionHeader>
                  <AccordionPanel>
                    <div style={{
                      padding: '8px',
                      backgroundColor: run.error
                        ? 'var(--vscode-inputValidation-errorBackground)'
                        : 'var(--vscode-inputValidation-infoBackground)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {run.error || run.output}
                    </div>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        ))
      )}

      {/* Index History Section */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        backgroundColor: 'var(--vscode-editor-background)',
        borderRadius: '4px',
        border: '1px solid var(--vscode-widget-border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <Text size={200} weight="semibold">
            Index History
          </Text>
          <Button
            appearance="subtle"
            icon={<ArrowSyncRegular />}
            onClick={handleIndexHistoryRefresh}
            disabled={isIndexHistoryLoading}
            title="Refresh Index History"
          >
            Refresh
          </Button>
        </div>

        {isIndexHistoryLoading ? (
          <Text style={{ opacity: 0.7 }}>Loading index history...</Text>
        ) : indexEntries.length === 0 ? (
          <Text style={{ opacity: 0.7 }}>No index history events recorded.</Text>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
              <Text size={100}><Badge appearance="filled" color="informative">{indexStats.queued}</Badge> Queued</Text>
              <Text size={100}><Badge appearance="filled" color="warning">{indexStats.flush}</Badge> Flushed</Text>
              <Text size={100}><Badge appearance="filled" color="success">{indexStats.embeddingComplete}</Badge> Completed</Text>
              <Text size={100}><Badge appearance="filled" color="danger">{indexStats.embeddingFailed}</Badge> Failed</Text>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
              {indexEntries.map((entry) => {
                const statusColor = getStatusColor(entry.status);
                const badgeColor = getEventBadgeColor(entry.eventType);
                return (
                  <div 
                    key={entry.id} 
                    style={{ 
                      padding: '6px', 
                      borderLeft: `4px solid ${statusColor}`,
                      backgroundColor: 'var(--vscode-list-hoverBackground)',
                      borderRadius: '2px',
                      display: 'flex',
                      flexDirection: 'column',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <Badge appearance="filled" color={badgeColor}>
                          {getEventLabel(entry.eventType)}
                        </Badge>
                        <Text size={100} style={{ fontStyle: 'italic', color: 'var(--vscode-sideBarSectionHeader-foreground)' }}>
                          {formatTimestamp(entry.timestamp)}
                        </Text>
                      </div>
                      {entry.status && (
                        <Text size={100} style={{ color: statusColor, fontWeight: 'bold' }}>
                          {entry.status}
                        </Text>
                      )}
                    </div>
                    <Text size={100} style={{ marginTop: '2px', wordBreak: 'break-all' }}>
                      {truncatePath(entry.filePath)}
                    </Text>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      {/* Environment Info Section */}
      {environmentInfo && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          backgroundColor: 'var(--vscode-editor-background)',
          borderRadius: '4px',
          border: '1px solid var(--vscode-widget-border)',
        }}>
          <Text size={200} weight="semibold" style={{ marginBottom: '8px', display: 'block' }}>
            Environment Information
          </Text>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: '13px' }}>
            {/* Client OS */}
            <Text size={100} style={{ opacity: 0.7 }}>Client OS:</Text>
            <Text size={100}>
              {environmentInfo.localOs === 'win32' ? 'Windows' :
                environmentInfo.localOs === 'darwin' ? 'macOS' :
                  environmentInfo.localOs === 'linux' ? 'Linux' : environmentInfo.localOs}
              {' '}{environmentInfo.localArch}
            </Text>

            {/* Remote Status */}
            <Text size={100} style={{ opacity: 0.7 }}>Remote:</Text>
            <Text size={100}>
              {environmentInfo.isRemote ? (
                <span style={{ color: 'var(--vscode-charts-blue)' }}>
                  ✓ {environmentInfo.remoteName || 'Unknown'}
                </span>
              ) : (
                <span style={{ opacity: 0.6 }}>None</span>
              )}
            </Text>

            {/* Remote OS (if in remote mode) */}
            {environmentInfo.isRemote && environmentInfo.remoteOs && (
              <>
                <Text size={100} style={{ opacity: 0.7 }}>Remote OS:</Text>
                <Text size={100}>
                  {environmentInfo.remoteOs === 'win32' ? 'Windows' :
                    environmentInfo.remoteOs === 'darwin' ? 'macOS' :
                      environmentInfo.remoteOs === 'linux' ? 'Linux' : environmentInfo.remoteOs}
                  {environmentInfo.remoteArch && ` ${environmentInfo.remoteArch}`}
                </Text>
              </>
            )}

            {/* SSH Remote */}
            <Text size={100} style={{ opacity: 0.7 }}>SSH Remote:</Text>
            <Text size={100}>
              {environmentInfo.isSshRemote ? (
                <span style={{ color: 'var(--vscode-charts-green)' }}>✓ Yes</span>
              ) : (
                <span style={{ opacity: 0.6 }}>No</span>
              )}
            </Text>

            {/* Local Binary Execution */}
            <Text size={100} style={{ opacity: 0.7 }}>Use Local Binary:</Text>
            <Text size={100}>
              {environmentInfo.shouldUseLocalBinary ? (
                <span style={{ color: 'var(--vscode-charts-green)' }}>✓ Yes</span>
              ) : (
                <span style={{ opacity: 0.6 }}>No</span>
              )}
            </Text>

            {/* Binary Path - show if applicable */}
            {environmentInfo.shouldUseLocalBinary && (
              <>
                <Text size={100} style={{ opacity: 0.7 }}>Binary Path:</Text>
                <Text size={100} style={{
                  fontFamily: 'monospace',
                  color: environmentInfo.binaryExists
                    ? 'var(--vscode-charts-green)'
                    : 'var(--vscode-errorForeground)',
                  wordBreak: 'break-all',
                }}>
                  {environmentInfo.binaryExists ? '✓ ' : '✗ '}
                  {environmentInfo.binaryPath || 'Not found'}
                </Text>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
