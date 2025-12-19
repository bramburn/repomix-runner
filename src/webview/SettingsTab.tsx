import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Divider,
} from '@fluentui/react-components';
import { SaveRegular, EyeRegular, EyeOffRegular } from '@fluentui/react-icons';
import { vscode } from './vscode-api.js';

interface SettingsTabProps {}

export const SettingsTab: React.FC<SettingsTabProps> = () => {
  const [googleKey, setGoogleKey] = useState('');
  const [pineconeKey, setPineconeKey] = useState('');
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showPineconeKey, setShowPineconeKey] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.command === 'secretStatus') {
        if (event.data.key === 'googleApiKey') {
          setGoogleKeyExists(event.data.exists);
        } else if (event.data.key === 'pineconeApiKey') {
          setPineconeKeyExists(event.data.exists);
        }
      }
    };
    window.addEventListener('message', handler);

    // Initial check
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSaveGoogleKey = () => {
    const trimmed = googleKey.trim();
    if (!trimmed) return;
    vscode.postMessage({ command: 'saveSecret', key: 'googleApiKey', value: trimmed });
    setGoogleKey('');
    // Re-check immediately and maybe have the backend send a confirmation
    // The backend should ideally reply with status update after save.
    // For now we rely on explicit check which is safer than timeout.
    // But since backend doesn't auto-push status on save, we request it.
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
  };

  const handleSavePineconeKey = () => {
    const trimmed = pineconeKey.trim();
    if (!trimmed) return;
    vscode.postMessage({ command: 'saveSecret', key: 'pineconeApiKey', value: trimmed });
    setPineconeKey('');
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Google Gemini API Key Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Label weight="semibold">Google Gemini API Key</Label>

        {googleKeyExists ? (
           <Text size={200} style={{ color: '#4caf50' }}>
             ✅ Configured
           </Text>
        ) : (
           <Text size={200} style={{ color: '#ffb74d' }}>
             ⚠️ Not Configured
           </Text>
        )}

        <div style={{ display: 'flex', gap: '5px' }}>
          <Input
            type={showGoogleKey ? 'text' : 'password'}
            placeholder="Paste Google Gemini API Key"
            value={googleKey}
            onChange={(e, data) => setGoogleKey(data.value)}
            style={{ flexGrow: 1 }}
          />
          <Button
            icon={showGoogleKey ? <EyeOffRegular /> : <EyeRegular />}
            onClick={() => setShowGoogleKey(!showGoogleKey)}
            appearance="subtle"
            title={showGoogleKey ? "Hide API Key" : "Show API Key"}
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
          Required for Smart Agent features. Stored securely in VS Code Secrets.
        </Text>
      </div>

      <Divider />

      {/* Pinecone API Key Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Label weight="semibold">Pinecone API Key</Label>

        {pineconeKeyExists ? (
           <Text size={200} style={{ color: '#4caf50' }}>
             ✅ Configured
           </Text>
        ) : (
           <Text size={200} style={{ color: '#ffb74d' }}>
             ⚠️ Not Configured
           </Text>
        )}

        <div style={{ display: 'flex', gap: '5px' }}>
          <Input
            type={showPineconeKey ? 'text' : 'password'}
            placeholder="Paste Pinecone API Key"
            value={pineconeKey}
            onChange={(e, data) => setPineconeKey(data.value)}
            style={{ flexGrow: 1 }}
          />
           <Button
            icon={showPineconeKey ? <EyeOffRegular /> : <EyeRegular />}
            onClick={() => setShowPineconeKey(!showPineconeKey)}
            appearance="subtle"
            title={showPineconeKey ? "Hide API Key" : "Show API Key"}
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
          Required for advanced vector search features. Stored securely in VS Code Secrets.
        </Text>
      </div>

    </div>
  );
};
