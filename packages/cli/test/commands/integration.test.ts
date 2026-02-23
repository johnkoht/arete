import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { createTmpDir, cleanupTmpDir, runCli } from '../helpers.js';

describe('integration command', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-integration');
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('configures calendar integration with default macos provider', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const output = runCli(['integration', 'configure', 'calendar', '--json'], {
      cwd: workspaceDir,
    });
    const result = JSON.parse(output) as {
      success: boolean;
      integration: string;
      provider: string;
    };

    assert.equal(result.success, true);
    assert.equal(result.integration, 'calendar');
    assert.equal(result.provider, 'macos');

    const manifest = parseYaml(readFileSync(join(workspaceDir, 'arete.yaml'), 'utf8')) as {
      integrations?: {
        calendar?: {
          provider?: string;
          status?: string;
          calendars?: string[];
        };
      };
    };

    assert.equal(manifest.integrations?.calendar?.provider, 'macos');
    assert.equal(manifest.integrations?.calendar?.status, 'active');
    assert.equal(Array.isArray(manifest.integrations?.calendar?.calendars), false);
  });

  it('configures calendar with selected calendars', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const output = runCli(
      ['integration', 'configure', 'calendar', '--calendars', 'Work, Team , Personal', '--json'],
      { cwd: workspaceDir },
    );
    const result = JSON.parse(output) as {
      success: boolean;
      integration: string;
      calendars: string[];
    };

    assert.equal(result.success, true);
    assert.equal(result.integration, 'calendar');
    assert.deepEqual(result.calendars, ['Work', 'Team', 'Personal']);

    const manifest = parseYaml(readFileSync(join(workspaceDir, 'arete.yaml'), 'utf8')) as {
      integrations?: {
        calendar?: {
          calendars?: string[];
        };
      };
    };

    assert.deepEqual(manifest.integrations?.calendar?.calendars, ['Work', 'Team', 'Personal']);
  });

  it('configures calendar with all calendars scope', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const output = runCli(['integration', 'configure', 'calendar', '--all', '--json'], {
      cwd: workspaceDir,
    });
    const result = JSON.parse(output) as {
      success: boolean;
      integration: string;
      calendars: string;
    };

    assert.equal(result.success, true);
    assert.equal(result.integration, 'calendar');
    assert.equal(result.calendars, 'all');

    const manifest = parseYaml(readFileSync(join(workspaceDir, 'arete.yaml'), 'utf8')) as {
      integrations?: {
        calendar?: {
          calendars?: string[];
        };
      };
    };

    assert.deepEqual(manifest.integrations?.calendar?.calendars, []);
  });

  it('configures fathom so pull checks API key instead of reporting inactive integration', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const configureOutput = runCli(['integration', 'configure', 'fathom', '--json'], {
      cwd: workspaceDir,
    });
    const configureResult = JSON.parse(configureOutput) as {
      success: boolean;
      integration: string;
    };

    assert.equal(configureResult.success, true);
    assert.equal(configureResult.integration, 'fathom');

    const listOutput = runCli(['integration', 'list', '--json'], { cwd: workspaceDir });
    const listResult = JSON.parse(listOutput) as {
      success: boolean;
      integrations: Array<{ name: string; configured: string | null; active: boolean }>;
    };
    const fathomEntry = listResult.integrations.find((entry) => entry.name === 'fathom');
    assert.ok(fathomEntry, 'fathom should appear in integration list');
    assert.equal(fathomEntry?.configured, 'active');
    assert.equal(fathomEntry?.active, true);

    const pullOutput = runCli(['pull', 'fathom', '--days', '1', '--skip-qmd', '--json'], {
      cwd: workspaceDir,
    });
    const pullResult = JSON.parse(pullOutput) as {
      success: boolean;
      errors: string[];
    };

    assert.equal(pullResult.success, false);
    assert.ok(
      pullResult.errors.some((msg) => msg.includes('Fathom API key not found')),
      'pull should fail on missing key after fathom is configured',
    );
    assert.equal(
      pullResult.errors.some((msg) => msg.includes('Integration not active: fathom')),
      false,
      'pull should not report fathom as inactive after configure',
    );
  });

  it('blocks google-calendar configure when credentials are placeholders', () => {
    // Pre-flight check should prevent OAuth flow when no real credentials are set
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    // Ensure env vars are NOT set (placeholders will be used)
    const env = { ...process.env };
    delete env.GOOGLE_CLIENT_ID;
    delete env.GOOGLE_CLIENT_SECRET;

    try {
      runCli(['integration', 'configure', 'google-calendar'], {
        cwd: workspaceDir,
        env,
      });
      assert.fail('Should have exited with error');
    } catch (err: unknown) {
      const message = (err as Error).message ?? String(err);
      // execSync throws on non-zero exit — verify it exited (beta gate)
      assert.ok(
        message.includes('beta') || message.includes('Command failed') || message.includes('status 1'),
        `Expected beta gate exit, got: ${message}`,
      );
    }
  });

  it('shows google-calendar as active when integrations.calendar uses provider google', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const manifestPath = join(workspaceDir, 'arete.yaml');
    const manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as {
      schema?: number;
      integrations?: Record<string, unknown>;
    };

    manifest.integrations = {
      ...(manifest.integrations ?? {}),
      calendar: {
        provider: 'google',
        status: 'active',
        calendars: ['primary'],
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const credentialsDir = join(workspaceDir, '.credentials');
    mkdirSync(credentialsDir, { recursive: true });
    writeFileSync(
      join(credentialsDir, 'credentials.yaml'),
      [
        'google_calendar:',
        '  access_token: test-access-token',
        '  refresh_token: test-refresh-token',
        '  expires_at: 9999999999',
      ].join('\n'),
      'utf8',
    );

    const listOutput = runCli(['integration', 'list', '--json'], { cwd: workspaceDir });
    const listResult = JSON.parse(listOutput) as {
      success: boolean;
      integrations: Array<{ name: string; configured: string | null; active: boolean }>;
    };

    const googleEntry = listResult.integrations.find((entry) => entry.name === 'google-calendar');
    assert.ok(googleEntry, 'google-calendar should appear in integration list');
    assert.equal(googleEntry?.configured, 'active');
    assert.equal(googleEntry?.active, true);
  });
});
