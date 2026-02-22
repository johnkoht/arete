/**
 * Tests for saveFathomApiKey — read-modify-write credential storage.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { saveFathomApiKey, loadFathomApiKey } from '../../src/integrations/fathom/client.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

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
      return new Date();
    },
  };
}

describe('saveFathomApiKey', () => {
  it('saves key to new credentials file', async () => {
    const storage = createMockStorage();
    await saveFathomApiKey(storage, '/workspace', 'test-key-123');

    const content = storage.files.get('/workspace/.credentials/credentials.yaml');
    assert.ok(content, 'credentials file should be written');

    const parsed = parseYaml(content) as Record<string, Record<string, string>>;
    assert.equal(parsed.fathom.api_key, 'test-key-123');
  });

  it('preserves existing krisp credentials (read-modify-write)', async () => {
    const storage = createMockStorage();
    storage.files.set(
      '/workspace/.credentials/credentials.yaml',
      'krisp:\n  client_id: kid\n  client_secret: ksecret\n  access_token: kat\n  refresh_token: krt\n  expires_at: 9999999999\n'
    );

    await saveFathomApiKey(storage, '/workspace', 'my-fathom-key');

    const content = storage.files.get('/workspace/.credentials/credentials.yaml')!;
    const parsed = parseYaml(content) as Record<string, Record<string, unknown>>;
    assert.equal(parsed.fathom.api_key, 'my-fathom-key');
    assert.equal(parsed.krisp.client_id, 'kid');
    assert.equal(parsed.krisp.client_secret, 'ksecret');
  });

  it('overwrites existing fathom key', async () => {
    const storage = createMockStorage();
    storage.files.set(
      '/workspace/.credentials/credentials.yaml',
      'fathom:\n  api_key: old-key\n'
    );

    await saveFathomApiKey(storage, '/workspace', 'new-key');

    const content = storage.files.get('/workspace/.credentials/credentials.yaml')!;
    const parsed = parseYaml(content) as Record<string, Record<string, string>>;
    assert.equal(parsed.fathom.api_key, 'new-key');
  });

  it('handles malformed existing YAML gracefully', async () => {
    const storage = createMockStorage();
    storage.files.set(
      '/workspace/.credentials/credentials.yaml',
      '{ bad yaml [[[['
    );

    await saveFathomApiKey(storage, '/workspace', 'recovery-key');

    const content = storage.files.get('/workspace/.credentials/credentials.yaml')!;
    const parsed = parseYaml(content) as Record<string, Record<string, string>>;
    assert.equal(parsed.fathom.api_key, 'recovery-key');
  });

  it('roundtrips with loadFathomApiKey', async () => {
    const storage = createMockStorage();
    await saveFathomApiKey(storage, '/workspace', 'roundtrip-key');

    const loaded = await loadFathomApiKey(storage, '/workspace');
    assert.equal(loaded, 'roundtrip-key');
  });
});
