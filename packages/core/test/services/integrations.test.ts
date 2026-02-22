/**
 * Tests for IntegrationService — krisp status detection and dual-write.
 *
 * Uses mock StorageAdapter (same pattern as krisp.test.ts in integrations/).
 * getIntegrationStatus is private — accessed via (service as any).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { IntegrationService } from '../../src/services/integrations.js';
import { saveKrispCredentials, type KrispCredentials } from '../../src/integrations/krisp/config.js';
import { saveGoogleCredentials, type GoogleCalendarCredentials } from '../../src/integrations/calendar/google-auth.js';
import { getDefaultConfig } from '../../src/config.js';
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
const MANIFEST_PATH = `${WORKSPACE}/arete.yaml`;

function makeService(storage: StorageAdapter): IntegrationService {
  return new IntegrationService(storage, getDefaultConfig());
}

function makeValidCreds(): KrispCredentials {
  return {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    access_token: 'valid-token-xyz',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

// ---------------------------------------------------------------------------
// Tests: getIntegrationStatus for krisp
// ---------------------------------------------------------------------------

describe('IntegrationService.getIntegrationStatus — krisp', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: IntegrationService;

  beforeEach(() => {
    storage = createMockStorage();
    service = makeService(storage);
  });

  it('(Test 5) returns "active" when all 5 krisp credential fields are present', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: valid-token-xyz
  refresh_token: test-refresh-token
  expires_at: 9999999999
`.trim());

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(status, 'active', 'Status must be "active" when valid credentials exist');
  });

  it('(Test 6) returns "inactive" when credentials.yaml has no krisp: section', async () => {
    storage.files.set(CRED_PATH, `
fathom:
  api_key: fathom-key-value
`.trim());

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(status, 'inactive', 'Status must be "inactive" when krisp: section is absent');
  });

  it('(Test 7) returns "inactive" when krisp access_token is empty string', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-client-id
  client_secret: test-client-secret
  access_token: ""
  refresh_token: test-refresh-token
  expires_at: 9999999999
`.trim());

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(status, 'inactive', 'Status must be "inactive" when access_token is empty');
  });

  it('returns "inactive" when credentials file does not exist', async () => {
    // No credentials file in storage

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(status, 'inactive', 'Status must be "inactive" when no credentials file');
  });

  it('returns "inactive" when krisp section is present but missing required fields', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: partial-id
  # missing client_secret, access_token, refresh_token, expires_at
`.trim());

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(status, 'inactive', 'Status must be "inactive" when fields are incomplete');
  });
});

// ---------------------------------------------------------------------------
// Tests: dual-write (saveKrispCredentials + integrationService.configure)
// ---------------------------------------------------------------------------

describe('IntegrationService — krisp dual-write (credentials then arete.yaml)', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: IntegrationService;

  beforeEach(() => {
    storage = createMockStorage();
    service = makeService(storage);
  });

  it('(Test 3) saves credentials first, then marks krisp active in arete.yaml', async () => {
    const creds = makeValidCreds();

    // Step 1: save credentials
    await saveKrispCredentials(storage, WORKSPACE, creds);

    // Step 2: mark active in arete.yaml
    await service.configure(WORKSPACE, 'krisp', { status: 'active' });

    // --- Verify credentials.yaml has all 5 krisp fields ---
    const credContent = storage.files.get(CRED_PATH);
    assert.ok(credContent, 'credentials.yaml must exist after saveKrispCredentials');

    const credParsed = parseYaml(credContent) as Record<string, Record<string, unknown>>;
    const krisp = credParsed.krisp;
    assert.ok(krisp, 'krisp section must be present in credentials.yaml');
    assert.equal(krisp.client_id, creds.client_id, 'client_id must be saved');
    assert.equal(krisp.client_secret, creds.client_secret, 'client_secret must be saved');
    assert.equal(krisp.access_token, creds.access_token, 'access_token must be saved');
    assert.equal(krisp.refresh_token, creds.refresh_token, 'refresh_token must be saved');
    assert.equal(krisp.expires_at, creds.expires_at, 'expires_at must be saved');

    // --- Verify arete.yaml has integrations.krisp.status: active ---
    const manifestContent = storage.files.get(MANIFEST_PATH);
    assert.ok(manifestContent, 'arete.yaml must exist after configure');

    const manifest = parseYaml(manifestContent) as Record<string, Record<string, Record<string, unknown>>>;
    const krispConfig = manifest.integrations?.krisp;
    assert.ok(krispConfig, 'integrations.krisp must be present in arete.yaml');
    assert.equal(krispConfig.status, 'active', 'integrations.krisp.status must be "active"');
  });

  it('preserves existing arete.yaml content when adding krisp config', async () => {
    // Pre-populate arete.yaml with existing data
    storage.files.set(MANIFEST_PATH, `schema: 1
integrations:
  calendar:
    provider: macos
    status: active
`);

    await service.configure(WORKSPACE, 'krisp', { status: 'active' });

    const manifestContent = storage.files.get(MANIFEST_PATH);
    assert.ok(manifestContent, 'arete.yaml must exist');

    const manifest = parseYaml(manifestContent) as Record<string, Record<string, Record<string, unknown>>>;

    // Krisp added
    assert.equal(manifest.integrations?.krisp?.status, 'active', 'krisp status must be active');

    // Calendar preserved
    assert.equal(
      manifest.integrations?.calendar?.status,
      'active',
      'calendar status must be preserved',
    );
    assert.equal(
      manifest.integrations?.calendar?.provider,
      'macos',
      'calendar provider must be preserved',
    );
  });

  it('credentials write is independent — failure in configure does not lose credentials', async () => {
    const creds = makeValidCreds();

    // Write credentials first
    await saveKrispCredentials(storage, WORKSPACE, creds);

    // Verify they're written even before configure is called
    const credContent = storage.files.get(CRED_PATH);
    assert.ok(credContent, 'credentials.yaml must exist after save');
    const credParsed = parseYaml(credContent) as Record<string, Record<string, unknown>>;
    assert.equal(
      credParsed.krisp?.access_token,
      creds.access_token,
      'access_token must be persisted before configure',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: getIntegrationStatus for google-calendar
// ---------------------------------------------------------------------------

describe('IntegrationService.getIntegrationStatus — google-calendar', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: IntegrationService;

  beforeEach(() => {
    storage = createMockStorage();
    service = makeService(storage);
  });

  it('returns "active" when google_calendar credentials exist', async () => {
    const creds: GoogleCalendarCredentials = {
      access_token: 'google-access-token',
      refresh_token: 'google-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    await saveGoogleCredentials(storage, WORKSPACE, creds);

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'google-calendar');

    assert.equal(status, 'active', 'Status must be "active" when valid Google credentials exist');
  });

  it('returns "inactive" when no google_calendar credentials exist', async () => {
    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'google-calendar');

    assert.equal(status, 'inactive', 'Status must be "inactive" when no Google credentials');
  });

  it('returns "inactive" when credentials.yaml exists but no google_calendar section', async () => {
    storage.files.set(CRED_PATH, `
krisp:
  client_id: test-id
  client_secret: test-secret
  access_token: krisp-token
  refresh_token: krisp-refresh
  expires_at: 9999999999
`.trim());

    const status = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'google-calendar');

    assert.equal(status, 'inactive', 'Status must be "inactive" when google_calendar section is absent');
  });

  it('preserves other credentials when saving google credentials', async () => {
    // Pre-populate with krisp credentials
    storage.files.set(CRED_PATH, `
krisp:
  client_id: krisp-id
  client_secret: krisp-secret
  access_token: krisp-token
  refresh_token: krisp-refresh
  expires_at: 9999999999
`.trim());

    const googleCreds: GoogleCalendarCredentials = {
      access_token: 'google-access-token',
      refresh_token: 'google-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    await saveGoogleCredentials(storage, WORKSPACE, googleCreds);

    // Both should be active
    const googleStatus = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'google-calendar');
    const krispStatus = await (service as unknown as { getIntegrationStatus: (root: string, name: string) => Promise<string> })
      .getIntegrationStatus(WORKSPACE, 'krisp');

    assert.equal(googleStatus, 'active', 'Google Calendar status must be active');
    assert.equal(krispStatus, 'active', 'Krisp status must still be active');
  });
});
