import React, { useState, useEffect } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { CopyRegular, DeleteRegular, ArrowCounterclockwiseRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { DebugRun } from '../types.js';

export const DebugTab = () => {
  const [runs, setRuns] = useState<DebugRun[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'updateDebugRuns') {
        setRuns(message.runs);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'getDebugRuns' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleReRun = (files: string[]) => {
    vscode.postMessage({ command: 'reRunDebug', files });
  };

  const handleCopy = () => {
    vscode.postMessage({ command: 'copyDebugOutput' });
  };

  const handleDelete = (id: number) => {
    vscode.postMessage({ command: 'deleteDebugRun', id });
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
  {/* Only show Copy on the latest run */}
  {index === 0 && (
    <Button
      appearance="subtle"
      icon={<CopyRegular />}
      onClick={handleCopy}
      title="Copy output from default repomix file"
    >
      Copy Output
    </Button>
  )}
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
          </div>
        ))
      )}
    </div>
  );
};
