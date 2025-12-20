import React from 'react';
import { Button, Input, Label, Text } from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';

interface AgentConfigurationProps {
  apiKey: string;
  onApiKeyChange: (val: string) => void;
  hasKey: boolean;
  onSaveKey: () => void;
}

export const AgentConfiguration: React.FC<AgentConfigurationProps> = ({
  apiKey,
  onApiKeyChange,
  hasKey,
  onSaveKey
}) => {
  return (
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
          onChange={(e, data) => onApiKeyChange(data.value)}
          style={{ flexGrow: 1 }}
        />
        <Button
          icon={<SaveRegular />}
          onClick={onSaveKey}
          disabled={!apiKey.trim()}
        >
          Save
        </Button>
      </div>
      <Text size={100} style={{opacity: 0.7}}>
        Key is stored securely in VS Code Secrets.
      </Text>
    </div>
  );
};
