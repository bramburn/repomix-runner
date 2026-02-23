import React, { useState, useRef, useEffect } from 'react';
import { Text } from '@fluentui/react-components';
import { ChatMessage } from './ChatMessage.js';
import { ToolCallCard } from './ToolCallCard.js';
import { ChatInput } from './ChatInput.js';
import { PackageInlineCard } from './PackageInlineCard.js';
import { vscode } from '../../vscode-api.js';
import type { PackagePayload } from './packageTypes.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCall {
  name: string;
  status: string;
  details: string;
}

interface ChatTabProps {
  onOpenPackagesTab: () => void;
}

interface PendingPackageReview {
  packageId?: string;
  payload: PackagePayload;
  estimatedTokens: number;
}

export const ChatTab: React.FC<ChatTabProps> = ({ onOpenPackagesTab }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls] = useState<ToolCall[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [pendingPackage, setPendingPackage] = useState<PendingPackageReview | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingPackage, progressText]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'threadHistory' && Array.isArray(message.messages)) {
        setMessages(
          message.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
            role: m.role,
            content: m.content,
          }))
        );
        return;
      }
      if (message?.command === 'chatResponse' && typeof message.text === 'string') {
        setProgressText('');
        setMessages((prev) => [...prev, { role: 'assistant', content: message.text }]);
        return;
      }
      if (message?.command === 'chatProgress' && typeof message.text === 'string') {
        setProgressText(message.text);
        return;
      }
      if (
        (message?.command === 'packageReview' || message?.command === 'packageReady') &&
        message.package
      ) {
        setPendingPackage({
          packageId: typeof message.packageId === 'string' ? message.packageId : undefined,
          payload: message.package as PackagePayload,
          estimatedTokens:
            typeof message.estimatedTokens === 'number' ? message.estimatedTokens : 0,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = (text: string) => {
    setProgressText('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    vscode.postMessage({ command: 'chatSubmit', text });
  };

  const approvePendingPackage = () => {
    if (!pendingPackage) {
      return;
    }

    if (pendingPackage.packageId) {
      vscode.postMessage({
        command: 'approvePackage',
        packageId: pendingPackage.packageId,
      });
    }

    vscode.postMessage({
      command: 'resumePackageReview',
      approved: true,
      packageId: pendingPackage.packageId,
    });
    setPendingPackage(null);
  };

  const rejectPendingPackage = () => {
    if (!pendingPackage) {
      return;
    }

    vscode.postMessage({
      command: 'resumePackageReview',
      approved: false,
      packageId: pendingPackage.packageId,
    });
    setPendingPackage(null);
  };

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

        {pendingPackage && (
          <PackageInlineCard
            packageId={pendingPackage.packageId}
            payload={pendingPackage.payload}
            estimatedTokens={pendingPackage.estimatedTokens}
            onViewPackages={onOpenPackagesTab}
            onQuickSend={approvePendingPackage}
            onReject={rejectPendingPackage}
          />
        )}

        {progressText && (
          <Text size={200} style={{ opacity: 0.75, marginTop: '4px' }}>
            {progressText}
          </Text>
        )}

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
      <ChatInput onSend={handleSend} />
    </div>
  );
};
