/**
 * Tests for `arete view` command.
 *
 * Uses dependency injection (ViewCommandDeps) to avoid real spawning or HTTP.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTmpDir, cleanupTmpDir, runCli } from '../helpers.js';
import { runView, type ViewCommandDeps } from '../../src/commands/view.js';

// ─── Fake child process ───────────────────────────────────────────────────────

type FakeChild = {
  stderr: EventEmitter & { pipe: (dest: unknown) => void };
  killed: string | null;
  kill: (signal: string) => void;
};

function makeFakeChild(): FakeChild {
  const child: FakeChild = {
    stderr: Object.assign(new EventEmitter(), { pipe: () => {} }),
    killed: null,
    kill(signal: string) {
      this.killed = signal;
    },
  };
  return child;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fetch mock that returns { ok: true } on the first call. */
function makeFetchOk(): typeof fetch {
  return (_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve({ ok: true } as Response);
}

/** Build a fetch mock that always fails (simulates server not ready). */
function makeFetchFail(): typeof fetch {
  return (_url: string | URL | Request, _init?: RequestInit) =>
    Promise.reject(new Error('connection refused'));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('view command — workspace-not-found', () => {
  let tmpDir: string;
  let exitCode: number | undefined;
  let originalExit: typeof process.exit;
  let stdoutOutput: string[];

  beforeEach(() => {
    // Non-workspace directory
    tmpDir = createTmpDir('arete-test-view-nowksp');
    originalExit = process.exit;
    exitCode = undefined;
    stdoutOutput = [];

    // Capture process.exit
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    // Capture console.log
    mock.method(console, 'log', (msg: string) => {
      stdoutOutput.push(msg);
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
  });

  it('exits 1 with text error when not in workspace', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await assert.rejects(
        () => runView({ json: false }, {}),
        /process\.exit\(1\)/,
      );
    } finally {
      process.chdir(origCwd);
    }
    assert.equal(exitCode, 1);
  });

  it('exits 1 with JSON error when --json and not in workspace', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await assert.rejects(
        () => runView({ json: true }, {}),
        /process\.exit\(1\)/,
      );
    } finally {
      process.chdir(origCwd);
    }
    assert.equal(exitCode, 1);
    const jsonOutput = stdoutOutput.find(s => s.includes('"success"'));
    assert.ok(jsonOutput, 'Expected JSON output on stdout');
    const parsed = JSON.parse(jsonOutput);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('workspace'), `Expected workspace error, got: ${parsed.error}`);
  });
});

describe('view command — all-ports-busy', () => {
  let tmpDir: string;
  let exitCode: number | undefined;
  let originalExit: typeof process.exit;
  let stdoutOutput: string[];

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-view-ports');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    originalExit = process.exit;
    exitCode = undefined;
    stdoutOutput = [];

    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    mock.method(console, 'log', (msg: string) => {
      stdoutOutput.push(msg);
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
  });

  it('exits 1 when all default ports are busy', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const deps: ViewCommandDeps = {
        isPortAvailableFn: async (_port: number) => false,
        spawnFn: (() => makeFakeChild()) as unknown as typeof import('child_process').spawn,
        fetchFn: makeFetchOk(),
        openBrowserFn: async (_url: string) => {},
      };
      await assert.rejects(() => runView({}, deps), /process\.exit\(1\)/);
    } finally {
      process.chdir(origCwd);
    }
    assert.equal(exitCode, 1);
  });

  it('emits JSON error when --json and all ports busy', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const deps: ViewCommandDeps = {
        isPortAvailableFn: async (_port: number) => false,
        spawnFn: (() => makeFakeChild()) as unknown as typeof import('child_process').spawn,
        fetchFn: makeFetchOk(),
        openBrowserFn: async (_url: string) => {},
      };
      await assert.rejects(() => runView({ json: true }, deps), /process\.exit\(1\)/);
    } finally {
      process.chdir(origCwd);
    }
    const jsonOutput = stdoutOutput.find(s => s.includes('"success"'));
    assert.ok(jsonOutput, 'Expected JSON output');
    const parsed = JSON.parse(jsonOutput);
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.includes('3847') || parsed.error.includes('busy'),
      `Expected ports-busy error, got: ${parsed.error}`,
    );
  });
});

describe('view command — server-start-success', () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;
  let infoOutput: string[];

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-view-success');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    originalExit = process.exit;
    infoOutput = [];

    // info() calls console.log(icon, msg) — capture all args joined to detect the message
    mock.method(console, 'log', (...args: unknown[]) => {
      infoOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    // Clean up any SIGINT listeners registered by runView so they don't bleed into later tests
    process.removeAllListeners('SIGINT');
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
  });

  it('spawns server, polls health, opens browser, and prints ready message', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    let browserOpened: string | null = null;
    let spawnCalled = false;
    const fakeChild = makeFakeChild();

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => {
        spawnCalled = true;
        return fakeChild;
      }) as unknown as typeof import('child_process').spawn,
      fetchFn: makeFetchOk(),
      openBrowserFn: async (url: string) => {
        browserOpened = url;
      },
    };

    // setInterval keeps process alive — override process.exit so test can finish
    const setIntervalOrig = globalThis.setInterval;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    globalThis.setInterval = ((fn: () => void, delay: number) => {
      intervalId = setIntervalOrig(fn, delay);
      return intervalId;
    }) as typeof setInterval;

    try {
      // runView never calls process.exit on success path, but setInterval keeps it alive.
      // We run it and then resolve via a race with a short timeout.
      await Promise.race([
        runView({}, deps),
        new Promise<void>(resolve => setTimeout(resolve, 200)),
      ]);
    } finally {
      process.chdir(origCwd);
      if (intervalId !== undefined) clearInterval(intervalId);
      globalThis.setInterval = setIntervalOrig;
    }

    assert.ok(spawnCalled, 'Expected spawn to be called');
    assert.equal(browserOpened, 'http://localhost:3847');
    // info() calls console.log(icon, msg) — infoOutput captures all args joined
    const readyMsg = infoOutput.find(s => s.includes('3847'));
    assert.ok(readyMsg, `Expected ready message with port 3847, got: ${JSON.stringify(infoOutput)}`);
  });
});

describe('view command — SIGINT cleanup', () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-view-sigint');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    originalExit = process.exit;
    exitCode = undefined;

    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    mock.method(console, 'log', () => {});
  });

  afterEach(() => {
    process.exit = originalExit;
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
    // Remove any SIGINT listeners added during the test
    process.removeAllListeners('SIGINT');
  });

  it('kills child process on SIGINT', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    const fakeChild = makeFakeChild();
    const setIntervalOrig = globalThis.setInterval;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    globalThis.setInterval = ((fn: () => void, delay: number) => {
      intervalId = setIntervalOrig(fn, delay);
      return intervalId;
    }) as typeof setInterval;

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      fetchFn: makeFetchOk(),
      openBrowserFn: async (_url: string) => {},
    };

    try {
      await Promise.race([
        runView({}, deps),
        new Promise<void>(resolve => setTimeout(resolve, 200)),
      ]);
    } finally {
      process.chdir(origCwd);
      if (intervalId !== undefined) clearInterval(intervalId);
      globalThis.setInterval = setIntervalOrig;
    }

    // Simulate SIGINT — should kill the child
    assert.throws(
      () => process.emit('SIGINT'),
      /process\.exit\(0\)/,
    );

    assert.equal(fakeChild.killed, 'SIGTERM', 'Expected child to be killed with SIGTERM');
    assert.equal(exitCode, 0);
  });
});
