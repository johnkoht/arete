/**
 * Tests for packages/apps/backend/src/services/workspace.ts
 *
 * Primary focus: parseStagedItemSource allowlist regression — ensure every
 * valid ItemSource value survives the parse round-trip. Previously this
 * dropped 'reconciled' silently (and would drop 'existing-task' and
 * 'slack-resolved' once they ship), causing UI badges to disappear.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStagedItemSource } from '../../src/services/workspace.js';

describe('parseStagedItemSource', () => {
  it('preserves all five valid ItemSource values through round-trip', () => {
    const content = `---
title: Test
staged_item_source:
  ai_001: ai
  ai_002: dedup
  ai_003: reconciled
  ai_004: existing-task
  ai_005: slack-resolved
---

# Test
`;
    const result = parseStagedItemSource(content);
    assert.equal(result['ai_001'], 'ai');
    assert.equal(result['ai_002'], 'dedup');
    assert.equal(result['ai_003'], 'reconciled');
    assert.equal(result['ai_004'], 'existing-task');
    assert.equal(result['ai_005'], 'slack-resolved');
  });

  it('drops unknown source values (defensive validation at frontmatter boundary)', () => {
    const content = `---
title: Test
staged_item_source:
  ai_001: ai
  ai_002: bogus-value
  ai_003: 42
---

# Test
`;
    const result = parseStagedItemSource(content);
    assert.equal(result['ai_001'], 'ai');
    assert.equal(result['ai_002'], undefined, 'unknown string value should be dropped');
    assert.equal(result['ai_003'], undefined, 'non-string value should be dropped');
  });

  it('returns empty object when frontmatter lacks staged_item_source', () => {
    const content = `---
title: Test
---

# Test
`;
    assert.deepEqual(parseStagedItemSource(content), {});
  });

  it('returns empty object when content has no frontmatter', () => {
    assert.deepEqual(parseStagedItemSource('# No frontmatter here'), {});
  });

  it('returns empty object when staged_item_source is not an object', () => {
    const content = `---
title: Test
staged_item_source: "a string not an object"
---

# Test
`;
    assert.deepEqual(parseStagedItemSource(content), {});
  });

  it('returns empty object when staged_item_source is an array', () => {
    const content = `---
title: Test
staged_item_source:
  - ai
  - dedup
---

# Test
`;
    assert.deepEqual(parseStagedItemSource(content), {});
  });

  // Pre-existing bug regression: 'reconciled' was being silently dropped before
  // the allowlist fix in plan step 3. If this test fails, someone reverted the fix.
  it("preserves 'reconciled' (regression test for pre-existing silent-drop bug)", () => {
    const content = `---
title: Test
staged_item_source:
  ai_001: reconciled
---

# Test
`;
    const result = parseStagedItemSource(content);
    assert.equal(
      result['ai_001'],
      'reconciled',
      "'reconciled' should survive parse; pre-fix behavior dropped it silently",
    );
  });
});
