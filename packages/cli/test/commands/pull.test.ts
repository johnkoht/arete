/**
 * Tests for `arete pull` command.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { QmdRefreshResult } from '@arete/core';
import { pullNotion } from '../../src/commands/pull.js';
import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

describe('arete pull — krisp dispatch', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-pull');
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('(Test 1) dispatches to krisp branch — error is not "Unknown integration: krisp"', () => {
    const { stdout, code } = runCliRaw(['pull', 'krisp', '--json'], {
      cwd: workspaceDir,
    });

    if (code !== 0) {
      assert.ok(
        !stdout.includes('Unknown integration: krisp'),
        `Expected krisp-specific error, got unknown integration fallthrough: ${stdout}`,
      );
    } else {
      const result = JSON.parse(stdout) as { success: boolean; errors?: string[] };
      if (!result.success) {
        const errorStr = JSON.stringify(result.errors ?? '');
        assert.ok(
          !errorStr.includes('Unknown integration: krisp'),
          `Expected krisp-specific error, got unknown integration fallthrough: ${errorStr}`,
        );
      }
    }

    if (stdout.trim().startsWith('{')) {
      const result = JSON.parse(stdout) as { integration?: string };
      if (result.integration !== undefined) {
        assert.equal(result.integration, 'krisp');
      }
    }
  });

  it('(Test 1b) pull krisp --json returns JSON with integration: krisp and credentials error', () => {
    const { stdout } = runCliRaw(['pull', 'krisp', '--json'], {
      cwd: workspaceDir,
    });

    let result: { success: boolean; integration: string; errors: string[] };
    try {
      result = JSON.parse(stdout) as typeof result;
    } catch {
      assert.ok(
        !stdout.includes('Unknown integration: krisp'),
        `Non-JSON output should not say "Unknown integration: krisp": ${stdout}`,
      );
      return;
    }

    assert.equal(result.success, false, 'success must be false (no credentials)');
    assert.equal(result.integration, 'krisp', 'integration must be krisp');
    assert.ok(result.errors.length > 0, 'must have at least one error');
    const errMsg = result.errors.join(' ');
    assert.ok(
      !errMsg.includes('Unknown or unsupported integration'),
      `Error must not be the unknown fallthrough: ${errMsg}`,
    );
  });
});

// NOTE: CLI-level tests for notion pull with HTTP server caused test runner hangs.
// The pullNotion helper is tested thoroughly in the 'arete pull — notion helper' describe block below,
// which verifies: page forwarding, destination override, dry-run output, JSON output, and QMD refresh behavior.

describe('arete pull — notion helper', () => {
  it('single page pull calls integrations.pull with pages and destination', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 1,
        itemsCreated: 1,
        itemsUpdated: 0,
        errors: [],
      },
    });

    const output = await captureConsole(async () => {
      await pullNotion(services, '/workspace', {
        pages: ['https://notion.so/page-1'],
        destination: 'resources/notes',
        dryRun: false,
        skipQmd: true,
        json: true,
      });
    });

    assert.equal(services.lastPullCall?.integration, 'notion');
    assert.deepEqual(services.lastPullCall?.options.pages, ['https://notion.so/page-1']);
    assert.equal(services.lastPullCall?.options.destination, '/workspace/resources/notes');

    const result = JSON.parse(output.stdout) as { success: boolean; itemsCreated: number };
    assert.equal(result.success, true);
    assert.equal(result.itemsCreated, 1);
  });

  it('multi page pull forwards repeated pages', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 2,
        itemsCreated: 2,
        itemsUpdated: 0,
        errors: [],
      },
    });

    await captureConsole(async () => {
      await pullNotion(services, '/workspace', {
        pages: ['page-a', 'page-b'],
        destination: 'resources/notes',
        dryRun: false,
        skipQmd: true,
        json: true,
      });
    });

    assert.deepEqual(services.lastPullCall?.options.pages, ['page-a', 'page-b']);
  });

  it('dry-run prints markdown and does not save to destination', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 1,
        itemsCreated: 1,
        itemsUpdated: 0,
        errors: [],
      },
      dryRunFiles: [{ path: '/tmp/dry-run/page.md', content: '---\ntitle: Test\n---\n\nBody from dry run' }],
    });

    const output = await captureConsole(async () => {
      await pullNotion(services, '/workspace', {
        pages: ['page-a'],
        destination: 'resources/notes',
        dryRun: true,
        skipQmd: true,
        json: false,
      });
    });

    assert.ok(output.stdout.includes('Notion Pull (dry-run)'));
    assert.ok(output.stdout.includes('Body from dry run'));
    assert.ok(!output.stdout.includes('/workspace/resources/notes'));
    assert.equal(services.deletedPaths.length, 1, 'temporary dry-run directory should be deleted');
  });

  it('dry-run JSON output includes preview markdown', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 1,
        itemsCreated: 1,
        itemsUpdated: 0,
        errors: [],
      },
      dryRunFiles: [{ path: '/tmp/dry-run/page.md', content: '---\ntitle: Test\n---\n\nPreview body' }],
    });

    const output = await captureConsole(async () => {
      await pullNotion(services, '/workspace', {
        pages: ['page-a'],
        destination: 'resources/notes',
        dryRun: true,
        skipQmd: true,
        json: true,
      });
    });

    const result = JSON.parse(output.stdout) as {
      success: boolean;
      dryRun: boolean;
      previews: Array<{ markdown: string }>;
    };

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.previews.length, 1);
    assert.ok(result.previews[0].markdown.includes('Preview body'));
  });

  it('refreshes qmd when itemsCreated > 0 and skipQmd is false', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 1,
        itemsCreated: 1,
        itemsUpdated: 0,
        errors: [],
      },
    });

    const calls: Array<{ root: string; collection?: string }> = [];

    await captureConsole(async () => {
      await pullNotion(
        services,
        '/workspace',
        {
          pages: ['page-a'],
          destination: 'resources/notes',
          dryRun: false,
          skipQmd: false,
          json: true,
        },
        {
          loadConfigFn: async () => ({ qmd_collection: 'workspace-collection' }),
          refreshQmdIndexFn: async (root, collectionName) => {
            calls.push({ root, collection: collectionName });
            return { indexed: true, skipped: false };
          },
        },
      );
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { root: '/workspace', collection: 'workspace-collection' });
  });

  it('skips qmd refresh when --skip-qmd is set', async () => {
    const services = createMockServices({
      pullResult: {
        integration: 'notion',
        itemsProcessed: 1,
        itemsCreated: 1,
        itemsUpdated: 0,
        errors: [],
      },
    });

    let refreshCalled = false;

    await captureConsole(async () => {
      await pullNotion(
        services,
        '/workspace',
        {
          pages: ['page-a'],
          destination: 'resources/notes',
          dryRun: false,
          skipQmd: true,
          json: true,
        },
        {
          loadConfigFn: async () => ({ qmd_collection: 'workspace-collection' }),
          refreshQmdIndexFn: async (): Promise<QmdRefreshResult> => {
            refreshCalled = true;
            return { indexed: true, skipped: false };
          },
        },
      );
    });

    assert.equal(refreshCalled, false);
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

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      available: string[];
    };

    assert.equal(result.success, false);
    assert.ok(result.available.includes('krisp'));
    assert.ok(result.available.includes('notion'));
  });

  it('(Test 2b) unknown integration non-JSON output mentions krisp', () => {
    const { stdout, stderr } = runCliRaw(['pull', 'unknownxyz'], {
      cwd: workspaceDir,
    });

    const combined = stdout + stderr;
    assert.ok(combined.includes('krisp'));
    assert.ok(combined.includes('notion'));
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

type PullResult = {
  integration: string;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  errors: string[];
};

function createMockServices(input: {
  pullResult: PullResult;
  dryRunFiles?: Array<{ path: string; content: string }>;
}): Awaited<ReturnType<typeof import('@arete/core').createServices>> & {
  lastPullCall: { workspaceRoot: string; integration: string; options: Record<string, unknown> } | null;
  deletedPaths: string[];
} {
  const files = new Map<string, string>();
  for (const file of input.dryRunFiles ?? []) {
    files.set(file.path, file.content);
  }

  const deletedPaths: string[] = [];
  let lastPullCall: { workspaceRoot: string; integration: string; options: Record<string, unknown> } | null = null;

  const services = {
    integrations: {
      pull: async (workspaceRoot: string, integration: string, options: Record<string, unknown>) => {
        lastPullCall = { workspaceRoot, integration, options };
        return input.pullResult;
      },
    },
    storage: {
      read: async (path: string) => files.get(path) ?? null,
      write: async () => undefined,
      exists: async () => false,
      delete: async (path: string) => {
        deletedPaths.push(path);
      },
      list: async () => Array.from(files.keys()),
      listSubdirectories: async () => [],
      mkdir: async () => undefined,
      getModified: async () => null,
    },
    get lastPullCall() {
      return lastPullCall;
    },
    deletedPaths,
  };

  return services as unknown as Awaited<ReturnType<typeof import('@arete/core').createServices>> & {
    lastPullCall: { workspaceRoot: string; integration: string; options: Record<string, unknown> } | null;
    deletedPaths: string[];
  };
}

async function captureConsole(task: () => Promise<void>): Promise<{ stdout: string }> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    await task();
    return { stdout: logs.join('\n') };
  } finally {
    console.log = originalLog;
  }
}
