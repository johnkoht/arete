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
        ai_001: { status: 'pending', tier: 'blocker' },
        de_001: { status: 'pending', tier: 'high' },
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

describe('prefill semantics', () => {
  it('[x] keep, [ ] skip, pending+tier → [x]', () => {
    assert.equal(prefillChecked({ status: 'approved' }), true);
    assert.equal(prefillChecked({ status: 'skipped' }), false);
    assert.equal(prefillChecked({ status: 'pending', tier: 'normal' }), true);
    assert.equal(prefillChecked(undefined), true);
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
