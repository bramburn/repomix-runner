import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@fluentui/react-components';

// Paper plane icon (inline SVG for reliable bundling)
const PaperPlaneIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    style={{ width: '16px', height: '16px', fill: 'white' }}
  >
    <path d="M0 288L512 0 448 480 271.8 404.5 208 512l-48-16V416 384L384 160 133 345 0 288z" />
  </svg>
);

export const ChatInput = () => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on content, with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 150);
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (inputValue.trim()) {
      // In a real implementation, this would send the message
      console.log('Sending message:', inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '10px',
      }}
    >
      {/* Input Area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            minHeight: '24px',
            maxHeight: '150px',
            padding: '8px 0',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'white',
            fontSize: '14px',
            lineHeight: '1.5',
            resize: 'none',
            fontFamily: 'inherit',
          }}
          placeholder="Type a message..."
          rows={1}
        />
        <Button
          appearance="primary"
          icon={<PaperPlaneIcon />}
          onClick={handleSend}
          disabled={!inputValue.trim()}
          style={{
            minWidth: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            border: 'none',
          }}
        />
      </div>

      {/* Pricing/Token Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '4px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            opacity: 0.5,
            fontFamily: 'monospace',
          }}
        >
          $0.02
        </span>
      </div>
    </div>
  );
};