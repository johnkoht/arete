/**
 * Tests for packages/apps/backend/src/services/workspace.ts
 *
 * Primary focus: parseStagedItemSource allowlist regression — ensure every
 * valid ItemSource value survives the parse round-trip. Previously this
 * dropped 'reconciled' silently (and would drop 'existing-task' and
 * 'slack-resolved' once they ship), causing UI badges to disappear.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStagedItemSource, getMeeting, approveMeeting } from '../../src/services/workspace.js';

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

// ---------------------------------------------------------------------------
// Phase 0 instrumentation: backend approveMeeting wires onApproved → item-fates
// ---------------------------------------------------------------------------
// John uses the web review UI in his daily flow (per user_role.md). Without
// this observer, AC0.6's 14-day baseline silently skews CLI-only. This test
// asserts the backend approve path emits one fate=approved event per
// committed item, mirroring the CLI integration test.

interface FateRecord {
  type: string;
  ts: string;
  item_text: string;
  item_kind: 'action_item' | 'decision' | 'learning';
  source_path: string;
  fate: 'approved' | 'dismissed' | 'skipped' | 'deferred';
  reason: string | null;
  confidence: number | null;
  importance_at_extraction: string | null;
}

function readFates(workspaceRoot: string): FateRecord[] {
  const path = join(workspaceRoot, '.arete', 'memory', 'item-fates.jsonl');
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  return content
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as FateRecord);
}

describe('approveMeeting — Phase 0 item-fate instrumentation', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-backend-fate-'));
    mkdirSync(join(workspaceRoot, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(workspaceRoot, '.arete', 'memory', 'items'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'people', 'internal'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'arete.yaml'),
      'version: 1\nqmd_collection: test-arete\n',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('writes one item_fate event per approved item when invoked via the backend', async () => {
    const slug = '2026-04-22-backend-approve';
    const meetingPath = join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
    const meetingContent = `---
title: "Backend Approve"
date: "2026-04-22"
status: processed
importance: normal
attendees:
  - name: "Alice Smith"
    email: "alice@example.com"
staged_item_status:
  ai_001: approved
  de_001: approved
  le_001: approved
staged_item_source:
  ai_001: ai
  de_001: ai
  le_001: ai
staged_item_confidence:
  ai_001: 0.91
  de_001: 0.95
  le_001: 0.7
---

## Summary
Backend approval test.

## Staged Action Items
- ai_001: Send the draft to Alice

## Staged Decisions
- de_001: Adopt TypeScript for new services

## Staged Learnings
- le_001: Integration tests catch more bugs

## Transcript
Test transcript.
`;
    writeFileSync(meetingPath, meetingContent);

    await approveMeeting(workspaceRoot, slug);

    const fates = readFates(workspaceRoot);
    assert.equal(fates.length, 3, 'one fate per approved item (1 action + 1 decision + 1 learning)');

    for (const fate of fates) {
      assert.equal(fate.type, 'item_fate');
      assert.equal(fate.fate, 'approved');
      assert.equal(fate.reason, null);
      assert.equal(fate.importance_at_extraction, 'normal');
      assert.match(fate.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.ok(fate.source_path.endsWith(`${slug}.md`));
    }

    const kinds = fates.map((f) => f.item_kind).sort();
    assert.deepEqual(kinds, ['action_item', 'decision', 'learning']);

    const decision = fates.find((f) => f.item_kind === 'decision');
    assert.ok(decision);
    assert.equal(decision.confidence, 0.95);
    assert.match(decision.item_text, /Adopt TypeScript/);

    const learning = fates.find((f) => f.item_kind === 'learning');
    assert.ok(learning);
    assert.equal(learning.confidence, 0.7);
  });

  it('emits no fates for items that were not approved', async () => {
    const slug = '2026-04-22-mixed-status';
    const meetingPath = join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
    const meetingContent = `---
title: "Mixed Status"
date: "2026-04-22"
status: processed
importance: light
attendees:
  - name: "Bob Jones"
    email: "bob@example.com"
staged_item_status:
  ai_001: skipped
  de_001: approved
  le_001: pending
staged_item_source:
  ai_001: ai
  de_001: ai
  le_001: ai
staged_item_confidence:
  ai_001: 0.5
  de_001: 0.8
  le_001: 0.6
---

## Summary
Test.

## Staged Action Items
- ai_001: Skipped action

## Staged Decisions
- de_001: Approved decision only

## Staged Learnings
- le_001: Pending learning

## Transcript
Test.
`;
    writeFileSync(meetingPath, meetingContent);

    await approveMeeting(workspaceRoot, slug);

    const fates = readFates(workspaceRoot);
    assert.equal(fates.length, 1, 'only the single approved decision should produce a fate');
    assert.equal(fates[0]!.item_kind, 'decision');
    assert.equal(fates[0]!.fate, 'approved');
    assert.equal(fates[0]!.importance_at_extraction, 'light');
  });
});
