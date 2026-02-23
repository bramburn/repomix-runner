import React, { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Text,
  makeStyles,
  tokens,
  Option,
} from '@fluentui/react-components';
import { Play20Regular, DismissCircle20Regular } from '@fluentui/react-icons';
import { FileEditCard } from './FileEditCard.js';

export interface FileEdit {
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  preview: string;
  lineCount: number;
  status: 'pending' | 'applied' | 'failed' | 'skipped';
  error?: string;
}

export interface EditReviewPanelProps {
  edits: FileEdit[];
  onApplyEdit: (filePath: string) => void;
  onSkipEdit: (filePath: string) => void;
  onViewDiff: (filePath: string) => void;
  onApplyAll: () => void;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  title: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase500,
  },
  summary: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  controls: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  editList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});

export const EditReviewPanel: React.FC<EditReviewPanelProps> = ({
  edits,
  onApplyEdit,
  onSkipEdit,
  onViewDiff,
  onApplyAll,
}) => {
  const styles = useStyles();

  const [selectedEdits, setSelectedEdits] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'pending' | 'applied' | 'failed' | 'skipped'>('all');

  // Calculate summary
  const summary = {
    creates: edits.filter((e) => e.action === 'create').length,
    edits: edits.filter((e) => e.action === 'edit').length,
    deletes: edits.filter((e) => e.action === 'delete').length,
    pending: edits.filter((e) => e.status === 'pending').length,
    applied: edits.filter((e) => e.status === 'applied').length,
    failed: edits.filter((e) => e.status === 'failed').length,
    skipped: edits.filter((e) => e.status === 'skipped').length,
  };

  // Filter edits
  const filteredEdits = edits.filter((edit) => {
    if (filter === 'all') return true;
    return edit.status === filter;
  });

  const handleSelectEdit = (filePath: string, selected: boolean) => {
    const newSelected = new Set(selectedEdits);
    if (selected) {
      newSelected.add(filePath);
    } else {
      newSelected.delete(filePath);
    }
    setSelectedEdits(newSelected);
  };

  const handleApplySelected = () => {
    selectedEdits.forEach((filePath) => {
      onApplyEdit(filePath);
    });
    setSelectedEdits(new Set());
  };

  const hasPendingEdits = summary.pending > 0;
  const hasSelectedPending = Array.from(selectedEdits).some(
    (fp) => edits.find((e) => e.filePath === fp)?.status === 'pending'
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text className={styles.title}>Review File Edits</Text>
        <div className={styles.summary}>
          <Badge appearance="outline" color="subtle">
            {summary.creates} create{summary.creates !== 1 ? 's' : ''}
          </Badge>
          <Badge appearance="outline" color="subtle">
            {summary.edits} edit{summary.edits !== 1 ? 's' : ''}
          </Badge>
          <Badge appearance="outline" color="subtle">
            {summary.deletes} delete{summary.deletes !== 1 ? 's' : ''}
          </Badge>
          <Divider vertical />
          <Badge appearance="outline" color="success">
            {summary.applied} applied
          </Badge>
          <Badge appearance="outline" color="error">
            {summary.failed} failed
          </Badge>
          <Badge appearance="outline" color="secondary">
            {summary.skipped} skipped
          </Badge>
        </div>
      </div>

      <div className={styles.controls}>
        <Field label="Filter by status:">
          <Dropdown
            value={filter}
            onOptionSelect={(_, data) => setFilter(data.optionValue as typeof filter)}
            size="small"
          >
            <Option value="all">All ({edits.length})</Option>
            <Option value="pending">Pending ({summary.pending})</Option>
            <Option value="applied">Applied ({summary.applied})</Option>
            <Option value="failed">Failed ({summary.failed})</Option>
            <Option value="skipped">Skipped ({summary.skipped})</Option>
          </Dropdown>
        </Field>

        <div className={styles.actions}>
          <Button
            icon={<Play20Regular />}
            onClick={onApplyAll}
            disabled={!hasPendingEdits}
            appearance="primary"
            size="small"
          >
            Apply All
          </Button>
          <Button
            icon={<Play20Regular />}
            onClick={handleApplySelected}
            disabled={!hasSelectedPending}
            appearance="subtle"
            size="small"
          >
            Apply Selected ({selectedEdits.size})
          </Button>
        </div>
      </div>

      <div className={styles.editList}>
        {filteredEdits.map((edit) => (
          <div key={edit.filePath} style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS }}>
            <Checkbox
              checked={selectedEdits.has(edit.filePath)}
              onChange={(_, data) => handleSelectEdit(edit.filePath, !!data.checked)}
              disabled={edit.status !== 'pending'}
            />
            <div style={{ flex: 1 }}>
              <FileEditCard
                filePath={edit.filePath}
                action={edit.action}
                preview={edit.preview}
                lineCount={edit.lineCount}
                status={edit.status}
                error={edit.error}
                onApply={onApplyEdit}
                onSkip={onSkipEdit}
                onViewDiff={onViewDiff}
              />
            </div>
          </div>
        ))}
      </div>

      {filteredEdits.length === 0 && (
        <Card>
          <Text align="center" color="neutralForeground3">
            No edits match the current filter.
          </Text>
        </Card>
      )}
    </div>
  );
};
