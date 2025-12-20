import React, { useEffect, useState } from 'react';
import { Button, Text, Label, Spinner } from '@fluentui/react-components';
import { DeleteRegular, DatabaseSearchRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

export const SearchTab = () => {
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'repoIndexCount':
          setFileCount(message.count);
          break;
        case 'repoIndexComplete':
          setFileCount(message.count);
          setIsIndexing(false);
          break;
        case 'repoIndexDeleted':
          setFileCount(0);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ command: 'getRepoIndexCount' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleIndex = () => {
    setIsIndexing(true);
    vscode.postMessage({ command: 'indexRepo' });
  };

  const handleDestroy = () => {
    vscode.postMessage({ command: 'deleteRepoIndex' });
  };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <Label weight="semibold">Repository Indexing</Label>

      <div style={{
        padding: '15px',
        backgroundColor: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-widget-border)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px'
      }}>
        <DatabaseSearchRegular style={{ fontSize: '32px', opacity: 0.8 }} />

        <div style={{ textAlign: 'center' }}>
          {fileCount !== null ? (
            <Text size={400} weight="semibold">{fileCount}</Text>
          ) : (
            <Spinner size="tiny" />
          )}
          <br />
          <Text size={200} style={{ opacity: 0.7 }}>Files Indexed</Text>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Button
          appearance="primary"
          onClick={handleIndex}
          disabled={isIndexing}
          icon={isIndexing ? <Spinner size="tiny" /> : undefined}
        >
          {isIndexing ? 'Indexing...' : 'Index Repository'}
        </Button>

        <Button
          appearance="secondary"
          icon={<DeleteRegular />}
          onClick={handleDestroy}
          disabled={isIndexing || fileCount === 0}
        >
          Destroy Index
        </Button>
      </div>

      <Text size={200} style={{ opacity: 0.7, marginTop: '10px' }}>
        Indexing scans all files in the repository (respecting .gitignore) to enable fast search capabilities.
      </Text>
    </div>
  );
};
