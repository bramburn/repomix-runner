export type OutputStyle = 'xml' | 'markdown' | 'plain' | 'json';

export function normalizeOutputStyle(style?: string): OutputStyle {
  const s = (style ?? '').toLowerCase().trim();

  switch (s) {
    case 'md':
    case 'markdown':
      return 'markdown';

    case 'txt':
    case 'text':
    case 'plain':
      return 'plain';

    case 'json':
      return 'json';

    case 'xml':
    default:
      return 'xml';
  }
}

