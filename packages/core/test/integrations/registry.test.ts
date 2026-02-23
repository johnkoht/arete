/**
 * Tests for the integration registry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATIONS } from '../../src/integrations/registry.js';

describe('INTEGRATIONS registry', () => {
  it('contains google-calendar entry', () => {
    const entry = INTEGRATIONS['google-calendar'];
    assert.ok(entry, 'google-calendar must exist in registry');
    assert.equal(entry.name, 'google-calendar');
    assert.equal(entry.displayName, 'Google Calendar');
    assert.equal(entry.description, 'Google Calendar integration via OAuth');
    assert.equal(entry.status, 'available');
  });

  it('google-calendar implements calendar capability (matching apple-calendar)', () => {
    const google = INTEGRATIONS['google-calendar'];
    const apple = INTEGRATIONS['apple-calendar'];
    assert.deepEqual(google.implements, ['calendar']);
    assert.deepEqual(google.implements, apple.implements);
  });

  it('google-calendar uses oauth auth type', () => {
    const entry = INTEGRATIONS['google-calendar'];
    assert.equal(entry.auth.type, 'oauth');
  });

  it('all registry entries have required fields', () => {
    for (const [key, entry] of Object.entries(INTEGRATIONS)) {
      assert.equal(entry.name, key, `${key}: name must match key`);
      assert.ok(entry.displayName, `${key}: must have displayName`);
      assert.ok(entry.description, `${key}: must have description`);
      assert.ok(Array.isArray(entry.implements), `${key}: implements must be array`);
      assert.ok(entry.implements.length > 0, `${key}: implements must not be empty`);
      assert.ok(entry.auth, `${key}: must have auth`);
      assert.ok(['api_key', 'oauth', 'none'].includes(entry.auth.type), `${key}: auth.type must be valid`);
      assert.ok(['available', 'planned'].includes(entry.status), `${key}: status must be valid`);
    }
  });
});
