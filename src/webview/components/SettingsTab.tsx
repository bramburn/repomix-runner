import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Divider,
} from '@fluentui/react-components';
import {
  SaveRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ChevronRightRegular,
  ChevronDownRegular
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

interface ApiKeyConfigSectionProps {
  title: string;
  isConfigured: boolean;
  value: string;
  onChange: (val: string) => void;
  onSave: () => void;
  placeholder: string;
  description: string;
}

const ApiKeyConfigSection: React.FC<ApiKeyConfigSectionProps> = ({
  title,
  isConfigured,
  value,
  onChange,
  onSave,
  placeholder,
  description
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
          <Label weight="semibold" style={{ cursor: 'pointer' }}>{title}</Label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isConfigured ? (
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

      {isExpanded && (
        <>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              type="password"
              placeholder={placeholder}
              value={value}
              onChange={(e, data) => onChange(data.value)}
              style={{ flexGrow: 1 }}
            />
            <Button
              icon={<SaveRegular />}
              onClick={onSave}
              disabled={!value.trim()}
            >
              Save
            </Button>
          </div>
          <Text size={100} style={{ opacity: 0.7 }}>
            {description}
          </Text>
        </>
      )}
    </div>
  );
};

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

      <ApiKeyConfigSection
        title="Google Gemini API Key"
        isConfigured={googleKeyExists}
        value={googleKey}
        onChange={setGoogleKey}
        onSave={handleSaveGoogleKey}
        placeholder="Enter Gemini API Key (starts with AIza...)"
        description="Required for Smart Agent functionality. Stored securely in VS Code Secrets."
      />

      <Divider />

      <ApiKeyConfigSection
        title="Pinecone API Key"
        isConfigured={pineconeKeyExists}
        value={pineconeKey}
        onChange={setPineconeKey}
        onSave={handleSavePineconeKey}
        placeholder="Enter Pinecone API Key"
        description="Required for advanced vector search capabilities. Stored securely."
      />
    </div>
  );
};
