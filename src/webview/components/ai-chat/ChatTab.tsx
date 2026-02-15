import React, { useState, useRef, useEffect } from 'react';
import { Text, Textarea, Button } from '@fluentui/react-components';
import { Send24Regular } from '@fluentui/react-icons';
import { ChatMessage } from './ChatMessage.js';
import { ToolCallCard } from './ToolCallCard.js';
import { ChatInput } from './ChatInput.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  status: string;
  details: string;
}

export const ChatTab = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'user',
      content: 'Analyze the auth.ts file for potential security vulnerabilities'
    },
    {
      role: 'assistant',
      content: 'Sure, I will examine the auth.ts file for security issues...'
    }
  ]);

  const [toolCalls] = useState<ToolCall[]>([
    {
      name: 'Code Search',
      status: 'Completed',
      details: "Code Search: 'vulnerabilities' in auth.ts"
    },
    {
      name: 'File Read',
      status: 'Reading...',
      details: 'File Read: /src/utils/auth.ts'
    }
  ]);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      justifyContent: 'space-between'
    }}>
      {/* Chat Messages Area */}
      <div style={{ 
        flexGrow: 1, 
        overflowY: 'auto', 
        padding: '10px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {messages.map((message, index) => (
          <ChatMessage 
            key={index}
            role={message.role}
            text={message.content}
          />
        ))}

        {/* Tool Calls Section */}
        <div style={{ margin: '15px 0' }}>
          {toolCalls.map((tool, index) => (
            <ToolCallCard
              key={index}
              toolName={tool.name}
              status={tool.status}
              details={tool.details}
            />
          ))}
        </div>

        <div ref={endOfMessagesRef} />
      </div>
      
      {/* Input Area */}
      <ChatInput />
    </div>
  );
};