/**
 * arete view — launch backend server and open workspace in browser
 */

import type { Command } from 'commander';
import type { ChildProcess, SpawnSyncReturns } from 'child_process';
import { spawn, spawnSync, exec } from 'child_process';
import { createServer } from 'net';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createServices, getPackageRoot, type StorageAdapter } from '@arete/core';
import { error, info, warn } from '../formatters.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ViewCommandDeps = {
  spawnFn?: typeof spawn;
  spawnSyncFn?: typeof spawnSync;
  openBrowserFn?: (url: string) => Promise<void>;
  fetchFn?: typeof fetch;
  isPortAvailableFn?: (port: number) => Promise<boolean>;
  existsSyncFn?: typeof existsSync;
  randomUUIDFn?: typeof randomUUID;
};

export type ViewCommandOpts = {
  port?: string;
  json?: boolean;
  path?: string;
  wait?: boolean;
  timeout?: string;
};

export type WaitResult = {
  approved?: Array<{ id: string; type: string }>;
  skipped?: Array<{ id: string; type: string }>;
  timedOut?: boolean;
};

export type SessionFile = {
  sessionId: string;
  createdAt: string;
  status: 'pending' | 'complete';
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function emitError(json: boolean | undefined, msg: string): void {
  if (json) {
    console.log(JSON.stringify({ success: false, error: msg }));
  } else {
    error(msg);
  }
}

const defaultOpenBrowser = (url: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const cmd =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
          ? `start "" "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd, err => (err ? reject(err) : resolve()));
  });

async function waitForServer(port: number, fetchFn: typeof fetch): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetchFn(`http://localhost:${port}/health`);
      if (res.ok) return true;
    } catch {
      /* server not ready yet */
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/**
 * Build the web app if dist doesn't exist.
 * Returns true if build succeeded or dist already exists, false on failure.
 */
export function ensureWebBuild(
  packageRoot: string,
  json: boolean | undefined,
  spawnSyncFn: typeof spawnSync = spawnSync,
  existsSyncFn: typeof existsSync = existsSync,
): boolean {
  const webDir = join(packageRoot, 'packages/apps/web');
  const webDist = join(webDir, 'dist/index.html');

  if (existsSyncFn(webDist)) {
    return true; // Already built
  }

  if (!json) {
    warn('Web UI not built. Building now (this may take a moment)...');
  }

  // Check if node_modules exists, run npm install if not
  const nodeModules = join(webDir, 'node_modules');
  if (!existsSyncFn(nodeModules)) {
    if (!json) {
      info('  Installing dependencies...');
    }
    const installResult: SpawnSyncReturns<Buffer> = spawnSyncFn('npm', ['install'], {
      cwd: webDir,
      stdio: json ? 'pipe' : 'inherit',
    });
    if (installResult.status !== 0) {
      error('Failed to install web dependencies');
      return false;
    }
  }

  // Run npm run build
  if (!json) {
    info('  Building web app...');
  }
  const buildResult: SpawnSyncReturns<Buffer> = spawnSyncFn('npm', ['run', 'build'], {
    cwd: webDir,
    stdio: json ? 'pipe' : 'inherit',
  });

  if (buildResult.status !== 0) {
    error('Failed to build web app');
    return false;
  }

  if (!json) {
    info('  Web app built successfully.\n');
  }

  return true;
}

// ─── Session Management ──────────────────────────────────────────────────────

export function getSessionPath(root: string, sessionId: string): string {
  return join(root, '.arete', `.review-session-${sessionId}`);
}

export function getCompletePath(root: string, sessionId: string): string {
  return join(root, '.arete', `.review-complete-${sessionId}`);
}

export async function createSession(
  storage: StorageAdapter,
  root: string,
  sessionId: string,
): Promise<SessionFile> {
  const session: SessionFile = {
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const sessionPath = getSessionPath(root, sessionId);
  await storage.write(sessionPath, JSON.stringify(session));
  return session;
}

export async function pollForCompletion(
  storage: StorageAdapter,
  root: string,
  sessionId: string,
  timeoutMs: number,
  pollIntervalMs: number = 500,
): Promise<WaitResult> {
  const completePath = getCompletePath(root, sessionId);
  const sessionPath = getSessionPath(root, sessionId);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const content = await storage.read(completePath);
    if (content) {
      // Parse result
      const result = JSON.parse(content) as WaitResult;

      // Cleanup: delete both session and complete files
      await storage.delete(sessionPath);
      await storage.delete(completePath);

      return result;
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  // Timeout — cleanup session file only (complete file doesn't exist)
  await storage.delete(sessionPath);
  return { timedOut: true };
}

// ─── Core Implementation (injectable for tests) ───────────────────────────────

export async function runView(
  opts: ViewCommandOpts,
  deps: ViewCommandDeps = {},
): Promise<WaitResult | void> {
  const {
    spawnFn = spawn,
    spawnSyncFn = spawnSync,
    openBrowserFn = defaultOpenBrowser,
    fetchFn = fetch,
    isPortAvailableFn = isPortAvailable,
    existsSyncFn = existsSync,
    randomUUIDFn = randomUUID,
  } = deps;

  // 1. Resolve workspace root
  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();

  if (!root) {
    emitError(opts.json, 'Not in an Areté workspace');
    if (!opts.json) {
      info('Navigate to your workspace directory and try again.');
    }
    process.exit(1);
  }

  // 2. Resolve port
  const explicitPort = opts.port ?? process.env['PORT'];
  let port: number;

  if (explicitPort) {
    const p = parseInt(explicitPort, 10);
    if (isNaN(p) || p < 1 || p > 65535) {
      emitError(opts.json, `Invalid port: ${explicitPort}`);
      process.exit(1);
    }
    const available = await isPortAvailableFn(p);
    if (!available) {
      emitError(opts.json, `Port ${p} is already in use`);
      process.exit(1);
    }
    port = p;
  } else {
    const defaults = [3847, 3848, 3849];
    let found: number | null = null;
    for (const p of defaults) {
      if (await isPortAvailableFn(p)) {
        found = p;
        break;
      }
    }
    if (found === null) {
      emitError(
        opts.json,
        'All default ports (3847, 3848, 3849) are busy. Use --port to specify one.',
      );
      process.exit(1);
    }
    port = found;
  }

  // 3. Ensure web app is built
  const packageRoot = getPackageRoot();
  const webBuilt = ensureWebBuild(packageRoot, opts.json, spawnSyncFn, existsSyncFn);
  if (!webBuilt) {
    emitError(opts.json, 'Failed to build web app. Run manually: cd packages/apps/web && npm install && npm run build');
    process.exit(1);
  }

  // 4. Spawn backend server
  const backendDist = join(packageRoot, 'packages/apps/backend/dist/index.js');
  const backendSrc = join(packageRoot, 'packages/apps/backend/src/index.ts');
  const useTs = !existsSyncFn(backendDist);
  const [cmd, args] = useTs ? ['tsx', [backendSrc]] : ['node', [backendDist]];

  const child: ChildProcess = spawnFn(cmd, args, {
    env: { ...process.env, ARETE_WORKSPACE: root, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr?.pipe(process.stderr);

  // 5. SIGINT handler — clean up child process
  process.on('SIGINT', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });

  // 6. Wait for server to be ready (max 5s)
  const ready = await waitForServer(port, fetchFn);

  if (!ready) {
    child.kill('SIGTERM');
    emitError(opts.json, `Server did not start within 5 seconds on port ${port}`);
    process.exit(1);
  }

  // 7. Build URL (with optional --path)
  const baseUrl = `http://localhost:${port}`;
  let url = opts.path ? `${baseUrl}${opts.path}` : baseUrl;

  // 8. Handle --wait mode
  if (opts.wait) {
    const sessionId = randomUUIDFn();
    await createSession(services.storage, root, sessionId);

    // Append sessionId as query parameter
    const separator = url.includes('?') ? '&' : '?';
    const urlWithSession = `${url}${separator}session=${sessionId}`;

    try {
      await openBrowserFn(urlWithSession);
    } catch {
      // Non-fatal — user can open manually
    }

    if (!opts.json) {
      info(`\nWaiting for review to complete...`);
      info(`Session: ${sessionId}`);
    }

    // Poll for completion
    const timeoutSec = parseInt(opts.timeout ?? '300', 10);
    const timeoutMs = timeoutSec * 1000;
    const result = await pollForCompletion(services.storage, root, sessionId, timeoutMs);

    // Kill the server
    child.kill('SIGTERM');

    if (opts.json) {
      console.log(JSON.stringify(result));
    } else if (result.timedOut) {
      warn('Review timed out');
    } else {
      const approvedCount = result.approved?.length ?? 0;
      const skippedCount = result.skipped?.length ?? 0;
      info(`Review complete: ${approvedCount} approved, ${skippedCount} skipped`);
    }

    return result;
  }

  // 9. Non-wait mode: Open browser
  try {
    await openBrowserFn(url);
  } catch {
    // Non-fatal — user can open manually
  }

  // 10. Print ready message
  info(`\nAreté workspace open at ${url}`);
  info('Press Ctrl+C to stop.\n');

  // Keep the process alive
  setInterval(() => {}, 1000 * 60 * 60);
}

// ─── Command Registration ─────────────────────────────────────────────────────

export function registerViewCommand(program: Command, deps: ViewCommandDeps = {}): void {
  program
    .command('view')
    .description('Open the Areté workspace in the browser (meeting triage UI)')
    .option('--port <port>', 'Port to run the server on')
    .option('--json', 'Output as JSON')
    .option('--path <route>', 'Open browser to a specific route (e.g., /review)')
    .option('--wait', 'Block until the UI session completes')
    .option('--timeout <seconds>', 'Timeout for --wait mode (default: 300)', '300')
    .action(async (opts: ViewCommandOpts) => {
      await runView(opts, deps);
    });
}
