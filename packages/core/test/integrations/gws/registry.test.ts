/**
 * Tests for the google-workspace registry entry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATIONS } from '../../../src/integrations/registry.js';

describe('google-workspace registry entry', () => {
  it('google-workspace is registered', () => {
    const entry = INTEGRATIONS['google-workspace'];
    assert.ok(entry, 'google-workspace must exist in registry');
  });

  it('implements email, drive, docs, sheets, contacts', () => {
    const entry = INTEGRATIONS['google-workspace'];
    assert.deepEqual(entry.implements, ['email', 'drive', 'docs', 'sheets', 'contacts']);
  });

  it('auth type is none', () => {
    const entry = INTEGRATIONS['google-workspace'];
    assert.equal(entry.auth.type, 'none');
  });

  it('status is available', () => {
    const entry = INTEGRATIONS['google-workspace'];
    assert.equal(entry.status, 'available');
  });

  it('has correct display name and description', () => {
    const entry = INTEGRATIONS['google-workspace'];
    assert.equal(entry.name, 'google-workspace');
    assert.equal(entry.displayName, 'Google Workspace');
    assert.equal(entry.description, 'Gmail, Drive, Docs, Sheets, People via gws CLI');
  });
});
