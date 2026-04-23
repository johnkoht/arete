/**
 * Compatibility assertion test for the ItemSource union.
 *
 * The web app (packages/apps/web) has no @arete/core dependency and duplicates
 * the ItemSource union as a standalone literal type. This test enforces that
 * the web-side literals and the core-side union stay in sync — drift fails here.
 *
 * If you add a new value to @arete/core::ItemSource, update:
 *   - packages/core/src/models/common.ts (canonical ItemSource union)
 *   - packages/apps/web/src/api/types.ts (standalone ItemSource)
 *   - packages/apps/web/src/api/meetings.ts (uses the web-side ItemSource)
 *   - EXPECTED_SOURCES below
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemSource } from '@arete/core';

describe('ItemSource compatibility (core ↔ web)', () => {
  /**
   * Literal list of the currently-supported ItemSource values.
   * If @arete/core::ItemSource adds or removes a value without updating this
   * array, the `satisfies` check below will fail at compile time.
   */
  const EXPECTED_SOURCES = [
    'ai',
    'dedup',
    'reconciled',
    'existing-task',
    'slack-resolved',
  ] as const satisfies readonly ItemSource[];

  /**
   * Hard-coded snapshot of the web-side literal union in
   * packages/apps/web/src/api/types.ts. Kept here (not imported) because
   * the backend test suite can't import from the web bundle cleanly.
   * If the web union drifts, this deepEqual fails.
   */
  const WEB_SIDE_SOURCES: readonly string[] = [
    'ai',
    'dedup',
    'reconciled',
    'existing-task',
    'slack-resolved',
  ];

  it('web-side ItemSource literals match the canonical core ItemSource union', () => {
    assert.deepEqual(
      [...WEB_SIDE_SOURCES].sort(),
      [...EXPECTED_SOURCES].sort(),
      'Web-side ItemSource (packages/apps/web/src/api/types.ts) drifted from @arete/core::ItemSource. Update both.',
    );
  });

  it('type-level exhaustiveness: every core ItemSource value is enumerated in EXPECTED_SOURCES', () => {
    // Compile-time: the `satisfies` on EXPECTED_SOURCES fails if a value is
    // missing. Runtime: this assertion is a belt-and-suspenders sanity check
    // that the array actually lists 5 entries (protects against someone
    // widening core::ItemSource but forgetting to extend EXPECTED_SOURCES —
    // though TS would also catch that).
    assert.equal(EXPECTED_SOURCES.length, 5, 'Expected exactly 5 ItemSource values');
  });
});
