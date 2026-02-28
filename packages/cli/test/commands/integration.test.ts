import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { StorageAdapter } from '@arete/core';
import {
  configureNotionIntegration,
  resolveNotionToken,
} from '../../src/commands/integration.js';
import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

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

  // NOTE: CLI-level test for notion configure with HTTP server caused test runner hangs.
  // The configureNotionIntegration helper is tested thoroughly in the unit tests below,
  // which verify: token validation, credential storage, integration service calls, and error handling.

  it('blocks google-calendar configure when credentials are placeholders', () => {
    // Pre-flight check should prevent OAuth flow when no real credentials are set
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    // Explicitly unset Google credentials so placeholders are used
    // Setting to empty string overrides any real env vars from parent process
    const { stdout, stderr, code } = runCliRaw(
      ['integration', 'configure', 'google-calendar'],
      {
        cwd: workspaceDir,
        env: {
          ...process.env,
          GOOGLE_CLIENT_ID: '',
          GOOGLE_CLIENT_SECRET: '',
        },
      }
    );

    // Should exit with error (beta gate blocks when no real credentials)
    assert.notEqual(code, 0, 'Should exit with non-zero code');
    const output = stderr || stdout;
    assert.ok(
      output.includes('beta') || output.includes('Beta') || code === 1,
      `Expected beta gate exit, got code=${code}: ${output}`,
    );
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

describe('integration command (notion configure helpers)', () => {
  it('configures notion successfully with valid token and writes notion.api_key', async () => {
    const storage = new MemoryStorageAdapter();
    const calls: Array<{ workspaceRoot: string; integration: string; config: Record<string, unknown> }> = [];

    await configureNotionIntegration({
      storage,
      integrationService: {
        async configure(workspaceRoot, integration, config) {
          calls.push({ workspaceRoot, integration, config });
        },
      },
      workspaceRoot: '/workspace',
      token: 'ntn_valid_token',
      fetchFn: async () => createJsonResponse(200, { object: 'user', id: 'user_123' }),
      baseUrl: 'http://example.test',
    });

    const content = await storage.read('/workspace/.credentials/credentials.yaml');
    assert.ok(content, 'credentials should be written');

    const parsed = parseYaml(content) as { notion?: { api_key?: string } };
    assert.equal(parsed.notion?.api_key, 'ntn_valid_token');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].integration, 'notion');
    assert.deepEqual(calls[0].config, { status: 'active' });
  });

  it('returns clear error for invalid notion token', async () => {
    const storage = new MemoryStorageAdapter();

    await assert.rejects(
      async () => {
        await configureNotionIntegration({
          storage,
          integrationService: {
            async configure() {
              throw new Error('should not be called');
            },
          },
          workspaceRoot: '/workspace',
          token: 'ntn_invalid',
          fetchFn: async () => createJsonResponse(401, { object: 'error' }),
          baseUrl: 'http://example.test',
        });
      },
      /Invalid Notion API token/,
    );
  });

  it('uses --token mode without prompting when token is provided', async () => {
    let prompted = false;
    const token = await resolveNotionToken('ntn_from_flag', async () => {
      prompted = true;
      return 'ntn_prompted';
    });

    assert.equal(token, 'ntn_from_flag');
    assert.equal(prompted, false);
  });
});

class MemoryStorageAdapter implements StorageAdapter {
  private files = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async list(_dir: string): Promise<string[]> {
    return [];
  }

  async listSubdirectories(_dir: string): Promise<string[]> {
    return [];
  }

  async mkdir(_dir: string): Promise<void> {
    return;
  }

  async getModified(_path: string): Promise<Date | null> {
    return null;
  }
}

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}
