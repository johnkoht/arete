/**
 * Tests for calendar provider factory (getCalendarProvider).
 *
 * Validates Google provider wiring, backward compatibility with ical-buddy,
 * and null-return patterns.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultConfig } from '../../../src/config.js';
import { getCalendarProvider } from '../../../src/integrations/calendar/index.js';
import type { AreteConfig } from '../../../src/models/workspace.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import { stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = '/test/workspace';
const CRED_PATH = `${WORKSPACE}/.credentials/credentials.yaml`;

function makeCredentialsYaml(): string {
  return stringifyYaml({
    google_calendar: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });
}

function makeMockStorage(files: Record<string, string> = {}): StorageAdapter {
  const store = new Map(Object.entries(files));
  return {
    async read(path: string) {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string) {
      store.set(path, content);
    },
    async exists(path: string) {
      return store.has(path);
    },
    async delete(path: string) {
      store.delete(path);
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

function makeGoogleConfig(): AreteConfig {
  return {
    ...getDefaultConfig(),
    integrations: {
      calendar: {
        provider: 'google',  // configure writes 'google' — keep in sync
        calendars: ['primary'],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCalendarProvider factory', () => {
  it('returns Google provider when provider is "google" and storage/workspaceRoot provided', async () => {
    const config = makeGoogleConfig();
    const storage = makeMockStorage({
      [CRED_PATH]: makeCredentialsYaml(),
    });
    const provider = await getCalendarProvider(config, storage, WORKSPACE);
    assert.ok(provider !== null, 'expected a non-null provider');
    assert.equal(provider.name, 'google-calendar');
  });

  it('returns null for provider "google" when storage not provided (backward compat)', async () => {
    const config = makeGoogleConfig();
    const provider = await getCalendarProvider(config);
    assert.equal(provider, null);
  });

  it('returns null for provider "google" when workspaceRoot not provided', async () => {
    const config = makeGoogleConfig();
    const storage = makeMockStorage();
    const provider = await getCalendarProvider(config, storage);
    assert.equal(provider, null);
  });

  it('still returns ical-buddy provider for provider "macos" (regression)', async () => {
    const config: AreteConfig = {
      ...getDefaultConfig(),
      integrations: {
        calendar: {
          provider: 'macos',
          calendars: ['Work'],
        },
      },
    };
    const provider = await getCalendarProvider(config);
    // ical-buddy may or may not be available on the test machine
    assert.ok(provider === null || provider.name === 'ical-buddy');
  });

  it('still returns ical-buddy provider for provider "ical-buddy" (regression)', async () => {
    const config: AreteConfig = {
      ...getDefaultConfig(),
      integrations: {
        calendar: {
          provider: 'ical-buddy',
          calendars: ['Work'],
        },
      },
    };
    const provider = await getCalendarProvider(config);
    assert.ok(provider === null || provider.name === 'ical-buddy');
  });

  it('returns null for unknown provider', async () => {
    const config: AreteConfig = {
      ...getDefaultConfig(),
      integrations: {
        calendar: {
          provider: 'unknown-provider',
        },
      },
    };
    const provider = await getCalendarProvider(config);
    assert.equal(provider, null);
  });

  it('returns null when no calendar config', async () => {
    const config = getDefaultConfig();
    const provider = await getCalendarProvider(config);
    assert.equal(provider, null);
  });

  it('returns null when calendar config has no provider', async () => {
    const config: AreteConfig = {
      ...getDefaultConfig(),
      integrations: {
        calendar: {
          calendars: ['Work'],
        },
      },
    };
    const provider = await getCalendarProvider(config);
    assert.equal(provider, null);
  });
});
