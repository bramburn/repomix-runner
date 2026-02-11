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
        setIsLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message to history
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    
    // Send to extension
    vscode.postMessage({ command: 'chatSubmit', text: input });
    
    // Clear input and set loading state
    setInput('');
    setIsLoading(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      {/* Chat History */}
      <div style={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        padding: '10px',
        borderRadius: '4px',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
      }}>
        {messages.length === 0 && (
          <Text style={{ opacity: 0.6, textAlign: 'center', marginTop: '20px' }}>
            Start a conversation...
          </Text>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            backgroundColor: msg.role === 'user' ? '#0078d4' : '#3c3c3c',
            color: '#ffffff',
            padding: '10px 12px',
            borderRadius: '8px',
            wordWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
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

      {/* Input Area */}
      <div style={{ position: 'relative', padding: '10px', display: 'flex', gap: '8px' }}>
        <Textarea 
          value={input}
          onChange={(_, d) => setInput(d.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, minHeight: '60px' }}
          placeholder="Type a message... (Shift+Enter for new line)"
          disabled={isLoading}
        />
        <Button 
          appearance="primary"
          icon={<Send24Regular />}
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{ alignSelf: 'flex-end' }}
        />
      </div>
    </div>
  );
};

