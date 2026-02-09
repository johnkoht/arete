/**
 * Tests for src/integrations/registry.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTEGRATIONS,
  PULLABLE_INTEGRATIONS,
  SEEDABLE_INTEGRATIONS,
  getIntegration,
  getIntegrationsByCapability,
  getAvailableIntegrations,
} from '../../src/integrations/registry.js';

describe('integration registry', () => {
  describe('INTEGRATIONS', () => {
    it('contains fathom', () => {
      assert.ok(INTEGRATIONS.fathom);
      assert.equal(INTEGRATIONS.fathom.name, 'fathom');
      assert.equal(INTEGRATIONS.fathom.status, 'available');
    });

    it('all integrations have required fields', () => {
      for (const [key, int] of Object.entries(INTEGRATIONS)) {
        assert.ok(int.name, `${key} missing name`);
        assert.ok(int.displayName, `${key} missing displayName`);
        assert.ok(int.description, `${key} missing description`);
        assert.ok(Array.isArray(int.implements), `${key} implements should be array`);
        assert.ok(int.implements.length > 0, `${key} implements should not be empty`);
        assert.ok(int.auth, `${key} missing auth`);
        assert.ok(['api_key', 'oauth', 'none'].includes(int.auth.type), `${key} invalid auth type`);
        assert.ok(['available', 'planned'].includes(int.status), `${key} invalid status`);
      }
    });

    it('has no duplicate names', () => {
      const names = Object.values(INTEGRATIONS).map(i => i.name);
      const unique = new Set(names);
      assert.equal(names.length, unique.size, 'Duplicate integration names found');
    });
  });

  describe('PULLABLE_INTEGRATIONS', () => {
    it('fathom is pullable', () => {
      assert.ok(PULLABLE_INTEGRATIONS.fathom);
      assert.equal(PULLABLE_INTEGRATIONS.fathom.command, 'fetch');
    });

    it('all pullable integrations exist in main registry', () => {
      for (const name of Object.keys(PULLABLE_INTEGRATIONS)) {
        assert.ok(INTEGRATIONS[name], `${name} in PULLABLE but not in INTEGRATIONS`);
      }
    });

    it('all pullable integrations have required script fields', () => {
      for (const [key, int] of Object.entries(PULLABLE_INTEGRATIONS)) {
        assert.ok(int.script, `${key} missing script`);
        assert.ok(int.command, `${key} missing command`);
        assert.ok(typeof int.defaultDays === 'number', `${key} missing defaultDays`);
      }
    });
  });

  describe('SEEDABLE_INTEGRATIONS', () => {
    it('fathom is seedable', () => {
      assert.ok(SEEDABLE_INTEGRATIONS.fathom);
      assert.equal(SEEDABLE_INTEGRATIONS.fathom.defaultDays, 60);
    });

    it('all seedable integrations exist in main registry', () => {
      for (const name of Object.keys(SEEDABLE_INTEGRATIONS)) {
        assert.ok(INTEGRATIONS[name], `${name} in SEEDABLE but not in INTEGRATIONS`);
      }
    });
  });

  describe('getIntegration', () => {
    it('returns fathom by name', () => {
      const int = getIntegration('fathom');
      assert.ok(int);
      assert.equal(int!.name, 'fathom');
    });

    it('returns undefined for unknown name', () => {
      const int = getIntegration('does-not-exist');
      assert.equal(int, undefined);
    });
  });

  describe('getIntegrationsByCapability', () => {
    it('finds meeting-recordings integrations', () => {
      const ints = getIntegrationsByCapability('meeting-recordings');
      assert.ok(ints.length >= 1);
      assert.ok(ints.some(i => i.name === 'fathom'));
    });

    it('returns empty array for unknown capability', () => {
      const ints = getIntegrationsByCapability('teleportation');
      assert.equal(ints.length, 0);
    });
  });

  describe('getAvailableIntegrations', () => {
    it('returns only non-planned integrations', () => {
      const available = getAvailableIntegrations();
      for (const int of available) {
        assert.notEqual(int.status, 'planned');
      }
    });

    it('includes fathom', () => {
      const available = getAvailableIntegrations();
      assert.ok(available.some(i => i.name === 'fathom'));
    });
  });
});
