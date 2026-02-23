import React, { useState, useRef, useEffect } from 'react';
import { Text } from '@fluentui/react-components';
import { ChatMessage } from './ChatMessage.js';
import { ToolCallCard } from './ToolCallCard.js';
import { ChatInput } from './ChatInput.js';
import { PackageInlineCard } from './PackageInlineCard.js';
import { EditReviewPanel } from './EditReviewPanel.js';
import { vscode } from '../../vscode-api.js';
import type { PackagePayload } from './packageTypes.js';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
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

interface FileEdit {
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  preview: string;
  lineCount: number;
  status: 'pending' | 'applied' | 'failed' | 'skipped';
  error?: string;
}

export const ChatTab: React.FC<ChatTabProps> = ({ onOpenPackagesTab }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls] = useState<ToolCall[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [pendingPackage, setPendingPackage] = useState<PendingPackageReview | null>(null);
  const [pendingEdits, setPendingEdits] = useState<FileEdit[] | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<{ timestamp: number; id: string } | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      shouldAutoScrollRef.current = true;
      return;
    }
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingPackage, progressText]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'threadHistory' && Array.isArray(message.messages)) {
        const incoming = message.messages.map(
          (m: { id?: string; role: 'user' | 'assistant'; content: string; timestamp?: number }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })
        );
        const append = message.append === true;
        if (append) {
          shouldAutoScrollRef.current = false;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id).filter(Boolean));
            const dedupedIncoming = incoming.filter((m) => !m.id || !seen.has(m.id));
            return [...dedupedIncoming, ...prev];
          });
        } else {
          shouldAutoScrollRef.current = true;
          setMessages(incoming);
        }

        if (typeof message.threadId === 'string') {
          setActiveThreadId(message.threadId);
        }
        setHasMoreHistory(Boolean(message.hasMore));
        setHistoryCursor(
          message.nextCursor &&
            typeof message.nextCursor.timestamp === 'number' &&
            typeof message.nextCursor.id === 'string'
            ? message.nextCursor
            : null
        );
        setIsLoadingHistory(false);
        return;
      }
      if (message?.command === 'chatResponse' && typeof message.text === 'string') {
        setProgressText('');
        shouldAutoScrollRef.current = true;
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
      if (message?.command === 'editReview' && Array.isArray(message.edits)) {
        setPendingEdits(message.edits);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = (text: string) => {
    setProgressText('');
    shouldAutoScrollRef.current = true;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    vscode.postMessage({ command: 'chatSubmit', text });
  };

  const loadOlderHistory = () => {
    if (!activeThreadId || !historyCursor || isLoadingHistory) {
      return;
    }

    setIsLoadingHistory(true);
    vscode.postMessage({
      command: 'getThreadHistoryPage',
      threadId: activeThreadId,
      before: historyCursor,
    });
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

  const handleApplyEdit = (filePath: string) => {
    vscode.postMessage({
      command: 'applyEdit',
      filePath,
    });
  };

  const handleSkipEdit = (filePath: string) => {
    vscode.postMessage({
      command: 'skipEdit',
      filePath,
    });
  };

  const handleViewDiff = (filePath: string) => {
    vscode.postMessage({
      command: 'viewEditDiff',
      filePath,
    });
  };

  const handleApplyAllEdits = () => {
    vscode.postMessage({
      command: 'applyAllEdits',
    });
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
        {hasMoreHistory && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={loadOlderHistory}
              disabled={isLoadingHistory}
              style={{
                border: '1px solid var(--vscode-widget-border)',
                borderRadius: '6px',
                background: 'var(--vscode-editorWidget-background)',
                color: 'var(--vscode-foreground)',
                padding: '4px 10px',
                cursor: isLoadingHistory ? 'default' : 'pointer',
                opacity: isLoadingHistory ? 0.7 : 1,
              }}
            >
              {isLoadingHistory ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.map((message, index) => (
          <ChatMessage 
            key={message.id ?? `${message.role}-${index}-${message.timestamp ?? 0}`}
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

        {pendingEdits && (
          <EditReviewPanel
            edits={pendingEdits}
            onApplyEdit={handleApplyEdit}
            onSkipEdit={handleSkipEdit}
            onViewDiff={handleViewDiff}
            onApplyAll={handleApplyAllEdits}
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
