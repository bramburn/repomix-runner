import React, { useMemo, useState } from 'react';
import { Button, Text } from '@fluentui/react-components';
import { CostEstimator } from './CostEstimator.js';
import type { PackagePreviewData } from './packageTypes.js';

interface PackagePreviewProps {
  preview: PackagePreviewData;
  onClose: () => void;
  onSaveDraft: (data: { goal: string; outputInstruction: 'plan' | 'code_change' | 'code_review' }) => void;
}

export const PackagePreview: React.FC<PackagePreviewProps> = ({ preview, onClose, onSaveDraft }) => {
  const [goal, setGoal] = useState(preview.goal);
  const [outputInstruction, setOutputInstruction] = useState(preview.outputInstruction);

  const sortedFiles = useMemo(
    () => [...preview.contextFiles].sort((a, b) => b.tokenCount - a.tokenCount),
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
        <Text block style={{ marginTop: '10px', marginBottom: '4px' }}>
          Goal
        </Text>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={preview.status !== 'draft'}
          style={{
            width: '100%',
            minHeight: '72px',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--vscode-editorWidget-border)',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
          }}
        />
        <Text block size={200} style={{ opacity: 0.8, marginTop: '8px', marginBottom: '4px' }}>
          Output Type
        </Text>
        <select
          value={outputInstruction}
          disabled={preview.status !== 'draft'}
          onChange={(e) =>
            setOutputInstruction(e.target.value as 'plan' | 'code_change' | 'code_review')
          }
          style={{ padding: '6px', borderRadius: '6px' }}
        >
          <option value="plan">Plan</option>
          <option value="code_change">Code Change</option>
          <option value="code_review">Code Review</option>
        </select>
        <Text block size={200} style={{ opacity: 0.8 }}>
          Context files: {preview.contextFiles.length}
        </Text>
        <div style={{ marginTop: '8px' }}>
          <CostEstimator inputTokens={preview.estimatedTokens} />
        </div>
        {preview.status === 'draft' && (
          <div style={{ marginTop: '10px' }}>
            <Button
              appearance="primary"
              onClick={() => onSaveDraft({ goal, outputInstruction })}
            >
              Save Draft Changes
            </Button>
          </div>
        )}

        <Text weight="semibold" block style={{ marginTop: '14px' }}>
          Context Files
        </Text>
        <div style={{ marginTop: '6px' }}>
          {sortedFiles.map((file) => (
            <Text key={file.path} block size={200}>
              {file.path} ({file.tokenCount.toLocaleString()} tokens)
            </Text>
          ))}
        </div>

        <Text weight="semibold" block style={{ marginTop: '14px' }}>
          Raw Prompt
        </Text>
        <pre
          style={{
            marginTop: '8px',
            padding: '10px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
            background: 'var(--vscode-textCodeBlock-background)',
            border: '1px solid var(--vscode-editorWidget-border)',
            fontSize: '12px',
          }}
        >
          {preview.rawPrompt || '(empty)'}
        </pre>
      </div>
    </div>
  );
};
