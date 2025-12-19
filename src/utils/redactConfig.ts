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
  // ([a-zA-Z0-9+.-]+):\/\/([^\s@]+)@
  // We match the protocol (alphanumeric, plus, dot, dash) and the part before @.
  // Then we can analyze the part before @ to mask it.

  return cmd.replace(/([a-zA-Z0-9+.-]+:\/\/)([^\s@]+)(@)/g, (match, protocol, credentials, at) => {
      // credentials can be "user:pass" or "token" or "user"
      if (credentials.includes(':')) {
          const [user, pass] = credentials.split(':');
          // If password is 'x-oauth-basic', the user is the token. Mask it.
          // Or if user is NOT 'git', maybe mask it too?
          // Safest default: Mask both if not 'git'.
          // If user IS 'git', likely just ssh auth or standard.

          let newUser = user;
          if (user !== 'git') {
              // Check if password suggests user is token?
              // Or just aggressively mask user if it's not 'git'.
              // But 'user:pass' is valid.
              // Let's check the comment: "Consider treating token-like usernames as sensitive even when a password is present."
              // We'll mask username if it's not 'git'.
              newUser = '*****';
          }

          return `${protocol}${newUser}:*****${at}`;
      } else {
          // If it's just a token/username
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
            // Also mask username if it's likely a token or sensitive
            if (url.username && url.username !== 'git') {
                url.username = '*****';
            }
        }
        if (url.username && url.username !== 'git') {
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
