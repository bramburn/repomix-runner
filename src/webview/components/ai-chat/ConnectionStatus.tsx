import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { CheckmarkCircle20Regular, DismissCircle20Regular, ErrorCircle20Regular, Hourglass20Regular } from '@fluentui/react-icons';

type ConnectionStatusType = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  errorMessage?: string;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
  },
  disconnected: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  connecting: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    border: `1px solid ${tokens.colorPaletteYellowBorder1}`,
  },
  connected: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  error: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    flex: 1,
  },
});

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  errorMessage,
}) => {
  const styles = useStyles();

  const getStatusConfig = () => {
    switch (status) {
      case 'disconnected':
        return {
          className: styles.disconnected,
          icon: <DismissCircle20Regular style={{ color: tokens.colorNeutralForeground3 }} />,
          text: 'Disconnected',
          color: tokens.colorNeutralForeground3,
        };
      case 'connecting':
        return {
          className: styles.connecting,
          icon: <Hourglass20Regular style={{ color: tokens.colorPaletteYellowForeground1 }} />,
          text: 'Connecting...',
          color: tokens.colorPaletteYellowForeground1,
        };
      case 'connected':
        return {
          className: styles.connected,
          icon: <CheckmarkCircle20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />,
          text: 'Connected',
          color: tokens.colorPaletteGreenForeground1,
        };
      case 'error':
        return {
          className: styles.error,
          icon: <ErrorCircle20Regular style={{ color: tokens.colorPaletteRedForeground1 }} />,
          text: errorMessage || 'Connection Error',
          color: tokens.colorPaletteRedForeground1,
        };
      default:
        return {
          className: styles.disconnected,
          icon: null,
          text: 'Unknown',
          color: tokens.colorNeutralForeground3,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`${styles.container} ${config.className}`}>
      <div className={styles.icon}>{config.icon}</div>
      <Text className={styles.text} size={200} style={{ color: config.color }}>
        {config.text}
      </Text>
    </div>
  );
};
