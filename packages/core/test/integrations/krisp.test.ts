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
import { meetingFromKrisp } from '../../src/integrations/krisp/save.js';
import { pullKrisp } from '../../src/integrations/krisp/index.js';
import type { KrispMeeting } from '../../src/integrations/krisp/types.js';
import type { WorkspacePaths } from '../../src/models/index.js';
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
let fetchQueue: Array<{ body: unknown; status?: number; contentType?: string; rawBody?: string }> = [];
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
    const ct = queued.contentType ?? 'application/json';
    const responseBody = queued.rawBody ?? JSON.stringify(queued.body);
    return new Response(responseBody, {
      status,
      headers: { 'Content-Type': ct },
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

function queueSSEFetch(body: unknown, status = 200): void {
  const sseBody = `data: ${JSON.stringify(body)}\n\n`;
  fetchQueue.push({ body: null, status, contentType: 'text/event-stream', rawBody: sseBody });
}

/** Wrap a value in the MCP tools/call envelope: { content: [{ type: "text", text: JSON }] } */
function mcpToolEnvelope(data: unknown): unknown {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError: false,
  };
}

function mcpSuccessResponse(result: unknown = mcpToolEnvelope({ ok: true })): unknown {
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

  it('sends Accept header with application/json and text/event-stream (MCP Streamable HTTP spec)', async () => {
    // 406 Not Acceptable is returned when Accept header is missing — this test
    // prevents regression by verifying the header is always sent.
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

    const headers = fetchCaptures[0].init.headers as Record<string, string>;
    assert.ok(
      headers['Accept']?.includes('application/json'),
      `Accept header must include application/json; got: "${headers['Accept']}"`
    );
    assert.ok(
      headers['Accept']?.includes('text/event-stream'),
      `Accept header must include text/event-stream; got: "${headers['Accept']}"`
    );
  });

  it('unwraps MCP content envelope from tools/call result', async () => {
    // MCP tools/call wraps results in { content: [{ type: "text", text: "..." }] }.
    // Without unwrapping, listMeetings returns [] because the envelope isn't an array.
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    const innerData = [{ id: '1', name: 'Test Meeting' }];
    queueFetch({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: JSON.stringify(innerData) }],
        isError: false,
      },
    });

    const result = await client.callTool('search_meetings', {});
    assert.deepEqual(result, innerData, 'callTool must unwrap MCP content envelope and parse JSON');
  });

  it('prefers structuredContent over text content when present', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    const structured = { meetings: [{ id: '1' }] };
    queueFetch({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: '{"meetings":[{"id":"1"}]}' }],
        structuredContent: structured,
        isError: false,
      },
    });

    const result = await client.callTool('test_tool', {});
    assert.deepEqual(result, structured, 'must prefer structuredContent when available');
  });

  it('handles SSE (text/event-stream) response from MCP server', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    queueSSEFetch({ jsonrpc: '2.0', id: 1, result: { meetings: [] } });
    const result = await client.callTool('test_tool', {});

    assert.deepEqual(result, { meetings: [] }, 'must extract result from SSE stream');
  });

  it('401 on callTool: throws "Krisp session expired"', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    queueFetch({ error: 'Unauthorized' }, 401);

    await assert.rejects(
      () => client.callTool('test_tool', {}),
      (err: Error) => {
        assert.ok(
          err.message.includes('Krisp session expired'),
          `Error must mention "Krisp session expired"; got: "${err.message}"`
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

    // Verify body sends the stored refresh_token value
    assert.equal(
      body.get('refresh_token'),
      creds.refresh_token,
      'Body must send the stored refresh_token value'
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

  it('token rotation: when refreshTokens returns a new refresh_token, it is persisted', async () => {
    const expiredCreds = makeExpiredCreds();
    storage.files.set(CRED_PATH, `
krisp:
  client_id: ${expiredCreds.client_id}
  client_secret: ${expiredCreds.client_secret}
  access_token: ${expiredCreds.access_token}
  refresh_token: old-refresh-token
  expires_at: ${expiredCreds.expires_at}
`.trim());

    const rotatedRefreshToken = 'rotated-refresh-token';

    // Simulate server-side refresh token rotation
    client.refreshTokens = async (_creds: KrispCredentials) => ({
      access_token: 'new-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: rotatedRefreshToken,
    });

    queueFetch(mcpSuccessResponse());

    await client.callTool('test_tool', {});

    const saved = await loadKrispCredentials(storage, WORKSPACE);
    assert.ok(saved, 'credentials must exist after callTool');
    assert.equal(
      saved.refresh_token,
      rotatedRefreshToken,
      'Rotated refresh_token must be persisted, not the old one'
    );
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

// ---------------------------------------------------------------------------
// meetingFromKrisp transform (tests 13–14)
// ---------------------------------------------------------------------------

describe('meetingFromKrisp', () => {
  it('(13) transforms a full KrispMeeting to correct MeetingForSave shape', () => {
    const meeting: KrispMeeting = {
      meeting_id: 'abc123',
      name: 'Team Standup',
      date: '2026-01-15',
      url: 'https://krisp.ai/meetings/abc123',
      attendees: [{ name: 'Alice', email: 'a@x.com' }],
      key_points: ['Point A'],
      action_items: [{ text: 'Review doc', assignee: 'Alice' }],
      detailed_summary: 'Great meeting',
    };

    const result = meetingFromKrisp(meeting, 'Full transcript text here');

    assert.equal(result.title, 'Team Standup', 'title must come from name');
    assert.equal(result.date, '2026-01-15', 'date must be preserved');
    assert.equal(result.url, 'https://krisp.ai/meetings/abc123', 'url must be preserved');
    assert.deepEqual(result.highlights, ['Point A'], 'highlights must come from key_points');
    assert.deepEqual(result.action_items, ['Review doc (@Alice)'], 'action_items must be plain strings with assignee');
    assert.equal(result.transcript, 'Full transcript text here', 'transcript must use fetched text');
    assert.equal(result.summary, 'Great meeting', 'summary must come from detailed_summary');
    assert.equal(result.duration_minutes, 0, 'duration_minutes must always be 0');
    assert.deepEqual(
      result.attendees,
      [{ name: 'Alice', email: 'a@x.com' }],
      'attendees must be mapped correctly'
    );
  });

  it('uses speakers as attendees when attendees list is empty', () => {
    const meeting: KrispMeeting = {
      meeting_id: 'spk1',
      name: 'Quick Call',
      speakers: ['Anna', 'Bob'],
    };

    const result = meetingFromKrisp(meeting);

    assert.deepEqual(
      result.attendees,
      [{ name: 'Anna', email: null }, { name: 'Bob', email: null }],
      'speakers must be used as attendees when no attendees field'
    );
  });

  it('(14) handles missing/absent fields without throwing', () => {
    const meeting: KrispMeeting = { meeting_id: 'minimal-id' };

    const result = meetingFromKrisp(meeting);

    assert.equal(result.title, 'Untitled Meeting', 'title must default to "Untitled Meeting"');
    assert.equal(result.url, '', 'url must default to empty string');
    assert.deepEqual(result.highlights, [], 'highlights must default to empty array');
    assert.deepEqual(result.action_items, [], 'action_items must default to empty array');
    assert.equal(result.transcript, '', 'transcript must default to empty string');
    assert.equal(result.summary, '', 'summary must default to empty string');
    assert.equal(result.duration_minutes, 0, 'duration_minutes must be 0');
    assert.deepEqual(result.attendees, [], 'attendees must default to empty array');
  });
});

// ---------------------------------------------------------------------------
// KrispMcpClient.listMeetings and getDocument (tests 15–16)
// ---------------------------------------------------------------------------

describe('KrispMcpClient.listMeetings and getDocument', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let client: KrispMcpClient;

  beforeEach(() => {
    storage = createMockStorage();
    client = new KrispMcpClient(storage, WORKSPACE);
    setupFetchMock();

    // Write valid credentials so callTool proceeds
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('(15) listMeetings passes after, before, AND fields including "transcript"', async () => {
    // Return structuredContent shape matching real Krisp API
    queueFetch({
      jsonrpc: '2.0', id: 1,
      result: {
        content: [{ type: 'text', text: 'Found 0 meetings' }],
        structuredContent: { criteria: {}, meetings: [], count: 0 },
      },
    });

    await client.listMeetings({ after: '2026-01-01', before: '2026-01-31' });

    assert.equal(fetchCaptures.length, 1, 'fetch must be called once');
    const body = JSON.parse(fetchCaptures[0].init.body as string) as Record<string, unknown>;
    const params = body['params'] as Record<string, unknown>;
    assert.equal(params['name'], 'search_meetings', 'tool name must be search_meetings');
    const args = params['arguments'] as Record<string, unknown>;
    assert.equal(args['after'], '2026-01-01', 'after param must be passed');
    assert.equal(args['before'], '2026-01-31', 'before param must be passed');
    assert.ok(Array.isArray(args['fields']), 'fields must be an array');
    assert.ok(
      (args['fields'] as string[]).includes('transcript'),
      'fields must include "transcript"'
    );
  });

  it('listMeetings extracts meetings from structuredContent.meetings', async () => {
    const meetings = [
      { meeting_id: 'aaa', name: 'Standup' },
      { meeting_id: 'bbb', name: 'Retro' },
    ];
    queueFetch({
      jsonrpc: '2.0', id: 1,
      result: {
        content: [{ type: 'text', text: 'Found 2 meetings' }],
        structuredContent: { criteria: {}, meetings, count: 2 },
      },
    });

    const result = await client.listMeetings();
    assert.equal(result.length, 2, 'must return 2 meetings');
    assert.equal(result[0].meeting_id, 'aaa');
    assert.equal(result[1].meeting_id, 'bbb');
  });

  it('(16) getDocument passes documentId (not id)', async () => {
    const docId = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    queueFetch({ jsonrpc: '2.0', id: 1, result: mcpToolEnvelope({ id: docId }) });

    await client.getDocument(docId);

    assert.equal(fetchCaptures.length, 1, 'fetch must be called once');
    const body = JSON.parse(fetchCaptures[0].init.body as string) as Record<string, unknown>;
    const params = body['params'] as Record<string, unknown>;
    assert.equal(params['name'], 'get_document', 'tool name must be get_document');
    const args = params['arguments'] as Record<string, unknown>;
    assert.equal(args['documentId'], docId, 'must pass documentId, not id');
    assert.ok(!('id' in args), 'must NOT pass an "id" field');
  });
});

// ---------------------------------------------------------------------------
// pullKrisp (tests 17–18)
// ---------------------------------------------------------------------------

function makeTestPaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: `${root}/arete.yaml`,
    ideConfig: `${root}/.cursor/rules`,
    rules: `${root}/.cursor/rules`,
    agentSkills: `${root}/.agents/skills`,
    tools: `${root}/.agents/tools`,
    integrations: `${root}/.agents/integrations`,
    context: `${root}/context`,
    memory: `${root}/.arete/memory`,
    now: `${root}/now`,
    goals: `${root}/goals`,
    projects: `${root}/projects`,
    resources: `${root}/resources`,
    people: `${root}/people`,
    credentials: `${root}/.credentials`,
    templates: `${root}/templates`,
  };
}

describe('pullKrisp', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let paths: WorkspacePaths;

  beforeEach(() => {
    storage = createMockStorage();
    paths = makeTestPaths(WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('(17) happy path: saves 2 meetings and returns { saved: 2, errors: [] }', async () => {
    // Write valid credentials
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: test-access-token
  refresh_token: test-refresh-token
  expires_at: ${Math.floor(Date.now() / 1000) + 3600}
`.trim());

    // Queue fetch response for listMeetings → callTool (real Krisp structuredContent shape)
    const meetings: KrispMeeting[] = [
      { meeting_id: 'aaaa1111aaaa1111aaaa1111aaaa1111', name: 'Standup', date: '2026-01-15' },
      { meeting_id: 'bbbb2222bbbb2222bbbb2222bbbb2222', name: 'Retro', date: '2026-01-16' },
    ];
    queueFetch({
      jsonrpc: '2.0', id: 1,
      result: {
        content: [{ type: 'text', text: 'Found 2 meetings' }],
        structuredContent: { criteria: {}, meetings, count: 2 },
      },
    });
    // Queue 2 getDocument calls for transcript fetching (meetings have no transcript ref)
    // No getDocument calls needed — meetings don't have transcript refs

    const result = await pullKrisp(storage, WORKSPACE, paths, 7);

    assert.equal(result.saved, 2, 'must have saved 2 meetings');
    assert.deepEqual(result.errors, [], 'must have no errors');
    assert.equal(result.success, true, 'success must be true when no errors');
  });

  it('(18) no credentials: returns { success: false, saved: 0, errors: [...] }', async () => {
    // storage is empty — no credentials

    const result = await pullKrisp(storage, WORKSPACE, paths, 7);

    assert.equal(result.success, false, 'success must be false when creds missing');
    assert.equal(result.saved, 0, 'saved must be 0');
    assert.equal(result.errors.length, 1, 'must have exactly one error');
    assert.ok(
      result.errors[0].includes('Krisp credentials not found'),
      `error must mention "Krisp credentials not found"; got: "${result.errors[0]}"`
    );
  });
});
