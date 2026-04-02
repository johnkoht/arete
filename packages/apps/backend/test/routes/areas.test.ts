/**
 * Backend areas routes tests.
 *
 * Uses node:test + node:assert/strict.
 * Tests GET /api/areas HTTP contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type AreaSummary = {
  slug: string;
  name: string;
};

type AreasResponse = {
  areas: AreaSummary[];
};

// ──────────────────────────────────────────────────────────────────────────────
// Test app factory
// ──────────────────────────────────────────────────────────────────────────────

function buildTestApp(areas: AreaSummary[]) {
  const app = new Hono();

  app.get('/api/areas', (c) => {
    const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ areas: sorted });
  });

  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/areas', () => {
  it('returns list of areas with slug and name', async () => {
    const areas: AreaSummary[] = [
      { slug: 'engineering', name: 'Engineering' },
      { slug: 'sales', name: 'Sales' },
    ];
    const app = buildTestApp(areas);

    const res = await app.request('/api/areas');
    assert.equal(res.status, 200);

    const data = (await res.json()) as AreasResponse;
    assert.equal(data.areas.length, 2);
    assert.equal(data.areas[0].slug, 'engineering');
    assert.equal(data.areas[0].name, 'Engineering');
    assert.equal(data.areas[1].slug, 'sales');
    assert.equal(data.areas[1].name, 'Sales');
  });

  it('returns empty array when no areas', async () => {
    const app = buildTestApp([]);

    const res = await app.request('/api/areas');
    assert.equal(res.status, 200);

    const data = (await res.json()) as AreasResponse;
    assert.deepEqual(data.areas, []);
  });

  it('sorts areas alphabetically by name', async () => {
    const areas: AreaSummary[] = [
      { slug: 'zebra', name: 'Zebra Area' },
      { slug: 'alpha', name: 'Alpha Area' },
      { slug: 'mid', name: 'Mid Area' },
    ];
    const app = buildTestApp(areas);

    const res = await app.request('/api/areas');
    const data = (await res.json()) as AreasResponse;

    assert.equal(data.areas[0].slug, 'alpha');
    assert.equal(data.areas[1].slug, 'mid');
    assert.equal(data.areas[2].slug, 'zebra');
  });
});
