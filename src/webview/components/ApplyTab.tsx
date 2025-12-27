import React, { useState, useEffect } from 'react';
import {
  Button,
  Textarea,
  Text,
  Divider,
  Card,
  Badge,
} from '@fluentui/react-components';
import {
  PlayRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  CopyRegular,
  DeleteRegular
} from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

interface PatchResult {
  file: string;
  status: 'success' | 'error';
  message?: string;
  errorContext?: string;
}

export const ApplyTab = () => {
  const [input, setInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [results, setResults] = useState<PatchResult[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'applyResult') {
        setIsApplying(false);
        if (message.success) {
          setResults(message.results);
        } else {
            // Global error (e.g. no blocks found)
            setResults([{ 
                file: 'System', 
                status: 'error', 
                message: message.error 
            }]);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleApply = () => {
    if (!input.trim()) return;
    setIsApplying(true);
    setResults([]);
    vscode.postMessage({ command: 'applyPatches', text: input });
  };

  const handleCopyContext = (context?: string) => {
    if (context) {
      navigator.clipboard.writeText(context);
      vscode.postMessage({ 
          command: 'showNotification', 
          message: 'Error context copied to clipboard' 
      });
    }
  };

  const handleClear = () => {
      setInput('');
      setResults([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Text weight="semibold">Smart Apply (Copy-Paste Coder)</Text>
        <Text size={200} style={{ opacity: 0.8 }}>
          Paste the full LLM response below. We will auto-detect code blocks and apply them.
        </Text>
      </div>

      <Textarea
        placeholder="Paste LLM response here (containing <apply_diff> blocks)..."
        value={input}
        onChange={(e, data) => setInput(data.value)}
        style={{ flexGrow: 1, minHeight: '150px', fontFamily: 'monospace', fontSize: '12px' }}
      />

      <div style={{ display: 'flex', gap: '10px' }}>
        <Button 
          appearance="primary" 
          icon={<PlayRegular />} 
          onClick={handleApply}
          disabled={isApplying || !input.trim()}
        >
          {isApplying ? 'Applying...' : 'Apply Changes'}
        </Button>
        <Button 
          appearance="secondary" 
          icon={<DeleteRegular />} 
          onClick={handleClear}
          disabled={isApplying}
        >
          Clear
        </Button>
      </div>

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <Divider />
          <Text weight="semibold">Results</Text>
          
          {results.map((res, idx) => (
            <Card key={idx} size="small" style={{ padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {res.status === 'success' 
                    ? <CheckmarkCircleRegular style={{ color: 'var(--vscode-charts-green)' }} />
                    : <ErrorCircleRegular style={{ color: 'var(--vscode-errorForeground)' }} />
                  }
                  <Text style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {res.file}
                  </Text>
                </div>
                
                {res.status === 'error' && (
                  <Button 
                    size="small" 
                    icon={<CopyRegular />}
                    onClick={() => handleCopyContext(res.errorContext)}
                    title="Copy error context to fix with LLM"
                  >
                    Copy Context
                  </Button>
                )}
              </div>
              
              {res.message && (
                <Text size={100} style={{ marginTop: '4px', opacity: 0.8, color: res.status === 'error' ? 'var(--vscode-errorForeground)' : 'inherit' }}>
                  {res.message}
                </Text>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};