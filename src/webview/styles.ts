import { makeStyles, shorthands } from '@fluentui/react-components';

export const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    boxSizing: 'border-box',
    ...shorthands.padding('10px'),
  },
  headerText: {
    marginBottom: '10px',
  },
  tabList: {
    marginBottom: '15px',
  },
  tabContent: {
    flexGrow: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  bundleListContainer: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('5px'),
  },
  bundleItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.padding('8px', '0'),
    borderBottom: '1px solid var(--vscode-widget-border)',
  },
  bundleInfo: {
    flexGrow: 1,
    marginRight: '10px',
    overflow: 'hidden',
  },
  textEllipsis: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  buttonsContainer: {
    display: 'flex',
    ...shorthands.gap('8px'),
  },
  defaultRepomixItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.padding('12px'),
    marginBottom: '10px',
    backgroundColor: 'var(--vscode-button-secondaryBackground)',
    ...shorthands.borderRadius('4px'),
    border: '1px solid var(--vscode-widget-border)',
  },
  defaultRepomixInfo: {
    flexGrow: 1,
    marginRight: '10px',
  },
  agentViewContainer: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('15px'),
    ...shorthands.padding('10px', '0'),
  },
  agentInputContainer: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('8px'),
  },
  successMessage: {
    ...shorthands.padding('12px'),
    backgroundColor: 'var(--vscode-inputValidation-infoBackground)',
    ...shorthands.borderRadius('4px'),
    border: '1px solid var(--vscode-inputValidation-infoBorder)',
  },
  errorMessage: {
    ...shorthands.padding('8px'),
    backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
    ...shorthands.borderRadius('4px'),
    border: '1px solid var(--vscode-inputValidation-warningBorder)',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('5px'),
    maxHeight: '300px',
    overflowY: 'auto',
    paddingRight: '5px',
  },
  historyItem: {
    ...shorthands.padding('10px'),
    backgroundColor: 'var(--vscode-editor-background)',
    ...shorthands.borderRadius('4px'),
    border: '1px solid var(--vscode-widget-border)',
    cursor: 'pointer',
  },
  debugPlaceholder: {
    ...shorthands.padding('10px'),
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  footer: {
    marginTop: '10px',
    alignSelf: 'center',
    ...shorthands.padding('2px', '6px'),
    ...shorthands.borderRadius('4px'),
    opacity: 0.5,
  },
});
