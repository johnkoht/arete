/**
 * Tests for credentials module.
 *
 * Tests file-based credential management for AI API keys.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';

// We need to mock homedir for these tests, so we'll import the module dynamically
// after setting up the mock. For now, test the pure functions.

describe('credentials module', () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let originalEnv: NodeJS.ProcessEnv;

  // Import module after setting up environment
  let loadCredentials: typeof import('../src/credentials.js').loadCredentials;
  let saveCredential: typeof import('../src/credentials.js').saveCredential;
  let getApiKey: typeof import('../src/credentials.js').getApiKey;
  let getEnvVarName: typeof import('../src/credentials.js').getEnvVarName;
  let getConfiguredProviders: typeof import('../src/credentials.js').getConfiguredProviders;
  let getCredentialsPath: typeof import('../src/credentials.js').getCredentialsPath;
  let hasSecurePermissions: typeof import('../src/credentials.js').hasSecurePermissions;
  let loadCredentialsIntoEnv: typeof import('../src/credentials.js').loadCredentialsIntoEnv;

  beforeEach(async () => {
    // Create temp directory
    tmpDir = mkdtempSync(join(tmpdir(), 'creds-test-'));

    // Save original HOME and env
    originalHome = process.env.HOME;
    originalEnv = { ...process.env };

    // Set HOME to temp directory so ~/.arete resolves there
    process.env.HOME = tmpDir;

    // Clear relevant env vars
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;

    // Re-import module to pick up new HOME
    // Node caches modules, but since we're using dynamic imports in each test,
    // we need to bust the cache. The simplest approach is to use fresh imports.
    const mod = await import('../src/credentials.js');
    loadCredentials = mod.loadCredentials;
    saveCredential = mod.saveCredential;
    getApiKey = mod.getApiKey;
    getEnvVarName = mod.getEnvVarName;
    getConfiguredProviders = mod.getConfiguredProviders;
    getCredentialsPath = mod.getCredentialsPath;
    hasSecurePermissions = mod.hasSecurePermissions;
    loadCredentialsIntoEnv = mod.loadCredentialsIntoEnv;
  });

  afterEach(() => {
    // Restore HOME and env
    process.env.HOME = originalHome;
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);

    // Clean up temp directory
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getCredentialsPath', () => {
    it('returns path under ~/.arete', () => {
      const path = getCredentialsPath();
      assert.ok(path.includes('.arete'));
      assert.ok(path.endsWith('credentials.yaml'));
    });
  });

  describe('loadCredentials', () => {
    it('returns empty object when file does not exist', () => {
      const creds = loadCredentials();
      assert.deepEqual(creds, {});
    });

    it('loads credentials from yaml file', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "sk-test-key"\n',
      );

      const creds = loadCredentials();
      assert.equal(creds.anthropic?.api_key, 'sk-test-key');
    });

    it('handles multiple providers', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "sk-ant-key"\ngoogle:\n  api_key: "goog-key"\n',
      );

      const creds = loadCredentials();
      assert.equal(creds.anthropic?.api_key, 'sk-ant-key');
      assert.equal(creds.google?.api_key, 'goog-key');
    });

    it('returns empty object for invalid yaml', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(join(credDir, 'credentials.yaml'), 'not: valid: yaml: [');

      const creds = loadCredentials();
      assert.deepEqual(creds, {});
    });
  });

  describe('saveCredential', () => {
    it('creates directory and file with 600 permissions', () => {
      saveCredential('anthropic', 'sk-test-key');

      const credPath = join(tmpDir, '.arete', 'credentials.yaml');
      assert.ok(existsSync(credPath));

      const stats = statSync(credPath);
      const mode = stats.mode & 0o777;
      assert.equal(mode, 0o600, `Expected mode 0600, got ${mode.toString(8)}`);
    });

    it('preserves existing credentials when adding new provider', () => {
      saveCredential('anthropic', 'sk-ant-key');
      saveCredential('google', 'goog-key');

      const creds = loadCredentials();
      assert.equal(creds.anthropic?.api_key, 'sk-ant-key');
      assert.equal(creds.google?.api_key, 'goog-key');
    });

    it('updates existing provider credentials', () => {
      saveCredential('anthropic', 'old-key');
      saveCredential('anthropic', 'new-key');

      const creds = loadCredentials();
      assert.equal(creds.anthropic?.api_key, 'new-key');
    });

    it('writes valid yaml', () => {
      saveCredential('anthropic', 'sk-test');

      const content = readFileSync(join(tmpDir, '.arete', 'credentials.yaml'), 'utf8');
      const parsed = parseYaml(content);
      assert.equal(parsed.anthropic.api_key, 'sk-test');
    });
  });

  describe('getApiKey', () => {
    it('returns env var value when set', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';

      const key = getApiKey('anthropic');
      assert.equal(key, 'env-key');
    });

    it('returns file key when env var not set', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "file-key"\n',
      );

      const key = getApiKey('anthropic');
      assert.equal(key, 'file-key');
    });

    it('prefers env var over file', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "file-key"\n',
      );

      const key = getApiKey('anthropic');
      assert.equal(key, 'env-key');
    });

    it('returns null when no key available', () => {
      const key = getApiKey('anthropic');
      assert.equal(key, null);
    });

    it('works for google provider', () => {
      process.env.GOOGLE_API_KEY = 'google-key';

      const key = getApiKey('google');
      assert.equal(key, 'google-key');
    });
  });

  describe('getEnvVarName', () => {
    it('returns correct env var for known providers', () => {
      assert.equal(getEnvVarName('anthropic'), 'ANTHROPIC_API_KEY');
      assert.equal(getEnvVarName('google'), 'GOOGLE_API_KEY');
      assert.equal(getEnvVarName('openai'), 'OPENAI_API_KEY');
    });

    it('returns null for unknown provider', () => {
      assert.equal(getEnvVarName('unknown-provider'), null);
    });
  });

  describe('getConfiguredProviders', () => {
    it('returns empty array when nothing configured', () => {
      const providers = getConfiguredProviders();
      assert.deepEqual(providers, []);
    });

    it('returns env-sourced providers', () => {
      process.env.ANTHROPIC_API_KEY = 'key';

      const providers = getConfiguredProviders();
      assert.ok(providers.some((p) => p.provider === 'anthropic' && p.source === 'env'));
    });

    it('returns file-sourced providers', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "key"\n',
      );

      const providers = getConfiguredProviders();
      assert.ok(providers.some((p) => p.provider === 'anthropic' && p.source === 'file'));
    });

    it('prefers env source when both configured', () => {
      process.env.ANTHROPIC_API_KEY = 'env-key';
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "file-key"\n',
      );

      const providers = getConfiguredProviders();
      const anthropic = providers.filter((p) => p.provider === 'anthropic');
      assert.equal(anthropic.length, 1);
      assert.equal(anthropic[0].source, 'env');
    });
  });

  describe('hasSecurePermissions', () => {
    it('returns true when file does not exist', () => {
      assert.equal(hasSecurePermissions(), true);
    });

    it('returns true when file has 600 permissions', () => {
      saveCredential('anthropic', 'key'); // Creates with 600

      assert.equal(hasSecurePermissions(), true);
    });

    it('returns false when file has wrong permissions', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      const credPath = join(credDir, 'credentials.yaml');
      writeFileSync(credPath, 'test: value\n', { mode: 0o644 });

      assert.equal(hasSecurePermissions(), false);
    });
  });

  describe('loadCredentialsIntoEnv', () => {
    it('sets env vars from credentials file', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "loaded-key"\n',
      );

      loadCredentialsIntoEnv();

      assert.equal(process.env.ANTHROPIC_API_KEY, 'loaded-key');
    });

    it('does not overwrite existing env vars', () => {
      process.env.ANTHROPIC_API_KEY = 'existing-key';
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "file-key"\n',
      );

      loadCredentialsIntoEnv();

      assert.equal(process.env.ANTHROPIC_API_KEY, 'existing-key');
    });

    it('handles multiple providers', () => {
      const credDir = join(tmpDir, '.arete');
      mkdirSync(credDir, { recursive: true });
      writeFileSync(
        join(credDir, 'credentials.yaml'),
        'anthropic:\n  api_key: "ant-key"\ngoogle:\n  api_key: "goog-key"\n',
      );

      loadCredentialsIntoEnv();

      assert.equal(process.env.ANTHROPIC_API_KEY, 'ant-key');
      assert.equal(process.env.GOOGLE_API_KEY, 'goog-key');
    });
  });

  describe('OAuth credentials', () => {
    let getOAuthPath: typeof import('../src/credentials.js').getOAuthPath;
    let loadOAuthCredentials: typeof import('../src/credentials.js').loadOAuthCredentials;
    let saveOAuthCredentials: typeof import('../src/credentials.js').saveOAuthCredentials;
    let hasOAuthCredentials: typeof import('../src/credentials.js').hasOAuthCredentials;
    let getAvailableOAuthProviders: typeof import('../src/credentials.js').getAvailableOAuthProviders;

    beforeEach(async () => {
      const mod = await import('../src/credentials.js');
      getOAuthPath = mod.getOAuthPath;
      loadOAuthCredentials = mod.loadOAuthCredentials;
      saveOAuthCredentials = mod.saveOAuthCredentials;
      hasOAuthCredentials = mod.hasOAuthCredentials;
      getAvailableOAuthProviders = mod.getAvailableOAuthProviders;
    });

    describe('getOAuthPath', () => {
      it('returns path under ~/.arete', () => {
        const path = getOAuthPath();
        assert.ok(path.includes('.arete'));
        assert.ok(path.endsWith('auth.json'));
      });
    });

    describe('loadOAuthCredentials', () => {
      it('returns empty object when file does not exist', () => {
        const creds = loadOAuthCredentials();
        assert.deepEqual(creds, {});
      });

      it('loads OAuth credentials from json file', () => {
        const credDir = join(tmpDir, '.arete');
        mkdirSync(credDir, { recursive: true });
        writeFileSync(
          join(credDir, 'auth.json'),
          JSON.stringify({
            anthropic: {
              type: 'oauth',
              refresh: 'refresh-token',
              access: 'access-token',
              expires: Date.now() + 3600000,
            },
          }),
        );

        const creds = loadOAuthCredentials();
        assert.equal(creds.anthropic?.type, 'oauth');
        assert.equal(creds.anthropic?.refresh, 'refresh-token');
        assert.equal(creds.anthropic?.access, 'access-token');
      });

      it('returns empty object for invalid json', () => {
        const credDir = join(tmpDir, '.arete');
        mkdirSync(credDir, { recursive: true });
        writeFileSync(join(credDir, 'auth.json'), 'not valid json {{{');

        const creds = loadOAuthCredentials();
        assert.deepEqual(creds, {});
      });
    });

    describe('saveOAuthCredentials', () => {
      it('creates directory and file with 600 permissions', () => {
        const oauthCreds = {
          refresh: 'refresh-token',
          access: 'access-token',
          expires: Date.now() + 3600000,
        };
        saveOAuthCredentials('anthropic', oauthCreds);

        const authPath = join(tmpDir, '.arete', 'auth.json');
        assert.ok(existsSync(authPath));

        const stats = statSync(authPath);
        const mode = stats.mode & 0o777;
        assert.equal(mode, 0o600, `Expected mode 0600, got ${mode.toString(8)}`);
      });

      it('preserves existing credentials when adding new provider', () => {
        const creds1 = { refresh: 'r1', access: 'a1', expires: Date.now() + 3600000 };
        const creds2 = { refresh: 'r2', access: 'a2', expires: Date.now() + 3600000 };
        
        saveOAuthCredentials('anthropic', creds1);
        saveOAuthCredentials('github-copilot', creds2);

        const creds = loadOAuthCredentials();
        assert.equal(creds.anthropic?.refresh, 'r1');
        assert.equal(creds['github-copilot']?.refresh, 'r2');
      });

      it('updates existing provider credentials', () => {
        const old = { refresh: 'old', access: 'old', expires: Date.now() + 3600000 };
        const newCreds = { refresh: 'new', access: 'new', expires: Date.now() + 7200000 };
        
        saveOAuthCredentials('anthropic', old);
        saveOAuthCredentials('anthropic', newCreds);

        const creds = loadOAuthCredentials();
        assert.equal(creds.anthropic?.refresh, 'new');
      });
    });

    describe('hasOAuthCredentials', () => {
      it('returns false when no credentials', () => {
        assert.equal(hasOAuthCredentials('anthropic'), false);
      });

      it('returns true when credentials exist', () => {
        const creds = { refresh: 'r', access: 'a', expires: Date.now() + 3600000 };
        saveOAuthCredentials('anthropic', creds);

        assert.equal(hasOAuthCredentials('anthropic'), true);
        assert.equal(hasOAuthCredentials('google'), false);
      });
    });

    describe('getAvailableOAuthProviders', () => {
      it('returns array of OAuth providers', () => {
        const providers = getAvailableOAuthProviders();
        assert.ok(Array.isArray(providers));
        assert.ok(providers.length > 0);
        
        // Should include known OAuth providers
        const ids = providers.map(p => p.id);
        assert.ok(ids.includes('anthropic'));
        assert.ok(ids.includes('github-copilot'));
      });

      it('returns providers with id and name', () => {
        const providers = getAvailableOAuthProviders();
        for (const p of providers) {
          assert.ok(p.id, 'provider should have id');
          assert.ok(p.name, 'provider should have name');
        }
      });
    });

    describe('getConfiguredProviders with OAuth', () => {
      it('returns oauth-sourced providers', () => {
        const creds = { refresh: 'r', access: 'a', expires: Date.now() + 3600000 };
        saveOAuthCredentials('anthropic', creds);

        const providers = getConfiguredProviders();
        assert.ok(providers.some((p) => p.provider === 'anthropic' && p.source === 'oauth'));
      });

      it('prefers env over oauth', () => {
        process.env.ANTHROPIC_API_KEY = 'env-key';
        const creds = { refresh: 'r', access: 'a', expires: Date.now() + 3600000 };
        saveOAuthCredentials('anthropic', creds);

        const providers = getConfiguredProviders();
        const anthropic = providers.filter((p) => p.provider === 'anthropic');
        assert.equal(anthropic.length, 1);
        assert.equal(anthropic[0].source, 'env');
      });

      it('prefers oauth over file', () => {
        const credDir = join(tmpDir, '.arete');
        mkdirSync(credDir, { recursive: true });
        writeFileSync(
          join(credDir, 'credentials.yaml'),
          'anthropic:\n  api_key: "file-key"\n',
        );
        const oauthCreds = { refresh: 'r', access: 'a', expires: Date.now() + 3600000 };
        saveOAuthCredentials('anthropic', oauthCreds);

        const providers = getConfiguredProviders();
        const anthropic = providers.filter((p) => p.provider === 'anthropic');
        assert.equal(anthropic.length, 1);
        assert.equal(anthropic[0].source, 'oauth');
      });
    });
  });
});
