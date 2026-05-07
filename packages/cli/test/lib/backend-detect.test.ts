/**
 * Phase 3.5 E1 — backend running-state detection.
 *
 * Tests cover:
 * - PID file detection (alive process, dead process, missing file).
 * - Port probe (open port, no port).
 * - formatBackendWarning shape.
 *
 * The PID-alive path uses the running test process's own PID (always
 * alive). The port-probe path uses a real ephemeral listener.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type AddressInfo } from 'node:net';
import {
  detectRunningBackend,
  formatBackendWarning,
} from '../../src/lib/backend-detect.js';

describe('detectRunningBackend — PID file path', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'phase-3-5-backend-detect-'));
    mkdirSync(join(root, '.arete', 'runtime'), { recursive: true });
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('detects running when PID file points at an alive process', async () => {
    writeFileSync(
      join(root, '.arete', 'runtime', 'backend.pid'),
      String(process.pid),
      'utf8',
    );
    const result = await detectRunningBackend(root, { ports: [], timeoutMs: 50 });
    assert.strictEqual(result.running, true);
    assert.strictEqual(result.source, 'pid');
    assert.strictEqual(result.pid, process.pid);
  });

  it('falls through when PID file points at a dead PID', async () => {
    // PID 1 is `init`/launchd — alive on every Unix; instead use a
    // sentinel impossibly-high PID we know isn't alive.
    writeFileSync(
      join(root, '.arete', 'runtime', 'backend.pid'),
      '9999999',
      'utf8',
    );
    const result = await detectRunningBackend(root, { ports: [], timeoutMs: 50 });
    assert.strictEqual(result.running, false);
    assert.strictEqual(result.source, 'none');
  });

  it('returns not-running when no PID file and no ports respond', async () => {
    const result = await detectRunningBackend(root, { ports: [55001], timeoutMs: 100 });
    assert.strictEqual(result.running, false);
  });
});

describe('detectRunningBackend — port probe path', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'phase-3-5-backend-detect-'));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('detects running when a TCP listener is on a probed port', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const port = address.port;
    try {
      const result = await detectRunningBackend(root, {
        ports: [port],
        timeoutMs: 250,
      });
      assert.strictEqual(result.running, true);
      assert.strictEqual(result.source, 'port');
      assert.strictEqual(result.port, port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns not-running when probe times out / connection refused', async () => {
    const result = await detectRunningBackend(root, {
      // Port 1 is privileged and rarely listening; reliably refused.
      ports: [1],
      timeoutMs: 50,
    });
    assert.strictEqual(result.running, false);
  });
});

describe('formatBackendWarning', () => {
  it('formats PID-source warning', () => {
    const msg = formatBackendWarning({ running: true, source: 'pid', pid: 4242 });
    assert.match(msg, /pid 4242/);
    assert.match(msg, /restart it/);
    assert.match(msg, /silently bypass/);
  });

  it('formats port-source warning', () => {
    const msg = formatBackendWarning({ running: true, source: 'port', port: 3847 });
    assert.match(msg, /port 3847/);
  });

  it('returns empty string when not running', () => {
    const msg = formatBackendWarning({ running: false, source: 'none' });
    assert.strictEqual(msg, '');
  });
});
