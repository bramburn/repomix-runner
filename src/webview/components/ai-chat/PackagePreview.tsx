import React, { useMemo, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { CostEstimator } from './CostEstimator.js';
import type { PackagePreviewData } from './packageTypes.js';

const MAX_GOAL_LENGTH = 8000;

interface PackagePreviewProps {
  preview: PackagePreviewData;
  onClose: () => void;
  onSaveDraft: (data: { goal: string; outputInstruction: 'plan' | 'code_change' | 'code_review' }) => void;
}

export const PackagePreview: React.FC<PackagePreviewProps> = ({ preview, onClose, onSaveDraft }) => {
  const [goal, setGoal] = useState(preview.goal);
  const [outputInstruction, setOutputInstruction] = useState(preview.outputInstruction);
  const [showRawPrompt, setShowRawPrompt] = useState(false);
  const trimmedGoal = goal.trim();
  const isGoalTooLong = goal.length > MAX_GOAL_LENGTH;
  const isGoalEmpty = trimmedGoal.length === 0;
  const goalError =
    isGoalTooLong
      ? `Goal cannot exceed ${MAX_GOAL_LENGTH} characters.`
      : isGoalEmpty
        ? 'Goal cannot be empty.'
        : null;

  const sortedFiles = useMemo(
    () => [...preview.contextFiles].sort((a, b) => b.tokenCount - a.tokenCount),
    [preview.contextFiles]
  );

  const totalTokens = useMemo(
    () => preview.contextFiles.reduce((sum, f) => sum + f.tokenCount, 0),
    [preview.contextFiles]
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 'min(860px, 92vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-editorWidget-border)',
          borderRadius: '10px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="semibold">Package Preview</Text>
          <Button onClick={onClose}>Close</Button>
        </div>

        {/* Error message for failed/cancelled packages */}
        {preview.errorMessage && (preview.status === 'failed' || preview.status === 'cancelled') && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--vscode-inputValidation-errorBorder)',
              background: 'var(--vscode-inputValidation-errorBackground)',
            }}
          >
            <Text size={200} style={{ color: 'var(--vscode-errorForeground)' }}>
              {preview.status === 'failed' ? 'Error' : 'Cancelled'}: {preview.errorMessage}
            </Text>
          </div>
        )}

        {/* Goal */}
        <Text block style={{ marginTop: '10px', marginBottom: '4px' }}>
          Goal
        </Text>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          maxLength={MAX_GOAL_LENGTH}
          disabled={preview.status !== 'draft'}
          aria-label="Package goal"
          style={{
            width: '100%',
            minHeight: '72px',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--vscode-editorWidget-border)',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            resize: 'vertical',
          }}
        />
        <Text
          block
          size={200}
          style={{ opacity: 0.75, marginTop: '4px', color: goalError ? 'var(--vscode-errorForeground)' : undefined }}
        >
          {goalError ?? `${goal.length}/${MAX_GOAL_LENGTH}`}
        </Text>

        {/* Output Type */}
        <Text block size={200} style={{ opacity: 0.8, marginTop: '8px', marginBottom: '4px' }}>
          Output Type
        </Text>
        <select
          value={outputInstruction}
          disabled={preview.status !== 'draft'}
          onChange={(e) =>
            setOutputInstruction(e.target.value as 'plan' | 'code_change' | 'code_review')
          }
          aria-label="Output instruction type"
          style={{ padding: '6px', borderRadius: '6px' }}
        >
          <option value="plan">Plan</option>
          <option value="code_change">Code Change</option>
          <option value="code_review">Code Review</option>
        </select>

        {/* Summary stats */}
        <div style={{ marginTop: '10px' }}>
          <Text block size={200} style={{ opacity: 0.8 }}>
            Context files: {preview.contextFiles.length} ({totalTokens.toLocaleString()} tokens)
          </Text>
          <CostEstimator inputTokens={preview.estimatedTokens} />
        </div>

        {/* Save draft button */}
        {preview.status === 'draft' && (
          <div style={{ marginTop: '10px' }}>
            <Button
              appearance="primary"
              disabled={Boolean(goalError)}
              onClick={() => onSaveDraft({ goal: trimmedGoal, outputInstruction })}
            >
              Save Draft Changes
            </Button>
          </div>
        )}

        {/* Context Files */}
        <Text weight="semibold" block style={{ marginTop: '14px' }}>
          Context Files
        </Text>
        <div style={{ marginTop: '6px' }}>
          {sortedFiles.map((file) => (
            <Text key={file.path} block size={200}>
              {file.path} — {file.tokenCount.toLocaleString()} tokens
              {file.compressionLevel ? ` (${file.compressionLevel})` : ''}
            </Text>
          ))}
        </div>

        {/* Collapsible Raw Prompt */}
        <div style={{ marginTop: '14px' }}>
          <Button
            appearance="subtle"
            onClick={() => setShowRawPrompt((prev) => !prev)}
            style={{ padding: '4px 0' }}
          >
            {showRawPrompt ? '▾ Hide Raw Prompt' : '▸ Show Raw Prompt'}
          </Button>
          {showRawPrompt && (
            <pre
              style={{
                marginTop: '8px',
                padding: '10px',
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                background: 'var(--vscode-textCodeBlock-background)',
                border: '1px solid var(--vscode-editorWidget-border)',
                fontSize: '12px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {preview.rawPrompt || '(empty)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
