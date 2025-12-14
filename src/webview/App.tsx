import React from 'react';
import { FluentProvider, webDarkTheme, Button, Text } from '@fluentui/react-components';

export const App = () => {
  return (
    <FluentProvider theme={webDarkTheme}>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Text size={500} weight="semibold">Repomix Runner Control Panel</Text>
        <Text>Welcome to the new side bar view!</Text>
        <Button appearance="primary" onClick={() => console.log('Button clicked')}>
          Hello World
        </Button>
      </div>
    </FluentProvider>
  );
};
