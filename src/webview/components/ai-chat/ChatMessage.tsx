import React from 'react';
import { Text } from '@fluentui/react-components';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  text: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ role, text }) => {
  const isUser = role === 'user';
  
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: '15px',
      }}
    >
      <Text
        style={{
          opacity: 0.5,
          fontSize: '11px',
          textAlign: isUser ? 'right' : 'left',
          marginBottom: '4px',
        }}
      >
        {isUser ? 'You' : 'Assistant'}
      </Text>
      
      <div
        style={{
          backgroundColor: isUser ? '#0078d4' : '#3c3c3c',
          color: '#ffffff',
          padding: '10px 12px',
          borderRadius: '10px',
          borderTopRightRadius: isUser ? '4px' : '10px',
          borderTopLeftRadius: isUser ? '10px' : '4px',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          fontSize: '14px',
        }}
      >
        {text}
      </div>
    </div>
  );
};