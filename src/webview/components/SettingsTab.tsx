import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Divider,
} from '@fluentui/react-components';
import { SaveRegular, CheckmarkCircleRegular, ErrorCircleRegular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

export const SettingsTab = () => {
  const [googleKey, setGoogleKey] = useState('');
  const [pineconeKey, setPineconeKey] = useState('');
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'secretStatus') {
        if (message.key === 'googleApiKey') {
          setGoogleKeyExists(message.exists);
        } else if (message.key === 'pineconeApiKey') {
          setPineconeKeyExists(message.exists);
        }
      }
    };
    window.addEventListener('message', handler);

    // Check initial status
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSaveGoogleKey = () => {
    if (!googleKey.trim()) return;
    vscode.postMessage({
      command: 'saveSecret',
      key: 'googleApiKey',
      value: googleKey.trim()
    });
    setGoogleKey('');
  };

  const handleSavePineconeKey = () => {
    if (!pineconeKey.trim()) return;
    vscode.postMessage({
      command: 'saveSecret',
      key: 'pineconeApiKey',
      value: pineconeKey.trim()
    });
    setPineconeKey('');
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Text size={400} weight="semibold">Configuration</Text>

      {/* Google API Key Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label weight="semibold">Google Gemini API Key</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {googleKeyExists ? (
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

        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            type="password"
            placeholder="Enter Gemini API Key (starts with AIza...)"
            value={googleKey}
            onChange={(e, data) => setGoogleKey(data.value)}
            style={{ flexGrow: 1 }}
          />
          <Button
            icon={<SaveRegular />}
            onClick={handleSaveGoogleKey}
            disabled={!googleKey.trim()}
          >
            Save
          </Button>
        </div>
        <Text size={100} style={{ opacity: 0.7 }}>
          Required for Smart Agent functionality. Stored securely in VS Code Secrets.
        </Text>
      </div>

      <Divider />

      {/* Pinecone API Key Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Label weight="semibold">Pinecone API Key</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {pineconeKeyExists ? (
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

        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            type="password"
            placeholder="Enter Pinecone API Key"
            value={pineconeKey}
            onChange={(e, data) => setPineconeKey(data.value)}
            style={{ flexGrow: 1 }}
          />
          <Button
            icon={<SaveRegular />}
            onClick={handleSavePineconeKey}
            disabled={!pineconeKey.trim()}
          >
            Save
          </Button>
        </div>
        <Text size={100} style={{ opacity: 0.7 }}>
          Required for advanced vector search capabilities. Stored securely.
        </Text>
      </div>
    </div>
  );
};
