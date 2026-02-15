import React from 'react';
import { Text } from '@fluentui/react-components';
import { Document24Regular, Search24Regular } from '@fluentui/react-icons';

interface ToolCallCardProps {
  toolName: string;
  status: string;
  details: string;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolName, status, details }) => {
  const isCompleted = status === 'Completed';
  const isReading = status === 'Reading...';
  
  // Choose icon based on tool type
  const getIcon = () => {
    if (toolName === 'Code Search') {
      return <Search24Regular style={{ width: '16px', height: '16px' }} />;
    }
    return <Document24Regular style={{ width: '16px', height: '16px' }} />;
  };

  return (
    <div
      style={{
        marginBottom: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ 
        padding: '8px 12px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        {getIcon()}
        <Text weight="semibold" style={{ fontSize: '12px' }}>
          {toolName}
        </Text>
        <div style={{ 
          marginLeft: 'auto',
          padding: '2px 8px',
          borderRadius: '12px',
          backgroundColor: isCompleted 
            ? 'rgba(40, 167, 69, 0.2)' 
            : isReading 
              ? 'rgba(0, 120, 212, 0.2)'
              : 'rgba(220, 53, 69, 0.2)',
          color: isCompleted 
            ? '#28a745' 
            : isReading 
              ? '#0078d4'
              : '#dc3545',
        }}>
          <Text style={{ fontSize: '11px' }}>{status}</Text>
        </div>
      </div>
      
      {/* Details */}
      <div style={{ 
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <Text style={{ 
          fontSize: '12px', 
          opacity: 0.8,
          fontFamily: 'monospace',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          padding: '4px 8px',
          borderRadius: '4px',
          flex: 1,
        }}>
          {details}
        </Text>
      </div>
    </div>
  );
};