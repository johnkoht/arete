/**
 * Tests for arete credentials command
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { maskApiKey } from '../../src/commands/credentials.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test fixtures - use unique dir per test run to avoid parallel test interference
const TEST_TMPDIR = join(tmpdir(), `arete-credentials-test-${process.pid}-${Date.now()}`);
const ORIGINAL_HOME = process.env.HOME;

// Helper to run CLI commands
function runCli(args: string, options: { env?: Record<string, string> } = {}): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const cliPath = join(__dirname, '../../src/index.ts');
  const env = {
    ...process.env,
    // Clear API key env vars to ensure test isolation
    ANTHROPIC_API_KEY: '',
    GOOGLE_API_KEY: '',
    OPENAI_API_KEY: '',
    GROQ_API_KEY: '',
    ...options.env,
    // Redirect HOME to temp dir for isolated credential storage
    HOME: TEST_TMPDIR,
  };

  try {
    const stdout = execSync(`npx tsx ${cliPath} ${args}`, {
      encoding: 'utf8',
      env,
      cwd: TEST_TMPDIR,
      timeout: 30000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status ?? 1,
    };
  }
}

// Helper to get credentials file path
function getTestCredentialsPath(): string {
  return join(TEST_TMPDIR, '.arete', 'credentials.yaml');
}

// Helper to write test credentials
function writeTestCredentials(content: string): void {
  const dir = join(TEST_TMPDIR, '.arete');
  mkdirSync(dir, { recursive: true });
  writeFileSync(getTestCredentialsPath(), content, { mode: 0o600 });
}

// Helper to read test credentials
function readTestCredentials(): string {
  const path = getTestCredentialsPath();
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('credentials command', () => {
  beforeEach(() => {
    // Create clean temp directory
    if (existsSync(TEST_TMPDIR)) {
      rmSync(TEST_TMPDIR, { recursive: true });
    }
    mkdirSync(TEST_TMPDIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_TMPDIR)) {
      rmSync(TEST_TMPDIR, { recursive: true });
    }
    // Restore HOME
    process.env.HOME = ORIGINAL_HOME;
  });

  describe('maskApiKey', () => {
    it('masks keys showing first 8 and last 4 chars', () => {
      const key = 'sk-ant-api03-123456789abcdefghijklmnop';
      const masked = maskApiKey(key);
      assert.equal(masked, 'sk-ant-a...mnop');
    });

    it('returns *** for short keys', () => {
      assert.equal(maskApiKey('shortkey'), '***');
      assert.equal(maskApiKey('123456789012'), '***'); // exactly 12 chars
    });

    it('works with 13+ char keys', () => {
      const key = '1234567890123'; // 13 chars
      assert.equal(maskApiKey(key), '12345678...0123');
    });
  });

  describe('credentials show', () => {
    it('shows message when no providers configured (json)', () => {
      const { stdout, exitCode } = runCli('credentials show --json');
      assert.equal(exitCode, 0);
      
      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.deepEqual(result.providers, []);
    });

    it('shows providers from credentials file (json)', () => {
      writeTestCredentials(`
anthropic:
  api_key: sk-ant-api03-test1234567890abcdef
google:
  api_key: AIzaSyTest1234567890abcdefg
`);

      const { stdout, exitCode } = runCli('credentials show --json');
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.equal(result.providers.length, 2);
      
      const anthropic = result.providers.find((p: { provider: string }) => p.provider === 'anthropic');
      assert.ok(anthropic);
      assert.equal(anthropic.source, 'file');
      // Check masking
      assert.ok(anthropic.maskedKey.includes('...'));
      assert.ok(!anthropic.maskedKey.includes('test123456')); // Not revealing full key
    });

    it('shows env var providers (json)', () => {
      const { stdout, exitCode } = runCli('credentials show --json', {
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-test-env-key-12345',
        },
      });
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      const anthropic = result.providers.find((p: { provider: string }) => p.provider === 'anthropic');
      assert.ok(anthropic);
      assert.equal(anthropic.source, 'env');
    });

    it('shows secure permissions status', () => {
      writeTestCredentials('anthropic:\n  api_key: test123456789abcdef\n');

      const { stdout, exitCode } = runCli('credentials show --json');
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      assert.equal(result.securePermissions, true);
    });
  });

  describe('credentials set', () => {
    it('rejects unknown provider (json)', () => {
      const { stdout, exitCode } = runCli('credentials set unknown-provider --api-key test123 --json');
      assert.equal(exitCode, 1);

      const result = JSON.parse(stdout);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('Unknown provider'));
      assert.ok(result.supportedProviders.includes('anthropic'));
    });

    it('requires --api-key in json mode', () => {
      const { stdout, exitCode } = runCli('credentials set anthropic --json');
      assert.equal(exitCode, 1);

      const result = JSON.parse(stdout);
      assert.equal(result.success, false);
      assert.ok(result.error.includes('--api-key'));
    });

    it('saves credential with --no-validate (json)', () => {
      const testKey = 'sk-ant-test-key-1234567890abcdef';
      const { stdout, exitCode } = runCli(
        `credentials set anthropic --api-key ${testKey} --no-validate --json`,
      );
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.equal(result.provider, 'anthropic');
      assert.equal(result.validated, false);

      // Check file was created
      const content = readTestCredentials();
      assert.ok(content.includes('anthropic:'));
      assert.ok(content.includes('api_key:'));
    });

    it('creates file with 600 permissions', () => {
      const testKey = 'sk-ant-test-key-1234567890abcdef';
      runCli(`credentials set anthropic --api-key ${testKey} --no-validate --json`);

      const credPath = getTestCredentialsPath();
      assert.ok(existsSync(credPath));

      const stats = statSync(credPath);
      const mode = stats.mode & 0o777;
      assert.equal(mode, 0o600, `Expected 600, got ${mode.toString(8)}`);
    });

    it('preserves existing credentials when adding new provider', () => {
      // First write google
      writeTestCredentials('google:\n  api_key: existing-google-key\n');

      // Add anthropic
      const testKey = 'sk-ant-new-key-1234567890';
      runCli(`credentials set anthropic --api-key ${testKey} --no-validate --json`);

      const content = readTestCredentials();
      assert.ok(content.includes('google:'), 'Google key should be preserved');
      assert.ok(content.includes('existing-google-key'), 'Google key value preserved');
      assert.ok(content.includes('anthropic:'), 'Anthropic key should be added');
    });

    it('updates existing credential for same provider', () => {
      writeTestCredentials('anthropic:\n  api_key: old-key-12345\n');

      const newKey = 'sk-ant-new-key-67890abcdef';
      runCli(`credentials set anthropic --api-key ${newKey} --no-validate --json`);

      const content = readTestCredentials();
      assert.ok(!content.includes('old-key-12345'), 'Old key should be replaced');
      assert.ok(content.includes(newKey), 'New key should be saved');
    });

    // Skipping validation tests that require real API calls
    // Those would be integration tests
  });

  describe('credentials test', () => {
    it('shows message when no providers configured (json)', () => {
      const { stdout, exitCode } = runCli('credentials test --json');
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.equal(result.message, 'No providers configured');
      assert.deepEqual(result.results, []);
    });

    it('tests providers from credentials file (json) - skips without valid key', () => {
      // Write a credential for a provider without validation model
      writeTestCredentials('groq:\n  api_key: gsk_test1234567890abcdef\n');

      const { stdout, exitCode } = runCli('credentials test --json');
      assert.equal(exitCode, 0);

      const result = JSON.parse(stdout);
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].provider, 'groq');
      assert.equal(result.results[0].skipped, true); // No validation model for groq
    });

    // Real API validation tests would be integration tests
  });

  describe('help text', () => {
    it('shows help for credentials command', () => {
      const { stdout, exitCode } = runCli('credentials --help');
      assert.equal(exitCode, 0);
      
      // Commander shows "set [options] <provider>" format
      assert.ok(stdout.includes('set'), 'should include set subcommand');
      assert.ok(stdout.includes('<provider>'), 'should include <provider> arg');
      assert.ok(stdout.includes('show'), 'should include show subcommand');
      assert.ok(stdout.includes('test'), 'should include test subcommand');
      assert.ok(stdout.includes('login'), 'should include login subcommand');
      assert.ok(stdout.includes('Environment variables'), 'should mention env var priority');
      assert.ok(stdout.includes('~/.arete/credentials.yaml'), 'should mention API key storage path');
      assert.ok(stdout.includes('~/.arete/auth.json'), 'should mention OAuth storage path');
    });

    it('lists supported providers in help', () => {
      const { stdout, exitCode } = runCli('credentials --help');
      assert.equal(exitCode, 0);
      
      // API key providers
      assert.ok(stdout.includes('anthropic'));
      assert.ok(stdout.includes('google'));
      assert.ok(stdout.includes('openai'));
      
      // OAuth providers
      assert.ok(stdout.includes('github-copilot'));
      assert.ok(stdout.includes('google-gemini-cli'));
    });
  });
});
