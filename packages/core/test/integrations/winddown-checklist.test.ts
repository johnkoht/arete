/**
 * Tests for the winddown approval-doc renderer (W1/W2).
 *
 * Coverage (semantics table — mockup §"Checkbox semantics summary"):
 *  - [x] item        : agent recommends keep        → pre-checked
 *  - [ ] item+reason : agent recommends skip        → unchecked + inline reason
 *  - tier markers    : [BLOCKER] / [high] / normal-none
 *  - tier ordering   : blocker → high → normal, stable within tier
 *  - ⚠ uncertain     : routed to Your-call, NOT in section, never pre-filled
 *  - anchors         : item / choice / action anchors emitted + recoverable
 *  - link annotations: ↩ continues / ⤴ supersedes
 *  - W2 choices      : option-checkboxes, none pre-filled, recommended marked
 *  - W2 actions      : pre-filled from recommend; reason rendering
 *  - D8 action body  : editable fenced block under the checkbox
 *  - full doc        : header + your-call + meetings + actions order
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderStagedItemsAsChecklist,
  renderWinddownDoc,
  renderChoices,
  renderActions,
  renderItemLine,
  buildChecklistMeeting,
  ownerTag,
  skipSuffix,
  isOthersAction,
  itemAnchor,
  choiceAnchor,
  actionAnchor,
  isUncertain,
  prefillChecked,
  tierMarker,
  sortByTier,
  ITEM_ANCHOR_RE,
  CHOICE_ANCHOR_RE,
  ACTION_ANCHOR_RE,
  type ChecklistMeeting,
  type ChecklistView,
} from '../../src/integrations/winddown-checklist.js';
import type { StagedItem } from '../../src/models/index.js';

function ai(id: string, text: string): StagedItem {
  return { id, text, type: 'ai', source: 'ai' };
}
function de(id: string, text: string): StagedItem {
  return { id, text, type: 'de', source: 'ai' };
}
function le(id: string, text: string): StagedItem {
  return { id, text, type: 'le', source: 'ai' };
}

describe('winddown-checklist renderer (W1)', () => {
  it('pre-checks an approved item and an untagged pending item', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony / John Weekly',
      sections: { actionItems: [ai('ai_001', 'Set up tech spike')], decisions: [], learnings: [] },
      meta: { ai_001: { status: 'approved' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] Set up tech spike  <!-- ai_001@anthony -->/);
    assert.match(out, /### Action items/);
  });

  it('unchecks a skipped item and renders its skip reason inline', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony',
      sections: { actionItems: [ai('ai_006', 'Confirm consolidation rules universal')], decisions: [], learnings: [] },
      meta: { ai_006: { status: 'skipped', skipReason: 'answered 3.5h later at the workshop' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[ \] Confirm consolidation rules universal — skip: answered 3\.5h later at the workshop  <!-- ai_006@anthony -->/);
  });

  it('stamps [BLOCKER] and [high] markers', () => {
    const meeting: ChecklistMeeting = {
      slug: 'compliance',
      title: 'Glance 2.0',
      sections: {
        actionItems: [ai('ai_001', 'Glance must auto-assign claims')],
        decisions: [de('de_001', 'Cadence locked')],
        learnings: [],
      },
      meta: {
        // W4 B-1: elevated so they stay [x] (the test asserts marker rendering,
        // not the pre-fill default — pending alone now renders [ ]).
        ai_001: { status: 'pending', elevated: true, tier: 'blocker' },
        de_001: { status: 'pending', elevated: true, tier: 'high' },
      },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] \*\*\[BLOCKER\]\*\* Glance must auto-assign claims/);
    assert.match(out, /- \[x\] \*\*\[high\]\*\* Cadence locked/);
  });

  it('orders items blocker → high → normal, stable within tier', () => {
    const items = [ai('ai_001', 'normal-a'), ai('ai_002', 'blocker'), ai('ai_003', 'normal-b'), ai('ai_004', 'high')];
    const meta = {
      ai_001: { tier: 'normal' as const },
      ai_002: { tier: 'blocker' as const },
      ai_003: { tier: 'normal' as const },
      ai_004: { tier: 'high' as const },
    };
    const ordered = sortByTier(items, meta).map((i) => i.id);
    assert.deepEqual(ordered, ['ai_002', 'ai_004', 'ai_001', 'ai_003']);
  });

  it('renders link annotations (↩ continues / ⤴ supersedes)', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony',
      sections: { actionItems: [], decisions: [de('de_002', 'V1 default one letter')], learnings: [] },
      meta: { de_002: { status: 'approved', links: { supersedes: 'de_004' } } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /⤴ supersedes de_004/);
  });

  it('Half C render guard: equal continuation+supersedes refs → only the supersedes marker', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony',
      sections: { actionItems: [], decisions: [de('de_002', 'V1 default one letter')], learnings: [] },
      // Defensive: hand-written/legacy frontmatter could still carry both at the
      // same ref. The render guard emits ONLY supersedes (no contradictory pair).
      meta: { de_002: { status: 'approved', links: { continuationOf: 'de_004', supersedes: 'de_004' } } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /⤴ supersedes de_004/);
    assert.doesNotMatch(out, /↩ continues/);
  });

  it('Half C render guard: DIFFERENT refs → both markers render', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony',
      sections: { actionItems: [], decisions: [de('de_002', 'V1 default')], learnings: [] },
      meta: { de_002: { status: 'approved', links: { continuationOf: 'de_003', supersedes: 'de_004' } } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /↩ continues de_003/);
    assert.match(out, /⤴ supersedes de_004/);
  });

  it('routes uncertain items OUT of their section (into Your-call only)', () => {
    const meeting: ChecklistMeeting = {
      slug: 'cust',
      title: 'Customer X',
      sections: { actionItems: [], decisions: [], learnings: [le('le_001', 'Customer validates pricing')] },
      meta: { le_001: { uncertainReason: 'may be common knowledge' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    // uncertain → no learnings section emitted at all (only item was uncertain)
    assert.doesNotMatch(out, /### Learnings/);
    assert.equal(isUncertain(meeting.meta.le_001), true);
  });

  it('emits recoverable item anchors', () => {
    const a = itemAnchor('ai_001', 'anthony');
    const m = a.match(ITEM_ANCHOR_RE);
    assert.ok(m);
    assert.equal(m![1], 'ai_001');
    assert.equal(m![2], 'anthony');
  });
});

describe('skip/dedup reason on unchecked items (Issue C)', () => {
  it('skipSuffix: dedup matchedRef renders a verifiable [[link]]', () => {
    assert.equal(
      skipSuffix({ status: 'skipped', skipReason: 'dupe_of_ai_003', skipMatchedRef: 'Map the Notion roadmap with Dave' }),
      ' — skip: already captured as [[Map the Notion roadmap with Dave]]',
    );
  });

  it('skipSuffix: falls back to the raw reason when no matchedRef', () => {
    assert.equal(
      skipSuffix({ status: 'skipped', skipReason: 'answered later at the workshop' }),
      ' — skip: answered later at the workshop',
    );
  });

  it('skipSuffix: empty when there is no reason at all', () => {
    assert.equal(skipSuffix({ status: 'pending' }), '');
    assert.equal(skipSuffix(undefined), '');
  });

  // theme-render W2 — eng-lead finding #2: the discriminator must tell a
  // superseded skip apart from a dedup skip (both carry a matchedRef).
  it('skipSuffix: superseded kind surfaces the reason verbatim + superseding link, NOT "already captured as"', () => {
    const out = skipSuffix({
      status: 'skipped',
      skipKind: 'superseded',
      skipReason: 'superseded by 15:00 Anthony spec-sync — recipient model changed single → multiple',
      skipMatchedRef: 'de_004@2026-06-18-anthony-spec-sync',
    });
    // Verbatim reason + linked superseding target.
    assert.equal(
      out,
      ' — superseded by 15:00 Anthony spec-sync — recipient model changed single → multiple → [[de_004@2026-06-18-anthony-spec-sync]]',
    );
    // Must NOT borrow the dedup framing.
    assert.ok(!out.includes('already captured as'), 'superseded must not read as dedup');
    assert.ok(out.includes('superseded'), 'must surface that it was superseded');
    assert.ok(out.includes('[[de_004@2026-06-18-anthony-spec-sync]]'), 'must link the superseding ref');
  });

  it('skipSuffix: superseded kind with no matchedRef still renders the verbatim reason (no link)', () => {
    assert.equal(
      skipSuffix({ status: 'skipped', skipKind: 'superseded', skipReason: 'superseded by 15:00 spec-sync' }),
      ' — superseded by 15:00 spec-sync',
    );
  });

  // AC7 BYTE-IDENTITY REGRESSION GUARD: a dedup skip — kind absent OR explicit
  // 'dedup' — must render EXACTLY as before the discriminator existed.
  it('skipSuffix: dedup renders byte-identically whether kind is absent or explicit "dedup"', () => {
    const expected = ' — skip: already captured as [[Map the Notion roadmap with Dave]]';
    // Pre-W2 entry (no kind field at all):
    assert.equal(
      skipSuffix({ status: 'skipped', skipReason: 'dupe_of_ai_003', skipMatchedRef: 'Map the Notion roadmap with Dave' }),
      expected,
    );
    // Explicit dedup kind: identical output.
    assert.equal(
      skipSuffix({ status: 'skipped', skipKind: 'dedup', skipReason: 'dupe_of_ai_003', skipMatchedRef: 'Map the Notion roadmap with Dave' }),
      expected,
    );
  });

  it('renders the dupe [[link]] suffix on a `[ ]` line', () => {
    const meeting: ChecklistMeeting = {
      slug: 'phil-john',
      title: 'Phil / John',
      sections: { actionItems: [ai('ai_002', 'Set up the Notion roadmap meeting')], decisions: [], learnings: [] },
      meta: {
        ai_002: {
          status: 'skipped',
          skipReason: 'dupe_of_2530e74b',
          skipMatchedRef: 'Set up meeting with Philip, Vita, Dave, Lindsay on team structure',
        },
      },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[ \] Set up the Notion roadmap meeting — skip: already captured as \[\[Set up meeting with Philip, Vita, Dave, Lindsay on team structure\]\]  <!-- ai_002@phil-john -->/);
  });

  it('NEVER renders a skip reason on a `[x]` (kept) line', () => {
    // Even with a skipReason+matchedRef in meta, an APPROVED item is `[x]` and
    // must carry NO skip suffix (the reason is only meaningful when skipped).
    const meeting: ChecklistMeeting = {
      slug: 'm',
      title: 'M',
      sections: { actionItems: [ai('ai_001', 'A kept action')], decisions: [], learnings: [] },
      meta: { ai_001: { status: 'approved', skipReason: 'dupe_of_x', skipMatchedRef: 'Some canonical' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] A kept action  <!-- ai_001@m -->/);
    assert.doesNotMatch(out, /skip:/);
    assert.doesNotMatch(out, /already captured/);
  });

  it('FYI (direction:none) items are force-unchecked but carry NO skip reason', () => {
    // FYI items are `[ ]` for visibility, not skipped — they must not be
    // decorated with a skip suffix.
    const meeting: ChecklistMeeting = {
      slug: 'm',
      title: 'M',
      sections: { actionItems: [ai('ai_001', "Phil's third-party action")], decisions: [], learnings: [] },
      meta: { ai_001: { direction: 'none', ownerSlug: 'phil', skipReason: 'should-not-show', skipMatchedRef: 'x' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /#### Others' actions \(FYI\)/);
    assert.doesNotMatch(out, /skip:/);
  });

  it('buildChecklistMeeting reads matchedRef from staged_item_skip_reason frontmatter', () => {
    const content = `---
title: M
staged_item_status:
  ai_001: skipped
staged_item_skip_reason:
  ai_001:
    reason: dupe_of_ai_009
    evidence: "cross-meeting dedup text-hash (canonical in other-meeting)"
    setBy: chef
    setAt: 2026-06-16T22:00:00Z
    matchedRef: The canonical roadmap meeting
---

## Staged Action Items
- ai_001: Set up the roadmap meeting
`;
    const meeting = buildChecklistMeeting(content, { slug: 'm', title: 'M' });
    assert.equal(meeting.meta['ai_001'].skipReason, 'dupe_of_ai_009');
    assert.equal(meeting.meta['ai_001'].skipMatchedRef, 'The canonical roadmap meeting');
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /already captured as \[\[The canonical roadmap meeting\]\]/);
  });
});

describe('owner/direction tag + FYI routing (finding #8)', () => {
  it('ownerTag renders each direction relative to the workspace owner', () => {
    assert.equal(
      ownerTag({ direction: 'i_owe_them', ownerSlug: 'john-koht', counterpartySlug: 'anthony' }),
      '  · (you → @anthony)',
    );
    assert.equal(
      ownerTag({ direction: 'they_owe_me', ownerSlug: 'anthony', counterpartySlug: 'john-koht' }),
      '  · (@anthony → you)',
    );
    assert.equal(
      ownerTag({ direction: 'none', ownerSlug: 'philip' }),
      "  · (@philip's — FYI)",
    );
    // no direction → no tag (decisions/learnings, untyped items)
    assert.equal(ownerTag({}), '');
    assert.equal(ownerTag(undefined), '');
  });

  it('renders the owner/direction suffix on actionable action-item lines', () => {
    const meeting: ChecklistMeeting = {
      slug: 'anthony',
      title: 'Anthony',
      sections: {
        actionItems: [ai('ai_001', 'Send the recipient table'), ai('ai_002', 'Review the spike')],
        decisions: [],
        learnings: [],
      },
      meta: {
        // W4 B-1: elevated so they stay [x] (this test asserts owner-tag
        // rendering + actionable-section routing, not the pre-fill default).
        ai_001: { status: 'pending', elevated: true, direction: 'i_owe_them', ownerSlug: 'john-koht', counterpartySlug: 'anthony' },
        ai_002: { status: 'pending', elevated: true, direction: 'they_owe_me', ownerSlug: 'anthony', counterpartySlug: 'john-koht' },
      },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] Send the recipient table  · \(you → @anthony\)  <!-- ai_001@anthony -->/);
    assert.match(out, /- \[x\] Review the spike  · \(@anthony → you\)  <!-- ai_002@anthony -->/);
    // both stay in the actionable Action items section, none routed to FYI
    assert.match(out, /### Action items/);
    assert.doesNotMatch(out, /Others' actions/);
  });

  it("routes direction:none items into the FYI subsection, NOT pre-filled", () => {
    const meeting: ChecklistMeeting = {
      slug: 'standup',
      title: 'Claim Portal Comms',
      sections: {
        actionItems: [
          ai('ai_001', 'John sends the survey'),
          ai('ai_002', 'Philip updates the portal copy'),
          ai('ai_003', 'Rachael reviews the layout'),
        ],
        decisions: [],
        learnings: [],
      },
      meta: {
        // W4 B-1: ai_001 elevated so it stays [x]; the none-items are
        // force-unchecked FYI regardless of elevation.
        ai_001: { status: 'pending', elevated: true, direction: 'i_owe_them', ownerSlug: 'john-koht', counterpartySlug: 'team' },
        ai_002: { status: 'pending', direction: 'none', ownerSlug: 'philip' },
        ai_003: { status: 'pending', direction: 'none', ownerSlug: 'rachael' },
      },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    // John's item is pre-filled in the actionable list
    assert.match(out, /### Action items\n- \[x\] John sends the survey  · \(you → @team\)  <!-- ai_001@standup -->/);
    // none items live under the FYI heading, unchecked, with their anchors
    assert.match(out, /#### Others' actions \(FYI\)/);
    assert.match(out, /- \[ \] Philip updates the portal copy  · \(@philip's — FYI\)  <!-- ai_002@standup -->/);
    assert.match(out, /- \[ \] Rachael reviews the layout  · \(@rachael's — FYI\)  <!-- ai_003@standup -->/);
    // none items are NOT pre-checked anywhere
    assert.doesNotMatch(out, /- \[x\] Philip/);
    assert.doesNotMatch(out, /- \[x\] Rachael/);
    assert.equal(isOthersAction(meeting.meta.ai_002), true);
    assert.equal(isOthersAction(meeting.meta.ai_001), false);
  });

  it('all-none meeting → empty actionable list, populated FYI', () => {
    const meeting: ChecklistMeeting = {
      slug: 'eng-standup',
      title: 'Eng Standup',
      sections: {
        actionItems: [ai('ai_001', 'Conner deploys'), ai('ai_002', 'Lindsay tests')],
        decisions: [],
        learnings: [],
      },
      meta: {
        ai_001: { status: 'pending', direction: 'none', ownerSlug: 'conner' },
        ai_002: { status: 'pending', direction: 'none', ownerSlug: 'lindsay' },
      },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    // no actionable "### Action items" heading — everything collapsed into FYI
    assert.doesNotMatch(out, /### Action items/);
    assert.match(out, /#### Others' actions \(FYI\)/);
    assert.match(out, /- \[ \] Conner deploys/);
    assert.match(out, /- \[ \] Lindsay tests/);
    assert.doesNotMatch(out, /- \[x\]/);
  });

  it('FYI anchors stay present + recoverable (no apply round-trip regression)', () => {
    const meeting: ChecklistMeeting = {
      slug: 'standup',
      title: 'Standup',
      sections: { actionItems: [ai('ai_002', "Philip's task")], decisions: [], learnings: [] },
      meta: { ai_002: { status: 'pending', direction: 'none', ownerSlug: 'philip' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    const anchorLine = out.split('\n').find((l) => l.includes('ai_002'))!;
    const m = anchorLine.match(ITEM_ANCHOR_RE);
    assert.ok(m, 'FYI line still carries a recoverable item anchor');
    assert.equal(m![1], 'ai_002');
    assert.equal(m![2], 'standup');
    // un-pre-filled means apply (which only acts on [x] lines) ignores it
    assert.match(anchorLine, /^- \[ \]/);
  });

  it('buildChecklistMeeting reads owner/direction from staged_item_owner frontmatter', () => {
    const content = [
      '---',
      'title: Claim Portal Comms',
      // W4 B-1: ai_001 elevated so it stays [x] (this test asserts owner/
      // direction parsing + FYI routing, not the pre-fill default).
      'staged_item_elevated:',
      '  ai_001: true',
      'staged_item_owner:',
      '  ai_001:',
      '    ownerSlug: john-koht',
      '    direction: i_owe_them',
      '    counterpartySlug: anthony',
      '  ai_002:',
      '    ownerSlug: philip',
      '    direction: none',
      '---',
      '',
      '## Staged Action Items',
      '- ai_001: Send the recipient table',
      '- ai_002: Philip updates the portal copy',
    ].join('\n');
    const meeting = buildChecklistMeeting(content, { slug: 'claim-portal', title: 'Claim Portal Comms' });
    assert.equal(meeting.meta.ai_001.direction, 'i_owe_them');
    assert.equal(meeting.meta.ai_001.counterpartySlug, 'anthony');
    assert.equal(meeting.meta.ai_002.direction, 'none');
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] Send the recipient table  · \(you → @anthony\)/);
    assert.match(out, /#### Others' actions \(FYI\)/);
    assert.match(out, /- \[ \] Philip updates the portal copy  · \(@philip's — FYI\)/);
  });

  it('buildChecklistMeeting falls back to inline-text owner notation', () => {
    const content = [
      '---',
      'title: Anthony',
      '---',
      '',
      '## Staged Action Items',
      '- ai_001: [@john-koht → @anthony] Send the recipient table',
      '- ai_002: [@philip ·] Philip updates the portal copy',
    ].join('\n');
    const meeting = buildChecklistMeeting(content, { slug: 'anthony', title: 'Anthony' });
    assert.equal(meeting.meta.ai_001.direction, 'i_owe_them');
    assert.equal(meeting.meta.ai_001.counterpartySlug, 'anthony');
    assert.equal(meeting.meta.ai_002.direction, 'none');
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /· \(you → @anthony\)/);
    assert.match(out, /#### Others' actions \(FYI\)/);
  });
});

describe('prefill semantics (W4 B-1 — conservative-but-confident)', () => {
  it('prefillChecked truth table: only elevated or approved → [x]', () => {
    // The W4 flip: pre-check ONLY what the chef vouched for.
    assert.equal(prefillChecked({ elevated: true }), true); // chef confident keep
    assert.equal(prefillChecked({ status: 'approved' }), true); // post-apply
    assert.equal(prefillChecked({ status: 'pending', tier: 'normal' }), false); // was true pre-W4
    assert.equal(prefillChecked({ status: 'pending' }), false); // bare pending
    assert.equal(prefillChecked({ status: 'skipped' }), false);
    assert.equal(prefillChecked(undefined), false); // no meta — was true pre-W4
    assert.equal(prefillChecked({}), false); // empty meta — nothing vouches
    // elevated wins even when status is pending (the reconcile-time shape).
    assert.equal(prefillChecked({ status: 'pending', elevated: true }), true);
  });

  it('a pending item with no reason renders [ ] with no suffix (N-3: pending ≈ reasonless-skip, intended)', () => {
    const meeting: ChecklistMeeting = {
      slug: 'm',
      title: 'M',
      sections: { actionItems: [ai('ai_001', 'A bare pending action')], decisions: [], learnings: [] },
      meta: { ai_001: { status: 'pending' } },
    };
    const out = renderStagedItemsAsChecklist(meeting);
    // unchecked, with NO skip suffix (no reason) — visually like a reasonless
    // skip, which is the intended N-3 behavior (pending should be rare).
    assert.match(out, /- \[ \] A bare pending action  <!-- ai_001@m -->/);
    assert.doesNotMatch(out, /skip:/);
  });

  it('buildChecklistMeeting reads staged_item_elevated → [x] (B-2 render side)', () => {
    const content = [
      '---',
      'title: M',
      'staged_item_status:',
      '  ai_001: pending',
      'staged_item_elevated:',
      '  ai_001: true',
      '---',
      '',
      '## Staged Action Items',
      '- ai_001: Chef confidently keeps this',
    ].join('\n');
    const meeting = buildChecklistMeeting(content, { slug: 'm', title: 'M' });
    assert.equal(meeting.meta.ai_001.elevated, true);
    assert.equal(meeting.meta.ai_001.status, 'pending');
    const out = renderStagedItemsAsChecklist(meeting);
    assert.match(out, /- \[x\] Chef confidently keeps this  <!-- ai_001@m -->/);
  });

  it('tierMarker maps tiers', () => {
    assert.equal(tierMarker('blocker'), '**[BLOCKER]** ');
    assert.equal(tierMarker('high'), '**[high]** ');
    assert.equal(tierMarker('normal'), '');
    assert.equal(tierMarker(undefined), '');
  });
});

describe('Your-call + actions (W2)', () => {
  it('renders choices with no pre-filled boxes and a recommended marker', () => {
    const out = renderChoices([
      {
        question: '**Recipient-table TDD** — pick one:',
        options: [
          { label: 'collapse ai_007 into acc2a220', key: 'ai_007>acc2a220', recommended: true },
          { label: 'stage ai_007 as fresh', key: 'ai_007:fresh' },
        ],
      },
    ]);
    // both options unchecked
    assert.equal((out.match(/- \[ \]/g) ?? []).length, 2);
    assert.doesNotMatch(out, /- \[x\]/);
    assert.match(out, /\(recommended\)/);
    // anchors recoverable
    const m = out.match(CHOICE_ANCHOR_RE);
    assert.ok(m);
    assert.equal(m![1], 'ai_007>acc2a220');
  });

  it('pre-fills actions from recommend and renders skip reasons', () => {
    const out = renderActions([
      { verb: 'resolve', id: 'd9bee08c', description: 'Resolve d9bee08c', recommend: true, reason: 'done 6/9' },
      { verb: 'resolve', id: 'batch-stale', description: 'Resolve stale batch', recommend: false, reason: 'let me look first' },
    ]);
    assert.match(out, /- \[x\] Resolve d9bee08c — done 6\/9  <!-- act:resolve:d9bee08c -->/);
    assert.match(out, /- \[ \] Resolve stale batch — skip: let me look first  <!-- act:resolve:batch-stale -->/);
    const m = out.match(ACTION_ANCHOR_RE);
    assert.ok(m);
    assert.equal(m![1], 'resolve');
    assert.equal(m![2], 'd9bee08c');
  });

  it('D8: renders an editable action body as an indented fenced block', () => {
    const out = renderActions([
      {
        verb: 'dm',
        id: 'shadowing',
        description: 'DM @nikki + @jenny the shadowing doc',
        recommend: true,
        body: { text: 'Great session today — here is the doc: <link>.\nAdd your name.' },
      },
    ]);
    assert.match(out, /<!-- act:dm:shadowing -->/);
    assert.match(out, /> ```/);
    assert.match(out, /> Great session today — here is the doc: <link>\./);
    assert.match(out, /> Add your name\./);
  });
});

describe('full doc render', () => {
  it('promotes uncertain items into Your-call and orders header → choices → meetings → actions', () => {
    const view: ChecklistView = {
      date: '2026-06-09',
      weekday: 'Tue',
      meetings: [
        {
          slug: 'compliance',
          title: 'Glance 2.0',
          label: 'the P2 gate',
          sections: {
            actionItems: [ai('ai_001', 'Kim drafts guardrails prompt')],
            decisions: [],
            learnings: [le('le_006', 'org-wide wiki')],
          },
          meta: {
            ai_001: { status: 'approved', tier: 'normal' },
            le_006: { uncertainReason: 'org FYI, not your workstream' },
          },
        },
      ],
      choices: [],
      actions: [
        { verb: 'resolve', id: 'd9bee08c', description: 'Resolve d9bee08c', recommend: true },
      ],
    };
    const out = renderWinddownDoc(view);
    const headerIdx = out.indexOf('# Daily Winddown — 2026-06-09 (Tue)');
    const yourCallIdx = out.indexOf('## ⛔ Blockers & ⚠ Your call first');
    const meetingIdx = out.indexOf('## Glance 2.0');
    const actionsIdx = out.indexOf('## Proposed actions');
    assert.ok(headerIdx >= 0 && yourCallIdx > headerIdx && meetingIdx > yourCallIdx && actionsIdx > meetingIdx);
    // uncertain learning promoted, not in a Learnings section
    assert.match(out, /org FYI, not your workstream/);
    assert.doesNotMatch(out, /### Learnings/);
  });

  it('omits empty blocks (no choices, no actions)', () => {
    const view: ChecklistView = {
      date: '2026-06-09',
      meetings: [
        {
          slug: 'm',
          title: 'M',
          sections: { actionItems: [ai('ai_001', 'x')], decisions: [], learnings: [] },
          meta: { ai_001: { status: 'approved' } },
        },
      ],
      choices: [],
      actions: [],
    };
    const out = renderWinddownDoc(view);
    assert.doesNotMatch(out, /Your call first/);
    assert.doesNotMatch(out, /Proposed actions/);
  });
});

// FIX 1 — structural enforcement of the #22 invariant: a superseded item must
// render `[ ]`, NEVER `[x]`, even when its meta would prefill-check it
// (elevated:true) — WITHOUT losing the arc-reason skip suffix. The gate lives on
// `theme.superseded`, SEPARATE from `forceUnchecked`, so the arc survives.
describe('FIX 1 — superseded item is structurally unchecked, arc suffix preserved (#22)', () => {
  it('an elevated+superseded item renders [ ] (NOT [x]) and keeps its arc reason + link', () => {
    const out = renderItemLine(
      de('de_001', 'Send a single recipient model'),
      'anthony',
      {
        status: 'pending',
        elevated: true, // would prefill-check in any non-superseded path
        skipKind: 'superseded',
        skipReason: 'superseded by 15:00 Anthony spec-sync — recipient model changed single → multiple',
        skipMatchedRef: 'de_004@2026-06-18-anthony-spec-sync',
      },
      { theme: { superseded: true } },
    );
    // Structural guard: never [x], even though elevated:true.
    assert.ok(out.startsWith('- [ ] '), `expected unchecked box, got: ${out}`);
    assert.ok(!out.includes('[x]'), 'superseded must never render [x]');
    // Arc reason survives (skip suffix NOT suppressed — theme.superseded does not
    // set forceUnchecked).
    assert.ok(
      out.includes('— superseded by 15:00 Anthony spec-sync — recipient model changed single → multiple → [[de_004@2026-06-18-anthony-spec-sync]]'),
      `arc reason missing from: ${out}`,
    );
    // Body struck through; anchor retained (re-elevatable rescue).
    assert.ok(out.includes('~~Send a single recipient model~~'), 'body should be struck through');
    assert.ok(out.includes('<!-- de_001@anthony -->'), 'anchor must be retained');
    // Full rendered line, for the lead:
    assert.equal(
      out,
      '- [ ] ~~Send a single recipient model~~ — superseded by 15:00 Anthony spec-sync — recipient model changed single → multiple → [[de_004@2026-06-18-anthony-spec-sync]]  <!-- de_001@anthony -->',
    );
  });
});
