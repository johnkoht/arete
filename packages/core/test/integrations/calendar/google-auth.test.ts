/**
 * Tests for Google Calendar OAuth2 flow and credential storage.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTokenValid,
  getClientCredentials,
  loadGoogleCredentials,
  saveGoogleCredentials,
  refreshToken,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from '../../../src/integrations/calendar/google-auth.js';
import type { GoogleCalendarCredentials } from '../../../src/integrations/calendar/google-auth.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentials(overrides: Partial<GoogleCalendarCredentials> = {}): GoogleCalendarCredentials {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...overrides,
  };
}

/** Create a minimal mock StorageAdapter for credential tests. */
function createMockStorage(files: Record<string, string> = {}): StorageAdapter {
  const store = new Map(Object.entries(files));
  return {
    async read(path: string) {
      return store.get(path) ?? '';
    },
    async write(path: string, content: string) {
      store.set(path, content);
    },
    async exists(path: string) {
      return store.has(path);
    },
    async list(_dir: string) {
      return [];
    },
    async mkdir(_path: string) {},
    async readdir(_path: string) {
      return [];
    },
    async stat(_path: string) {
      return { isDirectory: () => false, isFile: () => true, mtime: new Date() };
    },
    async copy(_src: string, _dst: string) {},
    async rename(_src: string, _dst: string) {},
    async remove(_path: string) {},
    // _getStore exposed for assertions
    _getStore() {
      return store;
    },
  } as StorageAdapter & { _getStore: () => Map<string, string> };
}

// ---------------------------------------------------------------------------
// isTokenValid
// ---------------------------------------------------------------------------

describe('isTokenValid', () => {
  it('returns true when token is not expired', () => {
    const creds = makeCredentials({
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    assert.equal(isTokenValid(creds), true);
  });

  it('returns false when token is expired', () => {
    const creds = makeCredentials({
      expires_at: Math.floor(Date.now() / 1000) - 100,
    });
    assert.equal(isTokenValid(creds), false);
  });

  it('returns false within 5-minute buffer', () => {
    // Token expires in 4 minutes — within the 300s buffer
    const creds = makeCredentials({
      expires_at: Math.floor(Date.now() / 1000) + 240,
    });
    assert.equal(isTokenValid(creds), false);
  });

  it('returns true at exactly 5 minutes', () => {
    const creds = makeCredentials({
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    assert.equal(isTokenValid(creds), true);
  });
});

// ---------------------------------------------------------------------------
// getClientCredentials
// ---------------------------------------------------------------------------

describe('getClientCredentials', () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  afterEach(() => {
    // Restore original env
    if (originalClientId !== undefined) {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    if (originalClientSecret !== undefined) {
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    } else {
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it('returns embedded constants when no env vars', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { clientId, clientSecret } = getClientCredentials();
    assert.equal(clientId, GOOGLE_CLIENT_ID);
    assert.equal(clientSecret, GOOGLE_CLIENT_SECRET);
  });

  it('returns env vars when set (override)', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-client-secret';
    const { clientId, clientSecret } = getClientCredentials();
    assert.equal(clientId, 'env-client-id');
    assert.equal(clientSecret, 'env-client-secret');
  });

  it('partial override — only GOOGLE_CLIENT_ID set', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-client-id';
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { clientId, clientSecret } = getClientCredentials();
    assert.equal(clientId, 'env-client-id');
    assert.equal(clientSecret, GOOGLE_CLIENT_SECRET);
  });
});

// ---------------------------------------------------------------------------
// loadGoogleCredentials
// ---------------------------------------------------------------------------

describe('loadGoogleCredentials', () => {
  it('returns null when no credentials file', async () => {
    const storage = createMockStorage();
    const result = await loadGoogleCredentials(storage, '/workspace');
    assert.equal(result, null);
  });

  it('returns null when file exists but no google_calendar key', async () => {
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml': 'fathom:\n  api_key: test\n',
    });
    const result = await loadGoogleCredentials(storage, '/workspace');
    assert.equal(result, null);
  });

  it('returns null when google_calendar section is incomplete', async () => {
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml':
        'google_calendar:\n  access_token: tok\n',
    });
    const result = await loadGoogleCredentials(storage, '/workspace');
    assert.equal(result, null);
  });

  it('returns credentials when present and complete', async () => {
    const yaml = [
      'fathom:',
      '  api_key: fathom-key',
      'google_calendar:',
      '  access_token: my-access',
      '  refresh_token: my-refresh',
      '  expires_at: 1700000000',
    ].join('\n');
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml': yaml,
    });
    const result = await loadGoogleCredentials(storage, '/workspace');
    assert.deepEqual(result, {
      access_token: 'my-access',
      refresh_token: 'my-refresh',
      expires_at: 1700000000,
    });
  });

  it('returns null for malformed YAML', async () => {
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml': '{{invalid yaml',
    });
    const result = await loadGoogleCredentials(storage, '/workspace');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// saveGoogleCredentials
// ---------------------------------------------------------------------------

describe('saveGoogleCredentials', () => {
  it('preserves existing keys (fathom, krisp) — read-modify-write', async () => {
    const existingYaml = [
      'fathom:',
      '  api_key: fathom-key',
      'krisp:',
      '  access_token: krisp-tok',
    ].join('\n');
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml': existingYaml,
    }) as StorageAdapter & { _getStore: () => Map<string, string> };

    await saveGoogleCredentials(storage, '/workspace', makeCredentials());

    const written = storage._getStore().get('/workspace/.credentials/credentials.yaml')!;
    // Must still contain fathom and krisp
    assert.ok(written.includes('fathom'), 'fathom key preserved');
    assert.ok(written.includes('fathom-key'), 'fathom value preserved');
    assert.ok(written.includes('krisp'), 'krisp key preserved');
    assert.ok(written.includes('krisp-tok'), 'krisp value preserved');
    // Must contain google_calendar
    assert.ok(written.includes('google_calendar'), 'google_calendar key written');
    assert.ok(written.includes('test-access-token'), 'access_token written');
    assert.ok(written.includes('test-refresh-token'), 'refresh_token written');
  });

  it('creates file if it does not exist', async () => {
    const storage = createMockStorage() as StorageAdapter & { _getStore: () => Map<string, string> };

    await saveGoogleCredentials(storage, '/workspace', makeCredentials());

    const written = storage._getStore().get('/workspace/.credentials/credentials.yaml')!;
    assert.ok(written, 'file was created');
    assert.ok(written.includes('google_calendar'), 'google_calendar key written');
    assert.ok(written.includes('test-access-token'), 'access_token written');
  });

  it('overwrites existing google_calendar section', async () => {
    const existingYaml = [
      'google_calendar:',
      '  access_token: old-token',
      '  refresh_token: old-refresh',
      '  expires_at: 100',
    ].join('\n');
    const storage = createMockStorage({
      '/workspace/.credentials/credentials.yaml': existingYaml,
    }) as StorageAdapter & { _getStore: () => Map<string, string> };

    const newCreds = makeCredentials({ access_token: 'new-token' });
    await saveGoogleCredentials(storage, '/workspace', newCreds);

    const written = storage._getStore().get('/workspace/.credentials/credentials.yaml')!;
    assert.ok(written.includes('new-token'), 'new access_token written');
    assert.ok(!written.includes('old-token'), 'old access_token replaced');
  });
});

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------

describe('refreshToken', () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    // Use test env vars so we don't rely on embedded placeholders
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalClientId !== undefined) {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
    if (originalClientSecret !== undefined) {
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    } else {
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  it('calls correct endpoint with correct params', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedBody = init?.body?.toString() ?? '';
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials();
    await refreshToken(creds);

    assert.equal(capturedUrl, 'https://oauth2.googleapis.com/token');
    assert.ok(capturedBody.includes('grant_type=refresh_token'));
    assert.ok(capturedBody.includes('client_id=test-client-id'));
    assert.ok(capturedBody.includes('client_secret=test-client-secret'));
    assert.ok(capturedBody.includes(`refresh_token=${creds.refresh_token}`));
  });

  it('returns updated credentials with new expires_at', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          access_token: 'refreshed-access',
          expires_in: 7200,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials();
    const refreshed = await refreshToken(creds);

    assert.equal(refreshed.access_token, 'refreshed-access');
    assert.equal(refreshed.refresh_token, creds.refresh_token); // preserved
    assert.ok(refreshed.expires_at > Math.floor(Date.now() / 1000));
  });

  it('preserves existing refresh_token when Google does not return new one', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          expires_in: 3600,
          token_type: 'Bearer',
          // No refresh_token in response
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials({ refresh_token: 'my-original-refresh' });
    const refreshed = await refreshToken(creds);
    assert.equal(refreshed.refresh_token, 'my-original-refresh');
  });

  it('uses new refresh_token when Google rotates it', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'rotated-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials({ refresh_token: 'old-refresh' });
    const refreshed = await refreshToken(creds);
    assert.equal(refreshed.refresh_token, 'rotated-refresh');
  });

  it('throws with actionable message on invalid_grant error', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been revoked.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials();
    await assert.rejects(
      () => refreshToken(creds),
      (err: Error) => {
        assert.ok(err.message.includes('authorization expired'));
        assert.ok(err.message.includes('arete integration configure google-calendar'));
        return true;
      }
    );
  });

  it('throws actionable message when client credentials are invalid', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: 'invalid_client' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const creds = makeCredentials();
    await assert.rejects(
      () => refreshToken(creds),
      (err: Error) => {
        assert.ok(err.message.includes('client configuration is invalid'));
        return true;
      }
    );
  });

  it('throws actionable message on network failures', async () => {
    globalThis.fetch = (async () => {
      throw new Error('socket hang up');
    }) as typeof fetch;

    const creds = makeCredentials();
    await assert.rejects(
      () => refreshToken(creds),
      (err: Error) => {
        assert.ok(err.message.includes('Unable to contact Google Calendar'));
        return true;
      }
    );
  });

  it('throws on other HTTP errors', async () => {
    globalThis.fetch = (async () => {
      return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
    }) as typeof fetch;

    const creds = makeCredentials();
    await assert.rejects(
      () => refreshToken(creds),
      (err: Error) => {
        assert.ok(err.message.includes('temporarily unavailable'));
        return true;
      }
    );
  });
});
