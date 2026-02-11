import React, { useState, useEffect, useRef } from 'react';
import {
  Textarea,
  Button,
  Text,
} from '@fluentui/react-components';
import { Send24Regular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatTab = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endOfMsgRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    endOfMsgRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for chat responses from the extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.command === 'chatResponse') {
        setMessages(prev => [...prev, { role: 'assistant', content: event.data.text }]);
        if (typeof event.data.tokensUsed === 'number') {
          setTokensUsed(event.data.tokensUsed);
        }
        if (typeof event.data.costUsd === 'number') {
          setCostUsd(event.data.costUsd);
        }
        setIsLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const focusInput = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message to history
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    
    // Send to extension
    vscode.postMessage({ command: 'chatSubmit', text: input });
    
    // Clear input and set loading state
    setInput('');
    setIsLoading(true);

    // Keep focus in the input for rapid follow-ups
    focusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const tokenBudget = 100000;
  const tokenProgress = Math.min(tokensUsed / tokenBudget, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      {/* Chat History */}
      <div style={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        padding: '12px',
        borderRadius: '10px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.15))',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      }}>
        {messages.length === 0 && (
          <div style={{
            margin: '24px auto 0',
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
          }}>
            <Text style={{ opacity: 0.65 }}>
              Start a conversation. Ask a question or paste a snippet to get help.
            </Text>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: 'column',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            gap: '4px',
          }}>
            <Text style={{ 
              opacity: 0.5, 
              fontSize: '11px', 
              textAlign: msg.role === 'user' ? 'right' : 'left',
            }}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </Text>
            <div style={{ 
              backgroundColor: msg.role === 'user' ? '#0078d4' : '#3c3c3c',
              color: '#ffffff',
              padding: '10px 12px',
              borderRadius: '10px',
              borderTopRightRadius: msg.role === 'user' ? '4px' : '10px',
              borderTopLeftRadius: msg.role === 'user' ? '10px' : '4px',
              boxShadow: '0 6px 14px rgba(0, 0, 0, 0.18)',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ 
            alignSelf: 'flex-start',
            backgroundColor: '#3c3c3c',
            color: '#ffffff',
            padding: '10px 12px',
            borderRadius: '8px',
          }}>
            <Text style={{ opacity: 0.7 }}>Thinking...</Text>
          </div>
        )}
        <div ref={endOfMsgRef} />
      </div>

      {/* Chat Stats */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}>
        <Text style={{ opacity: 0.7, fontSize: '12px', minWidth: '72px' }}>
          {tokensUsed.toLocaleString()} tokens
        </Text>
        <div style={{
          position: 'relative',
          flex: 1,
          height: '6px',
          borderRadius: '999px',
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${tokenProgress * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #5b9bd5, #3aa0ff)',
          }} />
        </div>
        <Text style={{ opacity: 0.7, fontSize: '12px', minWidth: '56px', textAlign: 'right' }}>
          ${costUsd.toFixed(2)}
        </Text>
      </div>

      {/* Input Area */}
      <div style={{ position: 'relative', padding: '10px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '10px',
          borderRadius: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
        }}>
          <Textarea 
            ref={inputRef}
            value={input}
            onChange={(_, d) => setInput(d.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              minHeight: '64px',
              maxHeight: '180px',
              resize: 'vertical',
              borderRadius: '8px',
            }}
            placeholder="Type a message…"
            disabled={isLoading}
            aria-label="Chat message"
          />
          <Button 
            appearance="primary"
            icon={<Send24Regular />}
            onClick={handleSend}
            onMouseDown={(e) => {
              e.preventDefault();
              focusInput();
            }}
            disabled={!input.trim() || isLoading}
            style={{ alignSelf: 'flex-end', minWidth: '44px', height: '40px' }}
            aria-label="Send message"
            title="Send (Enter)"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', padding: '0 4px' }}>
          <Text style={{ opacity: 0.6, fontSize: '12px' }}>
            Enter to send · Shift+Enter for new line
          </Text>
          <Text style={{ opacity: 0.6, fontSize: '12px' }}>
            {input.length} characters
          </Text>
        </div>
      </div>
    </div>
  );
};
