/**
 * Tests for the winddown render builder (`buildChecklistMeeting` /
 * `renderStagedBlock`) + the frontmatter-map parsers it depends on. These back
 * the `arete winddown render <date>` CLI surface (SOAK-FINDINGS §Night-1 gap 1):
 * the deterministic frontmatter → staged-block path that fixes the flat-list
 * review pain and persists an apply-compatible baseline.
 *
 * Coverage:
 *  - parsers read the single_pass writer keys (importance / uncertain / links)
 *  - buildChecklistMeeting maps frontmatter → ChecklistItemMeta correctly
 *  - tier markers + pre-fill from status, ⚠ routed to Your-call
 *  - APPLY ROUND-TRIP: every anchor the block emits is recovered by the apply
 *    parser (parseWinddownDoc), so the rendered block is a valid baseline.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChecklistMeeting,
  renderStagedBlock,
} from '../../src/integrations/winddown-checklist.js';
import {
  parseStagedItemImportance,
  parseStagedItemUncertain,
  parseStagedItemLinks,
} from '../../src/integrations/staged-items.js';
import { parseWinddownDoc } from '../../src/integrations/winddown-apply.js';

const MEETING = `---
title: Glance 2.0 Compliance Workshop
date: 2026-06-15
status: processed
staged_item_status:
  ai_001: pending
  ai_002: skipped
  de_001: approved
  le_001: pending
staged_item_importance:
  ai_001: blocker
  de_001: high
staged_item_uncertain:
  le_001: not sure this is your workstream
staged_item_skip_reason:
  ai_002:
    reason: answered later at the workshop
    evidence: de_001
    setBy: chef
    setAt: 2026-06-15T15:00:00.000Z
staged_item_links:
  ai_001:
    continuationOf: acc2a220
---

## Summary
A workshop.

## Staged Action Items
- ai_001: Glance must auto-assign claims by license profile
- ai_002: Confirm consolidation rules universal across carriers

## Staged Decisions
- de_001: Cadence locked day 15 first letter then every 30d

## Staged Learnings
- le_001: Kim's team building AI state-reg wiki
`;

describe('winddown render — frontmatter map parsers', () => {
  it('parseStagedItemImportance reads tiers, drops unknown values', () => {
    const m = parseStagedItemImportance(MEETING);
    assert.deepEqual(m, { ai_001: 'blocker', de_001: 'high' });
  });

  it('parseStagedItemUncertain reads reasons; presence ⇒ uncertain', () => {
    const m = parseStagedItemUncertain(MEETING);
    assert.deepEqual(m, { le_001: 'not sure this is your workstream' });
  });

  it('parseStagedItemLinks reads continuationOf/supersedes', () => {
    const m = parseStagedItemLinks(MEETING);
    assert.deepEqual(m, { ai_001: { continuationOf: 'acc2a220' } });
  });

  it('empty-string uncertain entry still counts as uncertain', () => {
    const content = MEETING.replace(
      'le_001: not sure this is your workstream',
      "le_001: ''",
    );
    const m = parseStagedItemUncertain(content);
    assert.ok(Object.prototype.hasOwnProperty.call(m, 'le_001'));
    assert.equal(m.le_001, '');
  });
});

describe('buildChecklistMeeting', () => {
  it('maps frontmatter overlays onto each staged item', () => {
    const cm = buildChecklistMeeting(MEETING, {
      slug: '2026-06-15-compliance',
      title: 'Glance 2.0 Compliance Workshop',
    });
    assert.equal(cm.slug, '2026-06-15-compliance');
    assert.equal(cm.sections.actionItems.length, 2);
    assert.equal(cm.sections.decisions.length, 1);
    assert.equal(cm.sections.learnings.length, 1);

    assert.equal(cm.meta['ai_001'].tier, 'blocker');
    assert.equal(cm.meta['ai_001'].status, 'pending');
    assert.deepEqual(cm.meta['ai_001'].links, { continuationOf: 'acc2a220' });

    assert.equal(cm.meta['ai_002'].status, 'skipped');
    assert.equal(cm.meta['ai_002'].skipReason, 'answered later at the workshop');

    assert.equal(cm.meta['de_001'].tier, 'high');
    assert.equal(cm.meta['de_001'].status, 'approved');

    // le_001 is uncertain (⚠ channel) — routed to Your-call by the renderer.
    assert.equal(cm.meta['le_001'].uncertainReason, 'not sure this is your workstream');
  });
});

describe('renderStagedBlock', () => {
  const cm = buildChecklistMeeting(MEETING, {
    slug: '2026-06-15-compliance',
    title: 'Glance 2.0 Compliance Workshop',
  });
  const block = renderStagedBlock([cm]);

  it('groups per-meeting, stamps tier markers, pre-fills from status', () => {
    assert.match(block, /## Glance 2\.0 Compliance Workshop/);
    assert.match(block, /### Action items/);
    assert.match(block, /### Decisions/);
    // blocker pre-checked + marker.
    assert.match(block, /- \[x\] \*\*\[BLOCKER\]\*\* Glance must auto-assign/);
    // high decision pre-checked + marker.
    assert.match(block, /- \[x\] \*\*\[high\]\*\* Cadence locked/);
    // agent skip → unchecked + inline reason.
    assert.match(block, /- \[ \] Confirm consolidation rules universal across carriers — skip: answered later/);
    // continuation link annotation.
    assert.match(block, /↩ continues acc2a220/);
  });

  it('routes the uncertain learning into a Your-call block, not a section', () => {
    assert.match(block, /Your call/);
    assert.match(block, /Kim's team building AI state-reg wiki.*keep or skip\?/);
    // it must NOT appear as a plain checkbox section line.
    assert.doesNotMatch(block, /- \[[ x]\] .*Kim's team building AI state-reg wiki  <!-- le_001/);
  });

  it('does NOT include the doc title/legend header (agent owns that)', () => {
    assert.doesNotMatch(block, /# Daily Winddown/);
    assert.doesNotMatch(block, /## Proposed actions/);
  });

  it('empty input → empty string', () => {
    assert.equal(renderStagedBlock([]), '');
  });

  it('APPLY ROUND-TRIP: every emitted anchor is recovered by the apply parser', () => {
    const parsed = parseWinddownDoc(block);
    // No malformed (anchorless) checkbox lines.
    assert.deepEqual(parsed.malformed, []);
    // Item anchors present + apply-compatible.
    assert.ok(parsed.byAnchor.has('ai_001@2026-06-15-compliance'));
    assert.ok(parsed.byAnchor.has('ai_002@2026-06-15-compliance'));
    assert.ok(parsed.byAnchor.has('de_001@2026-06-15-compliance'));
    // Checkbox state survives the round trip.
    assert.equal(parsed.byAnchor.get('ai_001@2026-06-15-compliance')!.checked, true);
    assert.equal(parsed.byAnchor.get('ai_002@2026-06-15-compliance')!.checked, false);
    // The uncertain learning round-trips as a CHOICE (keep/skip), not an item.
    assert.ok(parsed.byAnchor.has('choice:le_001@2026-06-15-compliance:keep'));
    assert.ok(parsed.byAnchor.has('choice:le_001@2026-06-15-compliance:skip'));
  });
});
