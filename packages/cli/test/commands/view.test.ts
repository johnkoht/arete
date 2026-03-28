/**
 * Tests for `arete view` command.
 *
 * Uses dependency injection (ViewCommandDeps) to avoid real spawning or HTTP.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { SpawnSyncReturns } from 'node:child_process';
import { createTmpDir, cleanupTmpDir, runCli } from '../helpers.js';
import {
  runView,
  ensureWebBuild,
  createSession,
  pollForCompletion,
  getSessionPath,
  getCompletePath,
  type ViewCommandDeps,
  type WaitResult,
  type SessionFile,
} from '../../src/commands/view.js';
import type { StorageAdapter } from '@arete/core';

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

/** Mock spawnSync that always returns success. */
function makeSpawnSyncOk(): typeof import('child_process').spawnSync {
  return ((_cmd: string, _args?: readonly string[]) => ({
    status: 0,
    signal: null,
    output: [],
    pid: 0,
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
  })) as unknown as typeof import('child_process').spawnSync;
}

/** Mock existsSync that returns true for specified paths. */
function makeExistsSyncFor(
  existingPaths: string[],
): typeof import('fs').existsSync {
  return ((path: string) => existingPaths.some(p => path.includes(p))) as typeof import('fs').existsSync;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ensureWebBuild', () => {
  it('returns true when dist/index.html already exists', () => {
    const existsSyncFn = makeExistsSyncFor(['dist/index.html']);
    const spawnSyncFn = makeSpawnSyncOk();

    const result = ensureWebBuild('/fake/root', false, spawnSyncFn, existsSyncFn);

    assert.equal(result, true);
  });

  it('runs npm install + npm run build when dist does not exist', () => {
    const calls: string[][] = [];
    const spawnSyncFn = ((_cmd: string, args?: readonly string[]) => {
      calls.push([_cmd, ...(args ?? [])]);
      return { status: 0 } as SpawnSyncReturns<Buffer>;
    }) as unknown as typeof import('child_process').spawnSync;

    // First call: no dist. After build: dist exists.
    let buildRan = false;
    const existsSyncFn = ((path: string) => {
      if (path.includes('dist/index.html')) return buildRan;
      if (path.includes('node_modules')) return false; // trigger npm install
      return false;
    }) as typeof import('fs').existsSync;

    // Simulate build creating dist
    const wrappedSpawnSync = ((cmd: string, args?: readonly string[]) => {
      const result = spawnSyncFn(cmd, args);
      if (args?.includes('build')) buildRan = true;
      return result;
    }) as unknown as typeof import('child_process').spawnSync;

    const result = ensureWebBuild('/fake/root', false, wrappedSpawnSync, existsSyncFn);

    assert.equal(result, true);
    assert.ok(calls.some(c => c.includes('install')), 'Expected npm install to be called');
    assert.ok(calls.some(c => c.includes('build')), 'Expected npm run build to be called');
  });

  it('skips npm install when node_modules exists', () => {
    const calls: string[][] = [];
    const spawnSyncFn = ((_cmd: string, args?: readonly string[]) => {
      calls.push([_cmd, ...(args ?? [])]);
      return { status: 0 } as SpawnSyncReturns<Buffer>;
    }) as unknown as typeof import('child_process').spawnSync;

    const existsSyncFn = ((path: string) => {
      if (path.includes('dist/index.html')) return false;
      if (path.includes('node_modules')) return true; // node_modules exists
      return false;
    }) as typeof import('fs').existsSync;

    ensureWebBuild('/fake/root', false, spawnSyncFn, existsSyncFn);

    assert.ok(!calls.some(c => c.includes('install')), 'Should not run npm install');
    assert.ok(calls.some(c => c.includes('build')), 'Should run npm run build');
  });

  it('returns false when npm install fails', () => {
    const spawnSyncFn = ((_cmd: string, args?: readonly string[]) => {
      if (args?.includes('install')) return { status: 1 } as SpawnSyncReturns<Buffer>;
      return { status: 0 } as SpawnSyncReturns<Buffer>;
    }) as unknown as typeof import('child_process').spawnSync;

    const existsSyncFn = ((path: string) => {
      if (path.includes('node_modules')) return false;
      return false;
    }) as typeof import('fs').existsSync;

    const result = ensureWebBuild('/fake/root', false, spawnSyncFn, existsSyncFn);

    assert.equal(result, false);
  });

  it('returns false when npm run build fails', () => {
    const spawnSyncFn = ((_cmd: string, args?: readonly string[]) => {
      if (args?.includes('build')) return { status: 1 } as SpawnSyncReturns<Buffer>;
      return { status: 0 } as SpawnSyncReturns<Buffer>;
    }) as unknown as typeof import('child_process').spawnSync;

    const existsSyncFn = ((path: string) => {
      if (path.includes('node_modules')) return true;
      return false;
    }) as typeof import('fs').existsSync;

    const result = ensureWebBuild('/fake/root', false, spawnSyncFn, existsSyncFn);

    assert.equal(result, false);
  });
});

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
        spawnSyncFn: makeSpawnSyncOk(),
        existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
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
        spawnSyncFn: makeSpawnSyncOk(),
        existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
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
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
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
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
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

// ─── Session Management Tests ─────────────────────────────────────────────────

describe('session management — path helpers', () => {
  it('getSessionPath returns correct path', () => {
    const sessionId = 'abc-123-def-456';
    const path = getSessionPath('/home/user/workspace', sessionId);
    assert.equal(path, '/home/user/workspace/.arete/.review-session-abc-123-def-456');
  });

  it('getCompletePath returns correct path', () => {
    const sessionId = 'abc-123-def-456';
    const path = getCompletePath('/home/user/workspace', sessionId);
    assert.equal(path, '/home/user/workspace/.arete/.review-complete-abc-123-def-456');
  });
});

describe('session management — createSession', () => {
  it('creates session file with correct format', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockStorage: StorageAdapter = {
      read: async () => null,
      write: async (path, content) => {
        writtenFiles[path] = content;
      },
      exists: async () => false,
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };

    const sessionId = 'test-uuid-123';
    const root = '/workspace';
    const result = await createSession(mockStorage, root, sessionId);

    // Verify returned session
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.status, 'pending');
    assert.ok(result.createdAt, 'Expected createdAt to be set');

    // Verify file was written
    const expectedPath = getSessionPath(root, sessionId);
    assert.ok(writtenFiles[expectedPath], 'Expected session file to be written');

    const written = JSON.parse(writtenFiles[expectedPath]) as SessionFile;
    assert.equal(written.sessionId, sessionId);
    assert.equal(written.status, 'pending');
  });
});

describe('session management — pollForCompletion', () => {
  it('returns result when completion file exists', async () => {
    const sessionId = 'test-session';
    const root = '/workspace';
    const completePath = getCompletePath(root, sessionId);
    const sessionPath = getSessionPath(root, sessionId);

    const expectedResult: WaitResult = {
      approved: [{ id: 'item-1', type: 'decision' }],
      skipped: [{ id: 'item-2', type: 'learning' }],
    };

    const deletedFiles: string[] = [];
    const mockStorage: StorageAdapter = {
      read: async (path) => {
        if (path === completePath) {
          return JSON.stringify(expectedResult);
        }
        return null;
      },
      write: async () => {},
      exists: async () => true,
      delete: async (path) => {
        deletedFiles.push(path);
      },
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };

    const result = await pollForCompletion(mockStorage, root, sessionId, 5000, 10);

    assert.deepEqual(result, expectedResult);
    assert.ok(deletedFiles.includes(sessionPath), 'Expected session file to be deleted');
    assert.ok(deletedFiles.includes(completePath), 'Expected complete file to be deleted');
  });

  it('returns timedOut when no completion file within timeout', async () => {
    const sessionId = 'test-session';
    const root = '/workspace';
    const sessionPath = getSessionPath(root, sessionId);

    const deletedFiles: string[] = [];
    const mockStorage: StorageAdapter = {
      read: async () => null, // No completion file
      write: async () => {},
      exists: async () => true,
      delete: async (path) => {
        deletedFiles.push(path);
      },
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };

    // Use short timeout and poll interval for fast test
    const result = await pollForCompletion(mockStorage, root, sessionId, 50, 10);

    assert.deepEqual(result, { timedOut: true });
    assert.ok(deletedFiles.includes(sessionPath), 'Expected session file to be deleted on timeout');
  });

  it('polls multiple times before completion', async () => {
    const sessionId = 'test-session';
    const root = '/workspace';
    const completePath = getCompletePath(root, sessionId);

    let readCount = 0;
    const mockStorage: StorageAdapter = {
      read: async (path) => {
        if (path === completePath) {
          readCount++;
          // Return result on 3rd read
          if (readCount >= 3) {
            return JSON.stringify({ approved: [], skipped: [] });
          }
        }
        return null;
      },
      write: async () => {},
      exists: async () => true,
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };

    const result = await pollForCompletion(mockStorage, root, sessionId, 5000, 10);

    assert.equal(readCount, 3, 'Expected 3 poll attempts before completion');
    assert.ok(!result.timedOut, 'Should not have timed out');
  });
});

// ─── --path flag tests ────────────────────────────────────────────────────────

describe('view command — --path flag', () => {
  let tmpDir: string;
  let infoOutput: string[];

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-view-path');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    infoOutput = [];

    mock.method(console, 'log', (...args: unknown[]) => {
      infoOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    process.removeAllListeners('SIGINT');
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
  });

  it('appends --path to browser URL', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    let browserOpened: string | null = null;
    const fakeChild = makeFakeChild();

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async (url: string) => {
        browserOpened = url;
      },
    };

    const setIntervalOrig = globalThis.setInterval;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    globalThis.setInterval = ((fn: () => void, delay: number) => {
      intervalId = setIntervalOrig(fn, delay);
      return intervalId;
    }) as typeof setInterval;

    try {
      await Promise.race([
        runView({ path: '/review' }, deps),
        new Promise<void>(resolve => setTimeout(resolve, 200)),
      ]);
    } finally {
      process.chdir(origCwd);
      if (intervalId !== undefined) clearInterval(intervalId);
      globalThis.setInterval = setIntervalOrig;
    }

    assert.equal(browserOpened, 'http://localhost:3847/review');
  });
});

// ─── --wait mode tests ────────────────────────────────────────────────────────

describe('view command — --wait mode', () => {
  let tmpDir: string;
  let stdoutOutput: string[];

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-view-wait');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    stdoutOutput = [];

    mock.method(console, 'log', (...args: unknown[]) => {
      stdoutOutput.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    process.removeAllListeners('SIGINT');
    cleanupTmpDir(tmpDir);
    mock.restoreAll();
  });

  it('includes sessionId in URL when --wait is used', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    let browserOpened: string | null = null;
    const fakeChild = makeFakeChild();
    const testSessionId = 'test-session-12345';

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async (url: string) => {
        browserOpened = url;
      },
      randomUUIDFn: () => testSessionId,
    };

    try {
      // Short timeout to make test fast
      await runView({ wait: true, timeout: '0' }, deps);
    } finally {
      process.chdir(origCwd);
    }

    assert.ok(browserOpened?.includes('session=test-session-12345'), `Expected sessionId in URL, got: ${browserOpened}`);
  });

  it('returns JSON result with --json --wait on completion', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    const fakeChild = makeFakeChild();
    const testSessionId = 'test-session-json';
    const completionResult: WaitResult = {
      approved: [{ id: 'dec-1', type: 'decision' }],
      skipped: [],
    };

    // We need to simulate the completion file being written
    // by having the storage return the completion result
    let pollCount = 0;

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async () => {},
      randomUUIDFn: () => testSessionId,
    };

    // We need to patch the storage used by runView
    // Since we can't inject storage, we'll write the completion file manually
    // before the poll starts
    const { writeFileSync, mkdirSync, unlinkSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const areteDir = join(tmpDir, '.arete');
    mkdirSync(areteDir, { recursive: true });
    const completePath = join(areteDir, `.review-complete-${testSessionId}`);
    writeFileSync(completePath, JSON.stringify(completionResult));

    try {
      const result = await runView({ wait: true, json: true, timeout: '5' }, deps);

      // Check that result was returned
      assert.deepEqual(result, completionResult);

      // Check JSON was output
      const jsonOutput = stdoutOutput.find(s => s.includes('"approved"'));
      assert.ok(jsonOutput, 'Expected JSON output');
      const parsed = JSON.parse(jsonOutput);
      assert.deepEqual(parsed, completionResult);
    } finally {
      process.chdir(origCwd);
      // Cleanup (files should be auto-deleted but just in case)
      try { unlinkSync(completePath); } catch {}
    }
  });

  it('returns timedOut with --json --wait on timeout', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    const fakeChild = makeFakeChild();
    const testSessionId = 'test-session-timeout';

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async () => {},
      randomUUIDFn: () => testSessionId,
    };

    try {
      // Very short timeout (0 seconds = immediate timeout)
      const result = await runView({ wait: true, json: true, timeout: '0' }, deps);

      assert.deepEqual(result, { timedOut: true });

      // Check JSON was output
      const jsonOutput = stdoutOutput.find(s => s.includes('timedOut'));
      assert.ok(jsonOutput, 'Expected JSON output with timedOut');
      const parsed = JSON.parse(jsonOutput);
      assert.equal(parsed.timedOut, true);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('kills server after --wait completes', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    const fakeChild = makeFakeChild();
    const testSessionId = 'test-session-kill';

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async () => {},
      randomUUIDFn: () => testSessionId,
    };

    try {
      // Use timeout=0 to immediately timeout
      await runView({ wait: true, timeout: '0' }, deps);

      // Verify child was killed
      assert.equal(fakeChild.killed, 'SIGTERM', 'Expected server to be killed after --wait completes');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('combines --path and --wait correctly', async () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);

    let browserOpened: string | null = null;
    const fakeChild = makeFakeChild();
    const testSessionId = 'test-session-path-wait';

    const deps: ViewCommandDeps = {
      isPortAvailableFn: async (port: number) => port === 3847,
      spawnFn: ((_cmd: string, _args: string[], _opts: unknown) => fakeChild) as unknown as typeof import('child_process').spawn,
      spawnSyncFn: makeSpawnSyncOk(),
      existsSyncFn: makeExistsSyncFor(['dist/index.html', 'dist/index.js']),
      fetchFn: makeFetchOk(),
      openBrowserFn: async (url: string) => {
        browserOpened = url;
      },
      randomUUIDFn: () => testSessionId,
    };

    try {
      await runView({ path: '/review', wait: true, timeout: '0' }, deps);
    } finally {
      process.chdir(origCwd);
    }

    // Should have path and sessionId
    assert.ok(browserOpened?.includes('/review'), `Expected /review in URL, got: ${browserOpened}`);
    assert.ok(browserOpened?.includes('session='), `Expected sessionId in URL, got: ${browserOpened}`);
    // URL should be /review?session=...
    assert.ok(browserOpened?.startsWith('http://localhost:3847/review?session='), `Expected correct URL format, got: ${browserOpened}`);
  });
});
