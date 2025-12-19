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
    assert.strictEqual(redacted.remote?.url, 'https://user:*****@github.com/repo.git');
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
        assert.strictEqual(redacted, 'npx repomix --remote https://user:*****@github.com/repo.git');
    });

    test('should redact token in command string', () => {
        const cmd = 'npx repomix --remote https://ghp_token@github.com/repo.git';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'npx repomix --remote https://*****@github.com/repo.git');
    });

    test('should NOT redact git user in command string', () => {
        const cmd = 'npx repomix --remote ssh://git@github.com/repo.git';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'npx repomix --remote ssh://git@github.com/repo.git');
    });

    test('should handle multiple URLs', () => {
        const cmd = 'echo https://user:pass@a.com && echo https://token@b.com';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, 'echo https://user:*****@a.com && echo https://*****@b.com');
    });

    test('should not affect normal flags', () => {
        const cmd = 'npx repomix --verbose --output-style xml';
        const redacted = redactCommand(cmd);
        assert.strictEqual(redacted, cmd);
    });
});
