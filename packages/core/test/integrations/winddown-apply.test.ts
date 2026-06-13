/**
 * Tests for the winddown apply mapper (W3/W4).
 *
 * Coverage:
 *  - parse: item/choice/action checkboxes + D8 body block
 *  - parse: malformed (anchorless) checkbox lines surfaced
 *  - classify (semantics table — AC3):
 *      approve / skip / user-override / rescue / edited / choice-resolved
 *  - AC1 round-trip: render baseline → apply with NO edits → zero drift
 *  - AC2: every line maps or is reported (unknown anchor / malformed)
 *  - AC4 idempotent re-apply: deps guards → no new mutations
 *  - AC5 summary counts match executed mutations
 *  - AC5b edited action body flows verbatim + echoed in summary
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWinddownDoc,
  buildApplyPlan,
  renderApplySummary,
  executeWinddownApply,
  renderWinddownDoc,
  type WinddownApplyDeps,
  type WinddownApplyResult,
  type ChecklistView,
} from '../../src/index.js';
import type { StagedItem } from '../../src/models/index.js';

function ai(id: string, text: string): StagedItem {
  return { id, text, type: 'ai', source: 'ai' };
}
function le(id: string, text: string): StagedItem {
  return { id, text, type: 'le', source: 'ai' };
}

// A recording fake deps that also models idempotency guards.
function makeDeps(opts?: { alreadyApprovedMeetings?: Set<string>; resolvedCommitments?: Set<string> }) {
  const calls = {
    setItemStatus: [] as Array<{ slug: string; id: string; status: string; editedText?: string; skipReason?: string }>,
    commitMeeting: [] as string[],
    resolveCommitment: [] as string[],
    createCommitment: [] as string[],
    draftAction: [] as Array<{ verb: string; id: string; body?: string }>,
  };
  const approvedMeetings = opts?.alreadyApprovedMeetings ?? new Set<string>();
  const resolved = opts?.resolvedCommitments ?? new Set<string>();
  const deps: WinddownApplyDeps = {
    async setItemStatus(slug, id, status, o) {
      // idempotency: an already-approved meeting refuses further status writes
      if (approvedMeetings.has(slug)) return;
      calls.setItemStatus.push({ slug, id, status, editedText: o?.editedText, skipReason: o?.skipReason });
    },
    async commitMeeting(slug) {
      if (approvedMeetings.has(slug)) return 'already-applied' as const; // no-op
      calls.commitMeeting.push(slug);
      approvedMeetings.add(slug);
      return 'committed' as const;
    },
    async resolveCommitment(id) {
      if (resolved.has(id)) return 'already-resolved';
      resolved.add(id);
      calls.resolveCommitment.push(id);
      return 'resolved';
    },
    async createCommitment(text) {
      calls.createCommitment.push(text);
    },
    async draftAction(verb, id, body) {
      calls.draftAction.push({ verb, id, body });
    },
  };
  return { deps, calls, approvedMeetings, resolved };
}

const BASELINE = [
  '# Daily Winddown — 2026-06-09 (Tue)   ·   review & apply',
  '',
  '## Anthony / John Weekly',
  '',
  '### Action items',
  '- [x] Set up tech spike  <!-- ai_004@anthony -->',
  '- [ ] Confirm consolidation rules — skip: answered later  <!-- ai_006@anthony -->',
  '',
  '## Proposed actions   (cross-cutting — same check-to-do)',
  '',
  '- [x] Resolve d9bee08c — done 6/9  <!-- act:resolve:d9bee08c -->',
  '- [x] DM @nikki + @jenny the shadowing doc  <!-- act:dm:shadowing -->',
  '      > _edit before apply — used verbatim:_',
  '      > ```',
  '      > Great session today — here is the doc: <link>.',
  '      > Add your name.',
  '      > ```',
  '- [ ] Resolve batch-stale — skip: let me look first  <!-- act:resolve:batch-stale -->',
].join('\n');

describe('parse', () => {
  it('parses item / action checkboxes and a D8 body', () => {
    const doc = parseWinddownDoc(BASELINE);
    assert.equal(doc.byAnchor.get('ai_004@anthony')!.checked, true);
    assert.equal(doc.byAnchor.get('ai_006@anthony')!.checked, false);
    assert.equal(doc.byAnchor.get('ai_006@anthony')!.text, 'Confirm consolidation rules');
    const dm = doc.byAnchor.get('act:dm:shadowing')!;
    assert.equal(dm.kind, 'action');
    assert.equal(dm.body, 'Great session today — here is the doc: <link>.\nAdd your name.');
  });

  it('surfaces malformed (anchorless) checkbox lines', () => {
    const doc = parseWinddownDoc('- [x] orphan with no anchor\n- [ ] another orphan');
    assert.equal(doc.malformed.length, 2);
  });
});

describe('classify — semantics table (AC3)', () => {
  it('approve: [x] stays [x]', () => {
    const plan = buildApplyPlan('2026-06-09', BASELINE, BASELINE);
    const it = plan.items.find((i) => i.itemId === 'ai_004')!;
    assert.equal(it.decision, 'approve');
    assert.equal(it.edited, false);
  });

  it('skip: agent [ ] stays [ ]', () => {
    const plan = buildApplyPlan('2026-06-09', BASELINE, BASELINE);
    const it = plan.items.find((i) => i.itemId === 'ai_006')!;
    assert.equal(it.decision, 'skip');
  });

  it('user-override: user unchecks an [x] → skip (user-rejected)', () => {
    const edited = BASELINE.replace('- [x] Set up tech spike', '- [ ] Set up tech spike');
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const it = plan.items.find((i) => i.itemId === 'ai_004')!;
    assert.equal(it.decision, 'user-override');
  });

  it('rescue: user checks a [ ] → approve override', () => {
    const edited = BASELINE.replace(
      '- [ ] Confirm consolidation rules — skip: answered later',
      '- [x] Confirm consolidation rules — skip: answered later',
    );
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const it = plan.items.find((i) => i.itemId === 'ai_006')!;
    assert.equal(it.decision, 'rescue');
  });

  it('edited: text changed, anchor intact → amendment', () => {
    const edited = BASELINE.replace('Set up tech spike', 'Set up tech spike with Nick + James');
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const it = plan.items.find((i) => i.itemId === 'ai_004')!;
    assert.equal(it.edited, true);
    assert.equal(it.editedText, 'Set up tech spike with Nick + James');
    assert.equal(it.decision, 'approve');
  });

  it('S1: an edit containing " — skip: " round-trips verbatim (not truncated)', async () => {
    // The user rewrote an approved item's text to legitimately contain the
    // decoration sentinel. Pre-fix `cleanText` truncated it at " — skip: ".
    const edited = BASELINE.replace(
      '- [x] Set up tech spike  <!-- ai_004@anthony -->',
      '- [x] Tell Bob — skip: the friday call  <!-- ai_004@anthony -->',
    );
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const it = plan.items.find((i) => i.itemId === 'ai_004')!;
    assert.equal(it.edited, true);
    assert.equal(it.editedText, 'Tell Bob — skip: the friday call');
    assert.equal(it.decision, 'approve');

    // …and the confirm summary echoes the full edited text verbatim.
    const summary = renderApplySummary(plan);
    assert.match(summary, /Tell Bob — skip: the friday call/);

    // …and the executed staged edit carries the verbatim text.
    const { deps, calls } = makeDeps();
    await executeWinddownApply(plan, deps);
    const w = calls.setItemStatus.find((c) => c.id === 'ai_004')!;
    assert.equal(w.editedText, 'Tell Bob — skip: the friday call');
  });
});

describe('AC1 round-trip: no edits → zero drift', () => {
  it('render → apply with NO toggles reproduces agent recommendation', async () => {
    const view: ChecklistView = {
      date: '2026-06-09',
      meetings: [
        {
          slug: 'anthony',
          title: 'Anthony',
          sections: { actionItems: [ai('ai_004', 'Set up tech spike'), ai('ai_006', 'Confirm rules')], decisions: [], learnings: [] },
          meta: { ai_004: { status: 'approved' }, ai_006: { status: 'skipped', skipReason: 'answered later' } },
        },
      ],
      choices: [],
      actions: [{ verb: 'resolve', id: 'd9bee08c', description: 'Resolve d9bee08c', recommend: true }],
    };
    const baseline = renderWinddownDoc(view);
    const plan = buildApplyPlan('2026-06-09', baseline, baseline);
    assert.equal(plan.warnings.length, 0);
    assert.equal(plan.items.find((i) => i.itemId === 'ai_004')!.decision, 'approve');
    assert.equal(plan.items.find((i) => i.itemId === 'ai_006')!.decision, 'skip');
    assert.equal(plan.items.every((i) => !i.edited), true);
    const { deps, calls } = makeDeps();
    const res = await executeWinddownApply(plan, deps);
    assert.equal(res.approvedItems, 1);
    assert.equal(res.skippedItems, 1);
    assert.equal(res.resolvedCommitments.length, 1);
    assert.equal(calls.commitMeeting.length, 1);
  });
});

describe('AC2: every line maps or is reported', () => {
  it('unknown anchor (not in baseline) → warning, not applied', () => {
    const edited = BASELINE + '\n- [x] sneaky new item  <!-- ai_999@anthony -->';
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    assert.ok(plan.warnings.some((w) => w.includes('ai_999@anthony')));
    assert.equal(plan.items.find((i) => i.itemId === 'ai_999'), undefined);
  });

  it('malformed anchorless line → warning', () => {
    const edited = BASELINE + '\n- [x] no anchor here';
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    assert.ok(plan.warnings.some((w) => w.includes('malformed')));
  });
});

describe('AC4: idempotent re-apply', () => {
  it('re-applying over an already-committed meeting mutates nothing new', async () => {
    const plan = buildApplyPlan('2026-06-09', BASELINE, BASELINE);
    const shared = makeDeps();
    const first = await executeWinddownApply(plan, shared.deps);
    assert.equal(first.meetingsCommitted.length, 1);
    assert.equal(first.resolvedCommitments.length, 1);
    // Re-run with the SAME deps (meeting now approved, commitment now resolved).
    const second = await executeWinddownApply(plan, shared.deps);
    assert.equal(second.meetingsCommitted.length, 0, 'no re-commit');
    assert.equal(second.resolvedCommitments.length, 0, 'no re-resolve');
    assert.equal(second.alreadyResolved.length, 1, 'R7 guard reports already-resolved');
    assert.equal(shared.calls.setItemStatus.length, first.approvedItems + first.skippedItems, 'no new status writes on re-run');
  });
});

describe('AC5 + AC5b: summary matches mutations + edited body verbatim', () => {
  it('edited DM body flows verbatim and is echoed in the summary', async () => {
    const edited = BASELINE.replace(
      '      > Add your name.',
      '      > Add your name, dates, and expertise.',
    );
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const dm = plan.actions.find((a) => a.verb === 'dm')!;
    assert.equal(dm.bodyEdited, true);
    assert.equal(dm.body, 'Great session today — here is the doc: <link>.\nAdd your name, dates, and expertise.');

    const summary = renderApplySummary(plan);
    assert.match(summary, /✉ dm:shadowing final text \(edited\)/);
    assert.match(summary, /Add your name, dates, and expertise\./);

    const { deps, calls } = makeDeps();
    const res = await executeWinddownApply(plan, deps);
    // The drafted action received the EXACT edited body.
    const drafted = calls.draftAction.find((d) => d.verb === 'dm')!;
    assert.equal(drafted.body, 'Great session today — here is the doc: <link>.\nAdd your name, dates, and expertise.');
    assert.equal(res.draftedActions, 1);
  });

  it('summary counts equal executed mutation counts', async () => {
    // unchecked ai_004 (override), rescued ai_006, edited ai_004 text
    let edited = BASELINE
      .replace('- [x] Set up tech spike', '- [ ] Set up tech spike with Nick')
      .replace(
        '- [ ] Confirm consolidation rules — skip: answered later',
        '- [x] Confirm consolidation rules — skip: answered later',
      );
    const plan = buildApplyPlan('2026-06-09', BASELINE, edited);
    const summary = renderApplySummary(plan);
    assert.match(summary, /↑ 1 rescued/);
    assert.match(summary, /↓ 1 user-rejected/);

    const { deps, calls } = makeDeps();
    const res = await executeWinddownApply(plan, deps);
    assert.equal(res.rescuedItems, 1);
    assert.equal(res.overriddenItems, 1);
    // user-override write carried the user-rejected skip reason
    const overrideWrite = calls.setItemStatus.find((c) => c.id === 'ai_004')!;
    assert.equal(overrideWrite.status, 'skipped');
    assert.equal(overrideWrite.skipReason, 'user-rejected');
  });
});

describe('choice resolution', () => {
  it('a chosen keep/skip choice key drives the underlying item', async () => {
    const baseline = [
      '## ⛔ Blockers & ⚠ Your call first   (decide these — not pre-filled)',
      '',
      '⚠ **le_001 Customer validates pricing** — keep or skip?',
      '   - [ ] keep (stage it)   <!-- choice:le_001@cust:keep -->',
      '   - [ ] skip   <!-- choice:le_001@cust:skip -->',
    ].join('\n');
    const edited = baseline.replace(
      '   - [ ] keep (stage it)   <!-- choice:le_001@cust:keep -->',
      '   - [x] keep (stage it)   <!-- choice:le_001@cust:keep -->',
    );
    const plan = buildApplyPlan('2026-06-09', baseline, edited);
    const chosen = plan.choices.filter((c) => c.chosen);
    assert.equal(chosen.length, 1);
    assert.equal(chosen[0].choiceKey, 'le_001@cust:keep');

    const { deps, calls } = makeDeps();
    const res = await executeWinddownApply(plan, deps);
    assert.equal(res.choicesResolved, 1);
    const w = calls.setItemStatus.find((c) => c.id === 'le_001')!;
    assert.equal(w.status, 'approved');
    assert.equal(w.slug, 'cust');
  });

  it('S2: a non-item choice is handed off (DRAFT choice:<key>), NOT executed-resolved', async () => {
    const baseline = [
      '## ⛔ Blockers & ⚠ Your call first   (decide these — not pre-filled)',
      '',
      '⚠ **Mirror ai_007 into the shadowing thread?**',
      '   - [ ] yes — collapse into acc2a220   <!-- choice:ai_007>acc2a220 -->',
    ].join('\n');
    const edited = baseline.replace(
      '   - [ ] yes — collapse into acc2a220   <!-- choice:ai_007>acc2a220 -->',
      '   - [x] yes — collapse into acc2a220   <!-- choice:ai_007>acc2a220 -->',
    );
    const plan = buildApplyPlan('2026-06-09', baseline, edited);
    const chosen = plan.choices.filter((c) => c.chosen);
    assert.equal(chosen.length, 1);
    assert.equal(chosen[0].choiceKey, 'ai_007>acc2a220');

    // Summary wording: "recorded (chef will execute)", NOT "resolved as marked".
    const summary = renderApplySummary(plan);
    assert.match(summary, /recorded \(chef will execute\)/);
    assert.doesNotMatch(summary, /resolved as marked/);

    const { deps, calls } = makeDeps();
    const res = await executeWinddownApply(plan, deps);
    // Handed off as a DRAFT choice:<key>, never executed as an item decision.
    assert.equal(res.choicesResolved, 0, 'non-item choice is NOT executed-resolved');
    assert.equal(res.choicesRecorded, 1, 'counted as chef hand-off');
    const handoff = calls.draftAction.find((d) => d.verb === 'choice')!;
    assert.ok(handoff, 'a DRAFT choice hand-off was emitted');
    assert.equal(handoff.id, 'ai_007>acc2a220');
    assert.equal(calls.setItemStatus.length, 0, 'no item primitive ran');
    assert.equal(calls.commitMeeting.length, 0, 'no meeting committed');
  });
});
