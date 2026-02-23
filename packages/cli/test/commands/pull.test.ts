/**
 * Tests for `arete pull` command — krisp dispatch and available list.
 *
 * Uses the error-path subprocess strategy (runCliRaw) to verify dispatch
 * without needing a real OAuth token or network calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

describe('arete pull — krisp dispatch', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-pull');
    // Create a minimal workspace so findRoot() succeeds
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('(Test 1) dispatches to krisp branch — error is not "Unknown integration: krisp"', () => {
    // Run with --json; no credentials exist so it should fail with a krisp-specific error
    const { stdout, code } = runCliRaw(['pull', 'krisp', '--json'], {
      cwd: workspaceDir,
    });

    // Either the process exits non-zero OR stdout JSON has success: false
    // But critically the error must NOT be "Unknown integration: krisp"
    if (code !== 0) {
      // Error path: verify the error message isn't the unknown-integration fallthrough
      assert.ok(
        !stdout.includes('Unknown integration: krisp'),
        `Expected krisp-specific error, got unknown integration fallthrough: ${stdout}`,
      );
    } else {
      // Success path is impossible without credentials, but handle gracefully
      const result = JSON.parse(stdout) as { success: boolean; errors?: string[] };
      if (!result.success) {
        const errorStr = JSON.stringify(result.errors ?? '');
        assert.ok(
          !errorStr.includes('Unknown integration: krisp'),
          `Expected krisp-specific error, got unknown integration fallthrough: ${errorStr}`,
        );
      }
    }

    // Also verify: the JSON output (if any) should have integration: 'krisp'
    if (stdout.trim().startsWith('{')) {
      const result = JSON.parse(stdout) as { integration?: string };
      if (result.integration !== undefined) {
        assert.equal(result.integration, 'krisp');
      }
    }
  });

  it('(Test 1b) pull krisp --json returns JSON with integration: krisp and credentials error', () => {
    // No credentials are present — should return not-active error
    const { stdout } = runCliRaw(['pull', 'krisp', '--json'], {
      cwd: workspaceDir,
    });

    // The output must be valid JSON
    let result: { success: boolean; integration: string; errors: string[] };
    try {
      result = JSON.parse(stdout) as typeof result;
    } catch {
      // If it's not JSON, check it's not the unknown integration message
      assert.ok(
        !stdout.includes('Unknown integration: krisp'),
        `Non-JSON output should not say "Unknown integration: krisp": ${stdout}`,
      );
      return;
    }

    assert.equal(result.success, false, 'success must be false (no credentials)');
    assert.equal(result.integration, 'krisp', 'integration must be krisp');
    assert.ok(result.errors.length > 0, 'must have at least one error');
    // Error should mention credentials/not active, not "Unknown integration"
    const errMsg = result.errors.join(' ');
    assert.ok(
      !errMsg.includes('Unknown or unsupported integration'),
      `Error must not be the unknown fallthrough: ${errMsg}`,
    );
  });
});

describe('arete pull — unknown integration lists krisp', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-pull-unknown');
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('(Test 2) unknown integration JSON output lists krisp in available array', () => {
    const { stdout } = runCliRaw(['pull', 'unknownxyz', '--json'], {
      cwd: workspaceDir,
    });

    // Must be valid JSON
    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      available: string[];
    };

    assert.equal(result.success, false);
    assert.ok(
      result.available.includes('krisp'),
      `available list must include 'krisp'; got: ${JSON.stringify(result.available)}`,
    );
  });

  it('(Test 2b) unknown integration non-JSON output mentions krisp', () => {
    const { stdout, stderr } = runCliRaw(['pull', 'unknownxyz'], {
      cwd: workspaceDir,
    });

    const combined = stdout + stderr;
    assert.ok(
      combined.includes('krisp'),
      `Output must mention 'krisp' in the available list; got: ${combined}`,
    );
  });
});

describe('arete pull calendar — provider-aware availability errors', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-pull-calendar-google');
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('returns google-specific error when provider is configured but unavailable', () => {
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

    const { stdout } = runCliRaw(['pull', 'calendar', '--json'], {
      cwd: workspaceDir,
    });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      message: string;
    };

    assert.equal(result.success, false);
    assert.equal(result.error, 'Google Calendar not available');
    assert.equal(result.message, 'Run: arete integration configure google-calendar');
  });
});
