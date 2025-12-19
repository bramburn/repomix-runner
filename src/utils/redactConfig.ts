import { MergedConfig } from '../config/configSchema.js';

export function redactConfig(config: MergedConfig): Partial<MergedConfig> {
  // Deep clone to avoid mutating the original
  const redacted = JSON.parse(JSON.stringify(config));

  if (redacted.remote && redacted.remote.url) {
    redacted.remote.url = redactUrl(redacted.remote.url);
  }

  return redacted;
}

export function redactCommand(cmd: string): string {
  // Regex to match URLs with credentials in the command string
  // Matches protocol://user:pass@host or protocol://token@host
  // We want to capture the sensitive part and replace it.

  // Strategy: Find any substring that looks like a URL with @ and replace the user/pass part.
  // We can reuse the redactUrl logic but applied to substrings found via regex.

  // Regex for URL with potential credentials:
  // (https?|git|ssh):\/\/([^\s@]+)@
  // We match the protocol and the part before @.
  // Then we can analyze the part before @ to mask it.

  return cmd.replace(/((?:https?|git|ssh):\/\/)([^\s@]+)(@)/g, (match, protocol, credentials, at) => {
      // credentials can be "user:pass" or "token" or "user"
      if (credentials.includes(':')) {
          const [user, pass] = credentials.split(':');
          return `${protocol}${user}:*****${at}`;
      } else {
          // If it's just a token/username, mask it completely or partially?
          // For safety, if it looks like a token (long), mask it.
          // If it's "git", leave it.
          if (credentials === 'git') {
              return match;
          }
          return `${protocol}*****${at}`;
      }
  });
}

function redactUrl(urlStr: string): string {
    try {
        const url = new URL(urlStr);
        if (url.password) {
            url.password = '*****';
        }
        if (url.username && url.username !== 'git') {
            // Check if it looks like a token?
            // For now, if there is no password, treat username as potentially sensitive if it's not 'git'.
            // However, usually https://github.com/user/repo, the user is part of path, not auth.
            // Auth is only if it's before @. URL object handles this.
            // If we have username but NO password, it prints as username@host.
            // We should mask it if we want to be safe.
             if (!url.password) {
                 url.username = '*****';
             }
        }
        return url.toString();
    } catch (e) {
        // Fallback regex
        return urlStr.replace(/(:)\/\/[^:]+:[^@]+@/, '$1//*****:*****@')
                     .replace(/(:)\/\/[^:@]+@/, '$1//*****@');
    }
}
