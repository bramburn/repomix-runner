import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Divider,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Dropdown,
  Option,
  Spinner,
} from '@fluentui/react-components';
import {
  SaveRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ArrowClockwiseRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

interface PineconeIndex {
  name: string;
  host: string;
  dimension?: number;
  metric?: string;
  spec?: any;
  status?: any;
}

export const SettingsTab = () => {
  const [googleKey, setGoogleKey] = useState('');
  const [pineconeKey, setPineconeKey] = useState('');
  const [googleKeyExists, setGoogleKeyExists] = useState(false);
  const [pineconeKeyExists, setPineconeKeyExists] = useState(false);

  // Pinecone Index State
  const [pineconeIndexes, setPineconeIndexes] = useState<PineconeIndex[]>([]);
  const [selectedPineconeIndex, setSelectedPineconeIndex] = useState<PineconeIndex | null>(null);
  const [isFetchingIndexes, setIsFetchingIndexes] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  // Debounce logic for Pinecone key validation
  useEffect(() => {
    if (!pineconeKey) {
        setIsFetchingIndexes(false);
        setIndexError(null);
        return;
    }
    setIsFetchingIndexes(true);
    setIndexError(null);
    const timer = setTimeout(() => {
        // Send the key for validation/fetching (without saving yet)
        vscode.postMessage({ command: 'fetchPineconeIndexes', apiKey: pineconeKey });
    }, 1000);
    return () => clearTimeout(timer);
  }, [pineconeKey]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'secretStatus':
          if (message.key === 'googleApiKey') {
            setGoogleKeyExists(message.exists);
          } else if (message.key === 'pineconeApiKey') {
            setPineconeKeyExists(message.exists);
            if (message.exists) {
                // Key exists, fetch indexes. We call explicitly to bypass the state guard since we know it exists.
                setIsFetchingIndexes(true);
                setIndexError(null);
                vscode.postMessage({ command: 'fetchPineconeIndexes' });
            } else {
                setPineconeIndexes([]);
                setSelectedPineconeIndex(null);
            }
          }
          break;
        case 'updatePineconeIndexes':
            setIsFetchingIndexes(false);
            if (message.error) {
                setIndexError(message.error);
                setPineconeIndexes([]);
            } else {
                setIndexError(null);
                setPineconeIndexes(message.indexes);
            }
            break;
        case 'updateSelectedIndex':
            setSelectedPineconeIndex(message.index);
            break;
      }
    };
    window.addEventListener('message', handler);

    // Initial Checks
    vscode.postMessage({ command: 'checkSecret', key: 'googleApiKey' });
    vscode.postMessage({ command: 'checkSecret', key: 'pineconeApiKey' });
    vscode.postMessage({ command: 'getPineconeIndex' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const fetchIndexes = () => {
      if (!pineconeKeyExists) return;
      setIsFetchingIndexes(true);
      setIndexError(null);
      vscode.postMessage({ command: 'fetchPineconeIndexes' });
  };

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
    // The secretStatus listener will trigger the fetch
  };

  const handleIndexSelect = (_e: any, data: any) => {
      const selectedOption = data.optionValue;
      if (!selectedOption) return;
      const index = pineconeIndexes.find(i => i.name === selectedOption);
      if (index) {
          setSelectedPineconeIndex(index);
          vscode.postMessage({ command: 'savePineconeIndex', index });
      }
  };

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Text size={400} weight="semibold">Configuration</Text>

      <Accordion collapsible multiple defaultOpenItems={['api-config']}>
        <AccordionItem value="api-config">
            <AccordionHeader>API Configuration</AccordionHeader>
            <AccordionPanel>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px 0' }}>

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
                             Required for Smart Agent functionality.
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
                    </div>

                    {/* Pinecone Index Selection */}
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                         <Label weight="semibold">Pinecone Index</Label>
                         <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                             <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                 <Dropdown
                                    placeholder="Select an Index"
                                    disabled={!pineconeKeyExists}
                                    value={selectedPineconeIndex ? selectedPineconeIndex.name : undefined}
                                    selectedOptions={selectedPineconeIndex ? [selectedPineconeIndex.name] : []}
                                    onOptionSelect={handleIndexSelect}
                                    style={{ width: '100%' }}
                                 >
                                     {pineconeIndexes.map((index) => (
                                         <Option key={index.name} value={index.name}>
                                             {index.name}
                                         </Option>
                                     ))}
                                 </Dropdown>
                                 {indexError && (
                                     <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>
                                         Error: {indexError}
                                     </Text>
                                 )}
                             </div>

                             <Button
                                icon={isFetchingIndexes ? <Spinner size="tiny" /> : <ArrowClockwiseRegular />}
                                onClick={fetchIndexes}
                                disabled={!pineconeKeyExists || isFetchingIndexes}
                                title="Refresh Indexes"
                             />
                         </div>
                         {selectedPineconeIndex && (
                             <div style={{ fontSize: '10px', opacity: 0.7, display: 'flex', flexDirection: 'column' }}>
                                 <span>Host: {selectedPineconeIndex.host}</span>
                                 <span>Dimension: {selectedPineconeIndex.dimension}</span>
                             </div>
                         )}
                     </div>

                 </div>
            </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <Divider />

      {/* Search Section Placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Label weight="semibold">Vector Search (Preview)</Label>
          <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                placeholder="Enter search query..."
                style={{ flexGrow: 1 }}
              />
              <Button icon={<SearchRegular />}>
                  Search
              </Button>
          </div>
      </div>

    </div>
  );
};
