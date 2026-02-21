/**
 * Tests for Krisp MCP integration — client, config.
 *
 * 9 required scenarios:
 * 1. callTool valid token — auth header + body shape
 * 2. callTool expired token — refresh called, new token persisted, new token sent
 * 3. refreshTokens Basic auth — client_secret_basic header + grant_type body
 * 4. callTool persists refreshed values — storage has new access_token after callTool
 * 5. Both tokens expired — refreshTokens throws, callTool surfaces error
 * 6. 403 on callTool — "Krisp Core plan required" error
 * 7. loadKrispCredentials complete — returns all 5 fields
 * 8. loadKrispCredentials missing — returns null
 * 9. saveKrispCredentials merge — krisp section written, fathom preserved
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { KrispMcpClient } from '../../src/integrations/krisp/client.js';
import {
  loadKrispCredentials,
  saveKrispCredentials,
  type KrispCredentials,
} from '../../src/integrations/krisp/config.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {
      // no-op
    },
    async getModified() {
      return null;
    },
  };
}

const WORKSPACE = '/test-workspace';
const CRED_PATH = `${WORKSPACE}/.credentials/credentials.yaml`;

function makeValidCreds(overrides: Partial<KrispCredentials> = {}): KrispCredentials {
  return {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // valid for 1 hour
    ...overrides,
  };
}

function makeExpiredCreds(overrides: Partial<KrispCredentials> = {}): KrispCredentials {
  return makeValidCreds({ expires_at: 0, ...overrides }); // Unix epoch = expired
}

/** Captured fetch calls */
type FetchCapture = { url: string; init: RequestInit };

let fetchCaptures: FetchCapture[] = [];
let fetchQueue: Array<{ body: unknown; status?: number }> = [];
const originalFetch = globalThis.fetch;

function setupFetchMock(): void {
  fetchCaptures = [];
  fetchQueue = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    fetchCaptures.push({ url: url.toString(), init: init ?? {} });
    const queued = fetchQueue.shift();
    if (!queued) {
      throw new Error(`Unexpected fetch call to ${url.toString()} — no response queued`);
    }
    const status = queued.status ?? 200;
    return new Response(JSON.stringify(queued.body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function teardownFetchMock(): void {
  globalThis.fetch = originalFetch;
  fetchCaptures = [];
  fetchQueue = [];
}

function queueFetch(body: unknown, status = 200): void {
  fetchQueue.push({ body, status });
}

function mcpSuccessResponse(result: unknown = { content: 'ok' }): unknown {
  return { jsonrpc: '2.0', id: 1, result };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KrispMcpClient.callTool', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let client: KrispMcpClient;

  beforeEach(() => {
    storage = createMockStorage();
    client = new KrispMcpClient(storage, WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('(1) valid token: sends correct Authorization header and JSON-RPC body', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    queueFetch(mcpSuccessResponse());

    await client.callTool('test_tool', {});

    assert.equal(fetchCaptures.length, 1, 'fetch should be called exactly once');

    const capture = fetchCaptures[0];

    // (a) Verify Authorization header
    const headers = capture.init.headers as Record<string, string>;
    assert.equal(
      headers['Authorization'],
      'Bearer test-access-token',
      'Authorization header must be Bearer <access_token>'
    );

    // (b) Verify JSON-RPC body shape
    const body = JSON.parse(capture.init.body as string) as Record<string, unknown>;
    assert.equal(body['jsonrpc'], '2.0', 'body.jsonrpc must be "2.0"');
    assert.equal(body['method'], 'tools/call', 'body.method must be "tools/call"');
    assert.equal(body['id'], 1, 'body.id must be 1');
    const params = body['params'] as Record<string, unknown>;
    assert.equal(params['name'], 'test_tool', 'params.name must be "test_tool"');
    assert.deepEqual(params['arguments'], {}, 'params.arguments must match the passed args');
  });

  it('(2) expired token: refreshes, persists new token, sends new bearer token', async () => {
    const expiredCreds = makeExpiredCreds();
    storage.files.set(CRED_PATH, `
krisp:
  client_id: ${expiredCreds.client_id}
  client_secret: ${expiredCreds.client_secret}
  access_token: ${expiredCreds.access_token}
  refresh_token: ${expiredCreds.refresh_token}
  expires_at: ${expiredCreds.expires_at}
`.trim());

    let refreshCalled = false;
    const newAccessToken = 'refreshed-access-token';
    const newExpiresAt = Math.floor(Date.now() / 1000) + 7200;

    // Replace refreshTokens with a spy
    client.refreshTokens = async (_creds: KrispCredentials) => {
      refreshCalled = true;
      return { access_token: newAccessToken, expires_at: newExpiresAt };
    };

    // Queue fetch for the MCP tool call (after refresh)
    queueFetch(mcpSuccessResponse());

    await client.callTool('test_tool', {});

    // (a) refreshTokens was called
    assert.ok(refreshCalled, 'refreshTokens should have been called for expired token');

    // (b) saveKrispCredentials persisted the new token — verify via storage
    const savedContent = storage.files.get(CRED_PATH);
    assert.ok(savedContent, 'credentials.yaml must exist after save');
    const savedYaml = parseYaml(savedContent) as Record<string, Record<string, unknown>>;
    assert.equal(
      savedYaml.krisp?.access_token,
      newAccessToken,
      'Persisted access_token must be the refreshed value'
    );

    // (c) fetch (MCP call) was made with the new bearer token
    assert.equal(fetchCaptures.length, 1, 'MCP fetch should be called once');
    const headers = fetchCaptures[0].init.headers as Record<string, string>;
    assert.equal(
      headers['Authorization'],
      `Bearer ${newAccessToken}`,
      'MCP call must use the refreshed access token, not the expired one'
    );
  });

  it('(5) both tokens expired: callTool surfaces the error when refreshTokens throws', async () => {
    const expiredCreds = makeExpiredCreds();
    storage.files.set(CRED_PATH, `
krisp:
  client_id: ${expiredCreds.client_id}
  client_secret: ${expiredCreds.client_secret}
  access_token: ${expiredCreds.access_token}
  refresh_token: ${expiredCreds.refresh_token}
  expires_at: ${expiredCreds.expires_at}
`.trim());

    // Simulate: refresh token exchange also returns 401 → refreshTokens throws
    client.refreshTokens = async (_creds: KrispCredentials) => {
      throw new Error(
        'Both tokens expired — run `arete integration configure krisp` to reconnect'
      );
    };

    await assert.rejects(
      () => client.callTool('test_tool', {}),
      (err: Error) => {
        assert.ok(
          err.message.includes('Both tokens expired'),
          `Error message must include "Both tokens expired"; got: "${err.message}"`
        );
        return true;
      }
    );
  });

  it('(6) 403 on callTool: throws "Krisp Core plan required"', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    queueFetch({ error: 'Forbidden' }, 403);

    await assert.rejects(
      () => client.callTool('test_tool', {}),
      (err: Error) => {
        assert.ok(
          err.message.includes('Krisp Core plan required'),
          `Error must mention "Krisp Core plan required"; got: "${err.message}"`
        );
        return true;
      }
    );
  });
});

describe('KrispMcpClient.refreshTokens', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let client: KrispMcpClient;

  beforeEach(() => {
    storage = createMockStorage();
    client = new KrispMcpClient(storage, WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('(3) sends client_secret_basic Authorization header and grant_type=refresh_token body', async () => {
    const creds = makeValidCreds();

    queueFetch({ access_token: 'new-token', token_type: 'Bearer', expires_in: 3600 });

    await client.refreshTokens(creds);

    assert.equal(fetchCaptures.length, 1, 'fetch should be called once');
    const capture = fetchCaptures[0];

    // Verify Authorization: Basic base64(client_id:client_secret)
    const expectedBasic =
      'Basic ' + Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
    const headers = capture.init.headers as Record<string, string>;
    assert.equal(
      headers['Authorization'],
      expectedBasic,
      `Authorization header must be client_secret_basic; expected "${expectedBasic}", got "${headers['Authorization']}"`
    );

    // Verify body contains grant_type=refresh_token
    const body = new URLSearchParams(capture.init.body as string);
    assert.equal(
      body.get('grant_type'),
      'refresh_token',
      'Body must contain grant_type=refresh_token'
    );
  });
});

describe('KrispMcpClient.callTool persistence', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let client: KrispMcpClient;

  beforeEach(() => {
    storage = createMockStorage();
    client = new KrispMcpClient(storage, WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('(4) persists refreshed access_token and expires_at to credentials after callTool', async () => {
    const expiredCreds = makeExpiredCreds();
    storage.files.set(CRED_PATH, `
krisp:
  client_id: ${expiredCreds.client_id}
  client_secret: ${expiredCreds.client_secret}
  access_token: ${expiredCreds.access_token}
  refresh_token: ${expiredCreds.refresh_token}
  expires_at: ${expiredCreds.expires_at}
`.trim());

    const newAccessToken = 'persisted-new-token';
    const newExpiresAt = 9999999999;

    // Replace refreshTokens to return known values without real network call
    client.refreshTokens = async (_creds: KrispCredentials) => ({
      access_token: newAccessToken,
      expires_at: newExpiresAt,
    });

    // Queue the MCP call response
    queueFetch(mcpSuccessResponse());

    await client.callTool('test_tool', {});

    // Now read credentials back from storage to verify persistence
    const loadedCreds = await loadKrispCredentials(storage, WORKSPACE);
    assert.ok(loadedCreds, 'loadKrispCredentials must return non-null after callTool refreshed');
    assert.equal(
      loadedCreds.access_token,
      newAccessToken,
      'Stored access_token must be the refreshed value'
    );
    assert.equal(
      loadedCreds.expires_at,
      newExpiresAt,
      'Stored expires_at must be the refreshed value'
    );
  });
});

// ---------------------------------------------------------------------------
// loadKrispCredentials
// ---------------------------------------------------------------------------

describe('loadKrispCredentials', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('(7) returns all 5 fields when krisp: section is complete', async () => {
    const expectedExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    storage.files.set(CRED_PATH, `
krisp:
  client_id: my-client-id
  client_secret: my-client-secret
  access_token: my-access-token
  refresh_token: my-refresh-token
  expires_at: ${expectedExpiresAt}
`.trim());

    const creds = await loadKrispCredentials(storage, WORKSPACE);
    assert.ok(creds !== null, 'Should return credentials when all 5 fields are present');
    assert.equal(creds.client_id, 'my-client-id');
    assert.equal(creds.client_secret, 'my-client-secret');
    assert.equal(creds.access_token, 'my-access-token');
    assert.equal(creds.refresh_token, 'my-refresh-token');
    assert.equal(creds.expires_at, expectedExpiresAt);
  });

  it('(8) returns null when krisp: section is absent', async () => {
    storage.files.set(CRED_PATH, `
fathom:
  api_key: fathom-key
`.trim());

    const creds = await loadKrispCredentials(storage, WORKSPACE);
    assert.equal(creds, null, 'Should return null when krisp: section is missing');
  });

  it('returns null when credentials file does not exist', async () => {
    // storage is empty
    const creds = await loadKrispCredentials(storage, WORKSPACE);
    assert.equal(creds, null);
  });

  it('returns null when any required field is missing', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: my-client-id
  client_secret: my-client-secret
  access_token: my-access-token
  # refresh_token and expires_at missing
`.trim());

    const creds = await loadKrispCredentials(storage, WORKSPACE);
    assert.equal(creds, null, 'Should return null when any field is missing');
  });
});

// ---------------------------------------------------------------------------
// saveKrispCredentials
// ---------------------------------------------------------------------------

describe('saveKrispCredentials', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('(9) writes krisp section with all 5 fields and preserves existing credentials', async () => {
    // Pre-populate with fathom credentials
    storage.files.set(CRED_PATH, `
fathom:
  api_key: fathom-existing
`.trim());

    const creds: KrispCredentials = {
      client_id: 'new-client-id',
      client_secret: 'new-client-secret',
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_at: 1234567890,
    };

    await saveKrispCredentials(storage, WORKSPACE, creds);

    const content = storage.files.get(CRED_PATH);
    assert.ok(content, 'credentials.yaml must exist after save');

    const parsed = parseYaml(content) as Record<string, Record<string, unknown>>;

    // (a) krisp section has all 5 fields with correct values
    const krisp = parsed.krisp;
    assert.ok(krisp, 'krisp section must be present');
    assert.equal(krisp.client_id, 'new-client-id');
    assert.equal(krisp.client_secret, 'new-client-secret');
    assert.equal(krisp.access_token, 'new-access-token');
    assert.equal(krisp.refresh_token, 'new-refresh-token');
    assert.equal(krisp.expires_at, 1234567890);

    // (b) fathom.api_key is preserved
    assert.equal(
      parsed.fathom?.api_key,
      'fathom-existing',
      'Existing fathom credentials must be preserved after krisp save'
    );
  });

  it('creates credentials file when none exists', async () => {
    const creds = makeValidCreds();
    await saveKrispCredentials(storage, WORKSPACE, creds);

    const content = storage.files.get(CRED_PATH);
    assert.ok(content, 'credentials.yaml must be created');
    const parsed = parseYaml(content) as Record<string, Record<string, unknown>>;
    assert.ok(parsed.krisp, 'krisp section must be present');
    assert.equal(parsed.krisp.access_token, creds.access_token);
  });
});
