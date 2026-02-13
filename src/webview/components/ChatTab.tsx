import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text, Textarea } from '@fluentui/react-components';
import { CheckmarkCircle24Regular, Document24Regular, Edit24Regular, Send24Regular } from '@fluentui/react-icons';
import { vscode } from '../vscode-api.js';
import { ChatHeader } from './ChatHeader.js';
import { ThreadItem, ThreadList } from './ThreadList.js';

interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant' | 'progress';
  content: string;
  toolCalls?: ToolCall[];
}

const PlanFileCard = ({
  relativePath,
  onOpen,
  isNew,
}: {
  relativePath: string;
  onOpen: () => void;
  isNew?: boolean;
}) => {
  const fileName = relativePath.split(/[\\/]/).pop() ?? relativePath;
  const dirName = relativePath
    .substring(0, Math.max(0, relativePath.length - fileName.length))
    .replace(/[\\/]$/, '');
  return (
    <div
      onClick={onOpen}
      style={{
        marginTop: '12px',
        marginBottom: '12px',
        backgroundColor: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-widget-border)',
        borderRadius: '6px',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'var(--vscode-sideBar-background)',
          borderBottom: '1px solid var(--vscode-widget-border)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          backgroundColor: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
        }}>
          <Edit24Regular style={{ width: '12px', height: '12px' }} />
        </div>
        <Text weight="semibold" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.8 }}>
          {isNew ? 'Created Plan' : 'Updated Plan'}
        </Text>
        <div style={{ flexGrow: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <CheckmarkCircle24Regular style={{ width: '12px', height: '12px', color: 'var(--vscode-testing-iconPassed)' }} />
          <Text style={{ fontSize: '10px' }}>Success</Text>
        </div>
      </div>
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <Document24Regular style={{ width: '24px', height: '24px', color: 'var(--vscode-textLink-foreground)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Text weight="medium" style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fileName}
            </Text>
            {dirName && (
              <Text style={{ fontSize: '11px', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {dirName}
              </Text>
            )}
          </div>
        </div>
        <Button
          appearance="outline"
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          View
        </Button>
      </div>
    </div>
  );
};

const ToolCallCard = ({
  tool,
  onOpenFile,
}: {
  tool: ToolCall;
  onOpenFile: (filePath: string) => void;
}) => {
  const pathArg = typeof tool.args?.path === 'string'
    ? tool.args.path
    : typeof tool.args?.filePath === 'string'
      ? tool.args.filePath
      : '';
  const relativePathArg = typeof tool.args?.relativePath === 'string'
    ? tool.args.relativePath
    : pathArg;

  if (tool.name === 'update_plan' && pathArg) {
    return (
      <PlanFileCard
        relativePath={relativePathArg || pathArg}
        onOpen={() => onOpenFile(pathArg)}
        isNew={Boolean(tool.args?.isNew)}
      />
    );
  }

  let title = 'Tool Executed';
  let detail = tool.name;
  if (tool.name === 'read_file') {
    title = 'File Read';
    detail = relativePathArg || pathArg || 'Read file';
  } else if (tool.name === 'search_code') {
    title = 'Code Search';
    const queryArg = typeof tool.args?.query === 'string' ? tool.args.query : '';
    detail = queryArg || 'Searched repository';
  }

  return (
    <div
      style={{
        marginBottom: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Document24Regular style={{ width: '16px', height: '16px', opacity: 0.85 }} />
        <Text weight="semibold" style={{ fontSize: '12px' }}>{title}</Text>
        <div style={{ marginLeft: 'auto', opacity: 0.65 }}>
          <Text style={{ fontSize: '11px' }}>{tool.name}</Text>
        </div>
      </div>
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <Text style={{ fontSize: '12px', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {detail}
        </Text>
        {pathArg && (
          <Button
            appearance="subtle"
            size="small"
            onClick={() => onOpenFile(pathArg)}
          >
            Open
          </Button>
        )}
      </div>
    </div>
  );
};

export const ChatTab = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [tokensUsed, setTokensUsed] = useState(0);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [costUsd, setCostUsd] = useState(0);

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endOfMsgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    vscode.postMessage({ command: 'getThreads' });

    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'threadList') {
        setThreads(message.threads ?? []);
        if (typeof message.activeThreadId === 'string' || message.activeThreadId === null) {
          setActiveThreadId(message.activeThreadId);
        }
        return;
      }

      if (message.command === 'threadHistory') {
        setActiveThreadId(message.threadId || null);
        setMessages(message.messages ?? []);
        setIsLoading(false);
        return;
      }

      if (message.command === 'chatProgress') {
        setMessages((previous) => [...previous, { role: 'progress', content: message.text }]);
        return;
      }

      if (message.command === 'chatResponse') {
        setMessages((previous) => [
          ...previous,
          {
            role: 'assistant',
            content: message.text,
            toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : undefined,
          },
        ]);
        if (typeof message.tokensUsed === 'number') {
          setTokensUsed(message.tokensUsed);
        }
        if (typeof message.inputTokens === 'number') {
          setInputTokens(message.inputTokens);
        }
        if (typeof message.outputTokens === 'number') {
          setOutputTokens(message.outputTokens);
        }
        if (typeof message.costUsd === 'number') {
          setCostUsd(message.costUsd);
        }
        setIsLoading(false);
        vscode.postMessage({ command: 'getThreads' });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    endOfMsgRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isHistoryOpen]);

  const handleSend = () => {
    if (!input.trim()) {
      return;
    }

    setMessages((previous) => [...previous, { role: 'user', content: input }]);
    vscode.postMessage({ command: 'chatSubmit', text: input });
    setInput('');
    setIsLoading(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleOpenFile = (filePath: string) => {
    vscode.postMessage({ command: 'openFile', path: filePath });
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsLoading(false);
    setTokensUsed(0);
    setInputTokens(0);
    setOutputTokens(0);
    setCostUsd(0);
    vscode.postMessage({ command: 'createThread' });
  };

  const handleSelectThread = (threadId: string) => {
    if (threadId === activeThreadId) {
      return;
    }
    setMessages([]);
    setIsLoading(true);
    setActiveThreadId(threadId);
    vscode.postMessage({ command: 'loadThread', threadId });
  };

  const activeThreadTitle = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId)?.title ?? 'Chat',
    [threads, activeThreadId]
  );
  const activeThreadPlanPath = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId)?.planPath,
    [threads, activeThreadId]
  );

  const tokenBudget = 1_000_000;
  const resolvedTotalTokens = tokensUsed || (inputTokens + outputTokens);
  const tokenProgress = Math.min(resolvedTotalTokens / tokenBudget, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ChatHeader
        title={activeThreadTitle}
        planPath={activeThreadPlanPath}
        isHistoryOpen={isHistoryOpen}
        onToggleHistory={() => setIsHistoryOpen((previous) => !previous)}
        onNewChat={handleNewChat}
        onOpenPlan={() => {
          if (activeThreadPlanPath) {
            vscode.postMessage({ command: 'openFile', path: activeThreadPlanPath });
          }
        }}
      />

      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {isHistoryOpen && (
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
          />
        )}

        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
          <div style={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '12px',
          }}>
            {messages.length === 0 && !isLoading && (
              <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5 }}>
                <Text>Start a new conversation...</Text>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  gap: '4px',
                }}
              >
                <Text
                  style={{
                    opacity: 0.5,
                    fontSize: '11px',
                    textAlign: message.role === 'user' ? 'right' : 'left',
                  }}
                >
                  {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Assistant' : 'Progress'}
                </Text>
                {message.role === 'assistant' ? (
                  <div
                    style={{
                      backgroundColor: '#3c3c3c',
                      color: '#ffffff',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      borderTopLeftRadius: '4px',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      fontSize: '14px',
                    }}
                  >
                    {(message.toolCalls ?? []).map((tool, toolIndex) => {
                      return (
                        <ToolCallCard
                          key={`${tool.name}-${toolIndex}`}
                          tool={tool}
                          onOpenFile={handleOpenFile}
                        />
                      );
                    })}
                    {message.content}
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: message.role === 'user'
                        ? '#0078d4'
                        : 'rgba(255, 255, 255, 0.06)',
                      color: message.role === 'progress' ? 'rgba(255, 255, 255, 0.82)' : '#ffffff',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      borderTopRightRadius: message.role === 'user' ? '4px' : '10px',
                      borderTopLeftRadius: message.role === 'user' ? '10px' : '4px',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      fontSize: message.role === 'progress' ? '12px' : '14px',
                    }}
                  >
                    {message.content}
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'progress' && (
              <div style={{ padding: '10px', opacity: 0.7 }}>Thinking...</div>
            )}
            <div ref={endOfMsgRef} />
          </div>

          <div style={{ padding: '0 10px 10px 10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '4px 8px',
                marginBottom: '8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <div style={{ flex: 1, height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${tokenProgress * 100}%`, height: '100%', background: '#0078d4' }} />
              </div>
              <Text style={{ fontSize: '10px', opacity: 0.6 }}>${costUsd.toFixed(2)}</Text>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(_, data) => setInput(data.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                style={{ flex: 1, minHeight: '40px', maxHeight: '120px', resize: 'vertical' }}
                placeholder="Type a message..."
                disabled={isLoading}
              />
              <Button
                appearance="primary"
                icon={<Send24Regular />}
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
