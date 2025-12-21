
import React from 'react';

// --- Interfaces ---

export interface Bundle {
  id: string;
  name: string;
  description?: string;
  files: string[];
  outputFileExists?: boolean;
  outputFilePath?: string;
  stats?: {
    files: number;
    folders: number;
    totalSize: number;
  };
}

export interface DefaultRepomixInfo {
  outputFileExists: boolean;
  outputFilePath: string;
}

export interface AgentState {
  lastOutputPath?: string;
  lastFileCount?: number;
  lastQuery?: string;
  lastTokens?: number;
  runFailed: boolean;
}

export interface AgentRunHistoryItem {
  id: string;
  timestamp: number;
  query: string;
  fileCount: number;
  files: string[];
  success: boolean;
  error?: string;
  duration?: number;
  outputPath?: string;
}

export interface DebugRun {
  id: number;
  timestamp: number;
  files: string[];
  output?: string;
  error?: string;
}

export interface PineconeIndex {
  name: string;
  host: string;
  dimension?: number;
  metric?: string;
  spec?: any;
  status?: any;
}

export interface LongPressButtonProps {
  onClick: () => void;
  onLongPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  appearance?: 'primary' | 'secondary' | 'subtle' | 'outline' | 'transparent';
  style?: React.CSSProperties;
  title?: string;
  holdDuration?: number; // Total duration to trigger long press (default 2000ms)
  bufferDuration?: number; // Time before progress starts (default 500ms)
}

export interface BundleItemProps {
  bundle: Bundle;
  state: 'idle' | 'queued' | 'running';
  onRun: (id: string, compress?: boolean) => void;
  onCancel: (id: string) => void;
  onCopy: (id: string) => void;
}

export interface DefaultRepomixItemProps {
  state: 'idle' | 'queued' | 'running';
  info: DefaultRepomixInfo;
  onRun: (compress?: boolean) => void;
  onCancel: () => void;
  onCopy: () => void;
}

// --- WebView State ---

export interface WebViewState {
  selectedTab?: string;
  agentQuery?: string;
  agentLastRun?: AgentState;
  pineconeIndexes?: PineconeIndex[];
  selectedPineconeIndex?: PineconeIndex | null;
}
