/**
 * Tests for packages/apps/backend/src/services/workspace.ts
 *
 * Primary focus: parseStagedItemSource allowlist regression — ensure every
 * valid ItemSource value survives the parse round-trip. Previously this
 * dropped 'reconciled' silently (and would drop 'existing-task' and
 * 'slack-resolved' once they ship), causing UI badges to disappear.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStagedItemSource, getMeeting } from '../../src/services/workspace.js';

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

// ---------------------------------------------------------------------------
// End-to-end integration: frontmatter → getMeeting → response payload
// ---------------------------------------------------------------------------
// Plan step 8b: the latent 'reconciled' silent-drop bug existed because no
// test exercised the full read path from disk → parseStagedItemSource →
// getMeeting response payload. This test closes that bug class by asserting
// all ItemSource values survive the full round-trip.

describe('getMeeting E2E: ItemSource values round-trip through full read path', () => {
  let workspaceRoot: string;

  before(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-workspace-test-'));
    mkdirSync(join(workspaceRoot, 'resources', 'meetings'), { recursive: true });

    // Fixture meeting with four different staged_item_source values.
    // 'slack-resolved' is reserved forward-compat; parser must tolerate it even
    // though no current code path produces it.
    const meetingContent = `---
title: "E2E Test Meeting"
date: 2026-04-22T10:00:00Z
source: Krisp
status: processed
attendees:
  - name: "John"
    email: ""
staged_item_status:
  ai_001: approved
  ai_002: skipped
  ai_003: skipped
  ai_004: pending
  de_001: approved
  le_001: pending
staged_item_source:
  ai_001: ai
  ai_002: reconciled
  ai_003: existing-task
  ai_004: dedup
  de_001: ai
  le_001: slack-resolved
staged_item_matched_text:
  ai_002: "Already completed task from week.md"
  ai_003: "Open task already tracked"
---

# E2E Test Meeting

## Staged Action Items
- ai_001: Draft the Q2 plan
- ai_002: Send auth docs to Alex
- ai_003: Update LEAP testing sheet
- ai_004: Review Tim's signature TDD

## Staged Decisions
- de_001: Use REST instead of GraphQL

## Staged Learnings
- le_001: Adjusters prefer accordion email view

## Transcript

Some content.
`;
    writeFileSync(
      join(workspaceRoot, 'resources', 'meetings', '2026-04-22-e2e-test.md'),
      meetingContent,
      'utf8',
    );
  });

  after(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('propagates all five ItemSource values from frontmatter to staged items in the response', async () => {
    const meeting = await getMeeting(workspaceRoot, '2026-04-22-e2e-test');
    assert.ok(meeting, 'meeting should be returned');

    const byId = new Map<string, { source?: string; matchedText?: string }>();
    for (const section of ['actionItems', 'decisions', 'learnings'] as const) {
      for (const item of meeting.stagedSections[section]) {
        byId.set(item.id, { source: item.source, matchedText: item.matchedText });
      }
    }

    // Every value in the frontmatter survives to the response payload.
    assert.equal(byId.get('ai_001')?.source, 'ai');
    assert.equal(
      byId.get('ai_002')?.source, 'reconciled',
      "'reconciled' must survive — pre-fix behavior dropped it (caused UI 'already done' badge to never render)",
    );
    assert.equal(byId.get('ai_003')?.source, 'existing-task');
    assert.equal(byId.get('ai_004')?.source, 'dedup');
    assert.equal(byId.get('de_001')?.source, 'ai');
    assert.equal(
      byId.get('le_001')?.source, 'slack-resolved',
      "'slack-resolved' (reserved forward-compat) must survive the parser",
    );

    // Matched text pairs with the source attribution
    assert.equal(byId.get('ai_002')?.matchedText, 'Already completed task from week.md');
    assert.equal(byId.get('ai_003')?.matchedText, 'Open task already tracked');
  });
});
