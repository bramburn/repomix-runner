import React, { useState, useEffect } from 'react';
import { Button, Input, makeStyles, tokens } from '@fluentui/react-components';
import { Checkmark20Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { vscode } from '../../vscode-api.js';

type SecretKey = 'googleApiKey' | 'pineconeApiKey' | 'qdrantApiKey' | 'anthropicApiKey' | 'postgresConnectionString';

interface SecretInputProps {
  secretKey: SecretKey;
  label: string;
  placeholder?: string;
  description?: string;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalM,
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  inputRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  input: {
    flex: 1,
  },
  saveButton: {
    minWidth: '80px',
  },
  description: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

export const SecretInput: React.FC<SecretInputProps> = ({
  secretKey,
  label,
  placeholder,
  description,
}) => {
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if secret exists on mount
  useEffect(() => {
    vscode.postMessage({ command: 'checkSecret', key: secretKey });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'secretStatus' && message.key === secretKey) {
        if (message.exists) {
          setValue('••••••••••••'); // Masked value
        } else {
          setValue('');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [secretKey]);

  const handleSave = () => {
    if (!value || value.includes('•')) {
      return; // Don't save masked value
    }

    setIsLoading(true);
    vscode.postMessage({
      command: 'saveSecret',
      key: secretKey,
      value,
    });

    // Show saved confirmation
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    setValue('••••••••••••');
    setIsLoading(false);
  };

  const handleClear = () => {
    setValue('');
    // Save empty value to clear the secret
    vscode.postMessage({
      command: 'saveSecret',
      key: secretKey,
      value: '',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // If user starts typing, clear the masked value
    if (newValue && !newValue.includes('•')) {
      setValue(newValue);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <span style={{ fontWeight: tokens.fontWeightSemibold }}>{label}</span>
        {isSaved && (
          <span style={{ color: tokens.colorPaletteGreenForeground1, fontSize: tokens.fontSizeBase200 }}>
            ✓ Saved
          </span>
        )}
      </div>
      <div className={styles.inputRow}>
        <Input
          className={styles.input}
          type="password"
          placeholder={placeholder || 'Enter secret value'}
          value={value.replace(/•/g, '')}
          onChange={handleChange}
          disabled={isLoading}
        />
        {value && !value.includes('•') && (
          <>
            <Button
              className={styles.saveButton}
              appearance="primary"
              onClick={handleSave}
              disabled={isLoading || !value.trim()}
              icon={<Checkmark20Regular />}
            >
              Save
            </Button>
            <Button
              appearance="secondary"
              onClick={handleClear}
              disabled={isLoading}
              icon={<Dismiss20Regular />}
            >
              Clear
            </Button>
          </>
        )}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </div>
  );
};
