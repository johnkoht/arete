/**
 * Settings routes tests — createSettingsRouter with real file system.
 *
 * Creates temp workspace directories, exercises GET/POST/DELETE for the
 * Anthropic API key endpoint.
 *
 * Uses node:test + node:assert/strict.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsRouter } from '../../src/routes/settings.js';

// ── helpers ──────────────────────────────────────────────────────────────────

type AnyHono = ReturnType<typeof createSettingsRouter>;

async function req(
  app: AnyHono,
  method: string,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

async function reqWithBody(
  app: AnyHono,
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ── GET /apikey — no file, no env ─────────────────────────────────────────────

describe('GET /apikey — no file and no env var', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-nokey-'));
    // Ensure env vars are cleared for this test
    savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
    savedEnv['ANTHROPIC_OAUTH_TOKEN'] = process.env['ANTHROPIC_OAUTH_TOKEN'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    // Restore env
    if (savedEnv['ANTHROPIC_API_KEY'] !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = savedEnv['ANTHROPIC_API_KEY'];
    }
    if (savedEnv['ANTHROPIC_OAUTH_TOKEN'] !== undefined) {
      process.env['ANTHROPIC_OAUTH_TOKEN'] = savedEnv['ANTHROPIC_OAUTH_TOKEN'];
    }
  });

  it('returns configured=false and maskedKey=null when no key exists', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/apikey');
    assert.equal(status, 200);
    const body = json as { configured: boolean; maskedKey: null };
    assert.equal(body.configured, false);
    assert.equal(body.maskedKey, null);
  });
});

// ── POST, GET, DELETE flow ─────────────────────────────────────────────────────

describe('POST /apikey — save a valid key', () => {
  let tmpDir: string;
  const TEST_KEY = 'sk-ant-api03-testkey1234567890abcdef';

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-post-'));
    // Ensure no env contamination
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
  });

  after(async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns 200 success when posting a valid key', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'POST', '/apikey', { key: TEST_KEY });
    assert.equal(status, 200);
    const body = json as { success: boolean };
    assert.equal(body.success, true);
  });

  it('writes the key to .credentials/anthropic-api-key', async () => {
    const keyFile = join(tmpDir, '.credentials', 'anthropic-api-key');
    const exists = await fileExists(keyFile);
    assert.equal(exists, true);
  });

  it('sets process.env.ANTHROPIC_API_KEY immediately', () => {
    assert.equal(process.env['ANTHROPIC_API_KEY'], TEST_KEY);
  });
});

describe('GET /apikey — after POST (key is configured)', () => {
  let tmpDir: string;
  const TEST_KEY = 'sk-ant-api03-testkey1234567890abcdef';

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-get-after-post-'));
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
    const router = createSettingsRouter(tmpDir);
    await reqWithBody(router, 'POST', '/apikey', { key: TEST_KEY });
  });

  after(async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns configured=true after saving a key', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/apikey');
    assert.equal(status, 200);
    const body = json as { configured: boolean; maskedKey: string };
    assert.equal(body.configured, true);
  });

  it('returns a masked key (first 16 chars + bullets)', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/apikey');
    assert.equal(status, 200);
    const body = json as { maskedKey: string };
    assert.ok(typeof body.maskedKey === 'string');
    assert.ok(body.maskedKey.length > 0);
    // Should start with first 16 chars of the key
    assert.ok(body.maskedKey.startsWith(TEST_KEY.slice(0, 16)));
    // Should contain bullet chars
    assert.ok(body.maskedKey.includes('••'));
    // Should NOT contain the full key
    assert.ok(!body.maskedKey.includes(TEST_KEY));
  });
});

describe('DELETE /apikey — remove the key', () => {
  let tmpDir: string;
  const TEST_KEY = 'sk-ant-api03-testkey1234567890abcdef';

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-delete-'));
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
    // Save a key first
    const router = createSettingsRouter(tmpDir);
    await reqWithBody(router, 'POST', '/apikey', { key: TEST_KEY });
  });

  after(async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns 200 success on DELETE', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'DELETE', '/apikey');
    assert.equal(status, 200);
    const body = json as { success: boolean };
    assert.equal(body.success, true);
  });

  it('removes the key file', async () => {
    const keyFile = join(tmpDir, '.credentials', 'anthropic-api-key');
    const exists = await fileExists(keyFile);
    assert.equal(exists, false);
  });

  it('clears process.env.ANTHROPIC_API_KEY', () => {
    assert.equal(process.env['ANTHROPIC_API_KEY'], undefined);
  });
});

describe('GET /apikey — after DELETE (no key configured)', () => {
  let tmpDir: string;
  const TEST_KEY = 'sk-ant-api03-testkey1234567890abcdef';

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-get-after-delete-'));
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
    const router = createSettingsRouter(tmpDir);
    await reqWithBody(router, 'POST', '/apikey', { key: TEST_KEY });
    await req(router, 'DELETE', '/apikey');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns configured=false after DELETE', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/apikey');
    assert.equal(status, 200);
    const body = json as { configured: boolean; maskedKey: null };
    assert.equal(body.configured, false);
    assert.equal(body.maskedKey, null);
  });
});

// ── DELETE /apikey — idempotent (no file) ─────────────────────────────────────

describe('DELETE /apikey — idempotent when no file exists', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-delete-noop-'));
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_OAUTH_TOKEN'];
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns 200 success even when no key file exists', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await req(router, 'DELETE', '/apikey');
    assert.equal(status, 200);
    const body = json as { success: boolean };
    assert.equal(body.success, true);
  });
});

// ── POST /apikey — validation errors ─────────────────────────────────────────

describe('POST /apikey — invalid key format', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-settings-test-invalid-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns 400 when key does not start with sk-ant-', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'POST', '/apikey', { key: 'sk-openai-12345' });
    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.includes('sk-ant-'));
  });

  it('returns 400 when key is missing from body', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'POST', '/apikey', {});
    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.includes('key'));
  });

  it('returns 400 when key is an empty string', async () => {
    const router = createSettingsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'POST', '/apikey', { key: '' });
    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.length > 0);
  });
});
