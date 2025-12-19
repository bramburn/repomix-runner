import assert from 'assert';
import { redactConfig, redactCommand } from '../../utils/redactConfig.js';
import { MergedConfig } from '../../config/configSchema.js';

suite('redactConfig', () => {
  test('should redact password from remote.url', () => {
    const config = {
      remote: {
        url: 'https://user:password123@github.com/repo.git',
      },
      cwd: '/tmp',
      version: false,
    } as MergedConfig;

    const redacted = redactConfig(config);
    // User is masked too if not git
    assert.strictEqual(redacted.remote?.url, 'https://*****:*****@github.com/repo.git');
    // Ensure original is not modified
    assert.strictEqual(config.remote?.url, 'https://user:password123@github.com/repo.git');
  });

  test('should redact token (username only) from remote.url', () => {
    const config = {
      remote: {
        url: 'https://ghp_secretToken@github.com/repo.git',
      },
      cwd: '/tmp',
      version: false,
    } as MergedConfig;

    const redacted = redactConfig(config);
    assert.strictEqual(redacted.remote?.url, 'https://*****@github.com/repo.git');
  });

  test('should redact token AND password (x-oauth-basic) from remote.url', () => {
    const config = {
      remote: {
        url: 'https://ghp_token:x-oauth-basic@github.com/repo.git',
      },
      cwd: '/tmp',
      version: false,
    } as MergedConfig;

    const redacted = redactConfig(config);
    assert.strictEqual(redacted.remote?.url, 'https://*****:*****@github.com/repo.git');
  });

  test('should NOT redact "git" username from remote.url', () => {
    const config = {
      remote: {
        url: 'ssh://git@github.com/repo.git',
      },
      cwd: '/tmp',
      version: false,
    } as MergedConfig;

    const redacted = redactConfig(config);
    assert.strictEqual(redacted.remote?.url, 'ssh://git@github.com/repo.git');
  });


  test('should handle invalid URLs gracefully', () => {
     const config = {
      remote: {
        url: 'not-a-valid-url',
      },
      cwd: '/tmp',
      version: false,
    } as MergedConfig;

    const redacted = redactConfig(config);
    assert.strictEqual(redacted.remote?.url, 'not-a-valid-url');
  });

  test('should handle regex fallback for invalid URL structures that look like URLs', () => {
      const config = {
        remote: {
            url: 'git+ssh://user:pass@host/repo'
        },
        cwd: '/',
        version: false
      } as MergedConfig;

      const redacted = redactConfig(config);
      // Depending on implementation, it might be caught by URL or regex.
      // Our regex fallback handles user:pass@
      assert.ok(redacted.remote?.url?.includes('*****'));
  });
});

suite('redactCommand', () => {
    test('should redact credentials in command string', () => {
        const cmd = 'npx repomix --remote https://user:pass@github.com/repo.git';
        const redacted = redactCommand(cmd);
        // User masked too
        assert.strictEqual(redacted, 'npx repomix --remote https://*****:*****@github.com/repo.git');
    });

    test('should redact token in command string', () => {
        const cmd = 'npx repomix --remote https://ghp_token@github.com/repo.git';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'npx repomix --remote https://*****@github.com/repo.git');
    });

    test('should redact git+ssh scheme with user:pass', () => {
        const cmd = 'npx repomix --remote git+ssh://user:pass@github.com/repo.git';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'npx repomix --remote git+ssh://*****:*****@github.com/repo.git');
    });

    test('should NOT redact git user in command string', () => {
        const cmd = 'npx repomix --remote ssh://git@github.com/repo.git';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'npx repomix --remote ssh://git@github.com/repo.git');
    });

    test('should NOT redact git user with fake password (unlikely but safe check)', () => {
         // If user is git, we keep it visible?
         // Logic: if user !== 'git', mask it.
         // So git:pass -> git:*****
         const cmd = 'npx repomix --remote https://git:somepass@github.com/repo.git';
         const redacted = redactCommand(cmd);
         assert.strictEqual(redacted, 'npx repomix --remote https://git:*****@github.com/repo.git');
    });

    test('should handle multiple URLs', () => {
        const cmd = 'echo https://user:pass@a.com && echo https://token@b.com';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'echo https://*****:*****@a.com && echo https://*****@b.com');
    });

    test('should not affect normal flags', () => {
        const cmd = 'npx repomix --verbose --output-style xml';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, cmd);
    });
});
