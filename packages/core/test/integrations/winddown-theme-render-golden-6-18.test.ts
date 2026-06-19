/**
 * Layer-2 GOLDEN REPLAY — the 6/18 status-letter day
 * (theme-render v1 COARSE — `dev/work/plans/theme-render/plan.md`;
 * expected output = `dev/work/plans/theme-render/MOCK.md`).
 *
 * This is the canonical regression harness for the chef-judgment layers
 * (assignment + supersession + moot). Judgment CANNOT be unit-tested
 * deterministically, so — exactly as the CHR plan prescribes — the worked 6/18
 * example is replayed with the chef's verdict PRE-ENCODED into the fixture:
 *
 *   - each meeting already carries its assigned `theme` (the Step-2.0 coarse
 *     assignment), so clustering is exercised, not the LLM that assigned it;
 *   - the morning decisions already carry a `supersededSkipReason(...)` (the
 *     chef's "latest wins" verdict pointing at the afternoon winners);
 *   - the moot action already carries a plain skip-reason;
 *   - the afternoon winners are already `elevated:true`.
 *
 * The test then asserts the DETERMINISTIC cluster→render pipeline REPRODUCES the
 * MOCK structure + the AC contracts. No API spend; committed as a normal test.
 *
 * AC coverage map (see plan §Acceptance criteria):
 *   - AC1 supersession-by-construction → "AC1 …" tests below
 *   - AC2 moot                         → "AC2 …"
 *   - AC3 count conservation           → "AC3 …"
 *   - AC4 assignment accuracy          → LAYER-3 SOAK metric — NOT unit-tested
 *                                         (would require running the live chef;
 *                                          the fixture pre-encodes assignment).
 *   - AC5 false-supersession guard     → "AC5 …" (the different-facet case)
 *   - AC6 apply-unchanged + byte-id    → "AC6 …"
 *   - AC7 no-regression rollback       → "AC7 …" (checklist render unchanged)
 *   - AC8 latency ≤ +20%               → LAYER-3 SOAK metric — NOT unit-tested.
 *
 * Strategy note (report item #3): the render emits chef-authored prose
 * (per-theme reasoning, the Lindsay callout, the §Notes body) only when the
 * caller supplies it; the deterministic module renders STRUCTURE. A full
 * byte-for-byte doc-diff against MOCK.md would therefore be testing hand-typed
 * prose + cosmetic whitespace, which is brittle and not what Gate-3 guards. So
 * this suite asserts the load-bearing STRUCTURE (the AC contracts) and pins a
 * golden-doc SNAPSHOT of the structural skeleton (headings, checkbox states,
 * arc, anchors) for eyeballing — see the final "golden doc snapshot" test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderThemeView,
  buildThemeView,
} from '../../src/integrations/winddown-theme-render.js';
import {
  supersededSkipReason,
} from '../../src/integrations/winddown-theme-cluster.js';
import {
  renderItemLine,
  renderStagedItemsAsChecklist,
  type ChecklistMeeting,
  type ChecklistItemMeta,
} from '../../src/integrations/winddown-checklist.js';
import {
  parseWinddownDoc,
  buildApplyPlan,
} from '../../src/integrations/winddown-apply.js';
import type { StagedItem } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Fixture helpers (same style as winddown-theme-render.test.ts)
// ---------------------------------------------------------------------------

function ai(id: string, text: string): StagedItem {
  return { id, text, type: 'ai', source: 'ai' };
}
function de(id: string, text: string): StagedItem {
  return { id, text, type: 'de', source: 'ai' };
}
function le(id: string, text: string): StagedItem {
  return { id, text, type: 'le', source: 'ai' };
}
function mtg(over: Partial<ChecklistMeeting> & { slug: string }): ChecklistMeeting {
  return {
    slug: over.slug,
    title: over.title ?? over.slug,
    label: over.label,
    sections: over.sections ?? { actionItems: [], decisions: [], learnings: [] },
    meta: over.meta ?? {},
  };
}

/**
 * Translate a Gate-1 `supersededSkipReason(...)` (a `StagedItemSkipReasonMeta`
 * with `reason`/`matchedRef`/`kind`) into the per-item `ChecklistItemMeta`
 * overlay (`skipReason`/`skipMatchedRef`/`skipKind`) — EXACTLY the mapping
 * `buildChecklistMeeting` does from frontmatter (winddown-checklist.ts:655-658).
 * Using the real helper proves the Gate-1 arc-metadata producer feeds the W3
 * render unchanged (the live path: chef writes `staged_item_skip_reason`, the
 * view builder maps it to this overlay).
 */
function supersededMeta(supersededByRef: string, why: string, ctx: string): ChecklistItemMeta {
  const r = supersededSkipReason(supersededByRef, why, ctx);
  return { skipReason: r.reason, skipMatchedRef: r.matchedRef, skipKind: r.kind };
}

// Meeting slugs — exactly the MOCK anchors (`<!-- de_001@<slug> -->`).
const JAMIE = '2026-06-18-john-jamie-status-letter';
const GENESYS = '2026-06-18-genesys-sync';
const LINDSAY = '2026-06-18-lindsay-1-1';
const ANTHONY = '2026-06-18-anthony-spec-sync';
const ORPHAN = '2026-06-18-lindsay-tangent';

// ---------------------------------------------------------------------------
// THE 6/18 FIXTURE — the four real meetings + the orphan, chef verdict baked in.
//
// status-letter-automation: morning Jamie 1:1 (09:30) sets single-recipient +
// dynamic-only; afternoon Anthony spec-sync (15:00) reverses them. The morning
// decisions carry a supersededSkipReason pointing at the afternoon winners; the
// "hold an afternoon session" action carries a MOOT skip. The afternoon winners
// are elevated:true.
// ---------------------------------------------------------------------------

function jamie11(): ChecklistMeeting {
  return mtg({
    slug: JAMIE,
    title: 'Jamie 1:1',
    label: '09:30 Jamie 1:1',
    sections: {
      actionItems: [ai('ai_003', 'Hold an afternoon session to finalize the recipient model')],
      decisions: [
        de('de_001', 'Single recipient per status letter (recipient FK on the letter row)'),
        de('de_002', 'Letters are dynamic-only (no static snapshot stored)'),
      ],
      learnings: [],
    },
    meta: {
      // de_001 / de_002: SUPERSEDED by the 15:00 spec-sync (chef verdict). Never
      // elevated → renders [ ]; anchor retained for rescue (AC5).
      de_001: supersededMeta(
        `de_004@${ANTHONY}`,
        'recipient model changed single → multiple',
        '15:00 spec-sync',
      ),
      de_002: supersededMeta(
        `de_005@${ANTHONY}`,
        "Anthony's spec stores a rendered snapshot per send",
        '15:00 spec-sync',
      ),
      // ai_003: MOOT — the afternoon session it proposed already happened.
      // Plain skip (skipKind defaults to dedup/none → "skip:" framing), NOT a
      // supersession. Never elevated.
      ai_003: {
        skipReason: 'moot, the 15:00 Anthony spec-sync already happened and finalized it',
      },
    },
  });
}

function genesys(): ChecklistMeeting {
  return mtg({
    slug: GENESYS,
    title: 'Genesys cutover sync',
    label: '11:00 Genesys sync',
    sections: {
      actionItems: [
        ai('ai_004', 'File the change-freeze ticket with infra'),
        ai('ai_007', 'Confirm the rollback runbook is current'),
      ],
      decisions: [de('de_003', 'Cut over the IVR flows the weekend of 6/27 (freeze window Fri 18:00)')],
      learnings: [],
    },
    meta: {
      de_003: { elevated: true, direction: 'i_owe_them' },
      ai_004: { elevated: true, direction: 'i_owe_them', counterpartySlug: 'infra' },
      // ai_007: standing item, your call — no elevation → [ ], no skip reason.
      ai_007: {},
    },
  });
}

function lindsay(): ChecklistMeeting {
  return mtg({
    slug: LINDSAY,
    title: 'Lindsay 1:1',
    label: '14:00 Lindsay 1:1',
    sections: {
      actionItems: [ai('ai_008', 'Send Lindsay the Glance-2 timeline by Thursday')],
      decisions: [de('de_007', 'Lindsay owns the Glance-2 rollout comms going forward')],
      learnings: [],
    },
    meta: {
      de_007: { elevated: true },
      ai_008: { elevated: true, direction: 'i_owe_them', counterpartySlug: 'lindsay' },
    },
  });
}

function anthony(): ChecklistMeeting {
  return mtg({
    slug: ANTHONY,
    title: 'Anthony spec-sync',
    label: '15:00 Anthony spec-sync',
    sections: {
      actionItems: [
        ai('ai_005', 'Draft the join-table migration (recipients + per-send snapshot)'),
        ai('ai_006', 'Anthony to confirm the snapshot retention window'),
      ],
      decisions: [
        de('de_004', 'Status letters use a join table for recipients (multiple recipients per letter), not a single FK'),
        de('de_005', 'Snapshot the rendered letter at send time (audit + resend fidelity)'),
        de('de_006', 'Rename the feature status-letter → status-report across schema + UI'),
      ],
      learnings: [le('le_002', 'The recipient model was contested all day; the spec-sync is the source of truth, not the morning 1:1')],
    },
    meta: {
      // de_004 is the WINNER; it SUPERSEDES the morning de_001 — the inline
      // `⤴ supersedes` arc on the winner mirrors the MOCK.
      de_004: { elevated: true, links: { supersedes: `de_001@${JAMIE}` } },
      de_005: { elevated: true },
      de_006: { elevated: true },
      ai_005: { elevated: true, direction: 'i_owe_them' },
      // ai_006: Anthony → you, third-party FYI (direction:none). Never John's
      // pre-filled to-do; force-unchecked even if mis-elevated.
      ai_006: { direction: 'none', ownerSlug: 'anthony' },
      le_002: { elevated: true },
    },
  });
}

function orphan(): ChecklistMeeting {
  // A separate UNASSIGNED meeting (the Lindsay tangent) → Uncategorized. Modeled
  // as its own meeting (not a Lindsay item) because v1 is meeting-level coarse:
  // a meeting routes wholesale to one theme, so the orphan item must live in a
  // meeting with no theme to land in Uncategorized (count-conservation honest).
  return mtg({
    slug: ORPHAN,
    title: 'Lindsay 1:1 (tangent)',
    label: '14:00 Lindsay 1:1, tangent',
    sections: {
      actionItems: [ai('ai_009', 'Explore a shared "comms calendar" for cross-team launches')],
      decisions: [],
      learnings: [],
    },
    meta: { ai_009: {} },
  });
}

/** The full 6/18 cluster inputs, with the chef's coarse assignment baked in. */
function golden618Inputs() {
  return [
    { meeting: jamie11(), theme: 'status-letter-automation', timeIso: '2026-06-18T09:30:00.000Z' },
    { meeting: genesys(), theme: 'genesys-migration', timeIso: '2026-06-18T11:00:00.000Z' },
    { meeting: lindsay(), theme: 'areas/engineering-management', timeIso: '2026-06-18T14:00:00.000Z' },
    { meeting: anthony(), theme: 'status-letter-automation', timeIso: '2026-06-18T15:00:00.000Z' },
    { meeting: orphan(), theme: '', timeIso: '2026-06-18T14:05:00.000Z' },
  ];
}

const THEME_META = {
  'status-letter-automation': {
    headingPrefix: '📋',
    reasoning:
      '3 sessions today (Jamie 09:30 → Anthony 15:00). The afternoon spec-sync reversed the morning recipient model — latest wins; the morning decisions are shown superseded, not committed.',
  },
  'genesys-migration': {
    headingPrefix: '📋',
    reasoning: '1 session (11:00 Genesys cutover sync). No supersession — straightforward.',
  },
  'areas/engineering-management': {
    headingPrefix: '🗂',
    reasoning:
      '1 session (14:00 Lindsay 1:1). Coarse v1: the whole 1:1 lands here as its dominant theme even though it also touched status-letters + Glance — item-level split is v2.',
    callout:
      'This 1:1 also touched **status-letter-automation** (Lindsay asked about recipient scope) — in v1 coarse those items stay here under the meeting dominant theme.',
  },
};

function golden618Doc(): string {
  const view = buildThemeView(golden618Inputs(), {
    date: '2026-06-18',
    themeMeta: THEME_META,
    notes:
      '- **Count check:** 15 staged items in → 15 rendered. None dropped, none duplicated. ✅',
  });
  return renderThemeView(view);
}

// ===========================================================================
// AC1 — supersession by construction (the #22 fixture)
// ===========================================================================

describe('golden 6/18 — AC1 supersession by construction', () => {
  it('morning de_001/de_002 render [ ] struck-through with the arc + link to the winner', () => {
    const doc = golden618Doc();
    // de_001: unchecked, struck-through, arc reason + link to the afternoon winner.
    assert.match(
      doc,
      /- \[ \] ~~Single recipient per status letter \(recipient FK on the letter row\)~~/,
    );
    assert.match(doc, /superseded by 15:00 spec-sync — recipient model changed single → multiple/);
    assert.match(doc, new RegExp(`\\[\\[de_004@${ANTHONY}\\]\\]`));
    assert.match(doc, new RegExp(`<!-- de_001@${JAMIE} -->`));
    // de_002: same treatment, links to de_005.
    assert.match(doc, /- \[ \] ~~Letters are dynamic-only \(no static snapshot stored\)~~/);
    assert.match(doc, new RegExp(`\\[\\[de_005@${ANTHONY}\\]\\]`));
  });

  it('NO superseded item is pre-elevated [x]', () => {
    const doc = golden618Doc();
    // The two morning decisions must never be checked.
    assert.doesNotMatch(doc, /- \[x\] ~~Single recipient per status letter/);
    assert.doesNotMatch(doc, /- \[x\] ~~Letters are dynamic-only/);
  });

  it('the afternoon winners de_004/de_005/de_006 are the elevated [x] ones', () => {
    const doc = golden618Doc();
    assert.match(doc, /- \[x\] Status letters use a join table for recipients/);
    assert.match(doc, /- \[x\] Snapshot the rendered letter at send time/);
    assert.match(doc, /- \[x\] Rename the feature status-letter → status-report/);
  });

  it('the arc is visible INLINE (winner carries `⤴ supersedes`, loser sits under it struck-through)', () => {
    const doc = golden618Doc();
    // winner's inline supersedes annotation (linkSuffix from staged_item_links)
    assert.match(doc, new RegExp(`⤴ supersedes de_001@${JAMIE}`));
    // and the loser appears AFTER the winner within the same Decisions block —
    // the flip lives where the decision lives (D6), not in a trailing block.
    const winnerIdx = doc.indexOf('Status letters use a join table');
    const loserIdx = doc.indexOf('~~Single recipient per status letter');
    assert.ok(winnerIdx >= 0 && loserIdx >= 0);
    // both under the same status-letter heading, before genesys-migration
    const genesysIdx = doc.indexOf('genesys-migration');
    assert.ok(winnerIdx < genesysIdx && loserIdx < genesysIdx, 'arc lives inside status-letter section');
  });
});

// ===========================================================================
// AC2 — moot still fires
// ===========================================================================

describe('golden 6/18 — AC2 moot', () => {
  it('ai_003 ("hold afternoon session") renders [ ] skipped (moot), not elevated', () => {
    const doc = golden618Doc();
    assert.match(
      doc,
      /- \[ \] Hold an afternoon session to finalize the recipient model .* — skip: moot, the 15:00 Anthony spec-sync already happened/,
    );
    assert.doesNotMatch(doc, /- \[x\] Hold an afternoon session/);
    // moot is a PLAIN skip, NOT a supersession → no strikethrough, no `⤴`.
    assert.doesNotMatch(doc, /~~Hold an afternoon session/);
    assert.match(doc, new RegExp(`<!-- ai_003@${JAMIE} -->`));
  });
});

// ===========================================================================
// AC3 — count conservation (the single most important AC)
// ===========================================================================

describe('golden 6/18 — AC3 count conservation', () => {
  // The full staged set across all five meetings: 15 items.
  const EXPECTED_ANCHORS = [
    // Jamie 1:1 (3): the moot action + the two superseded decisions
    `ai_003@${JAMIE}`,
    `de_001@${JAMIE}`,
    `de_002@${JAMIE}`,
    // Genesys (3)
    `ai_004@${GENESYS}`,
    `ai_007@${GENESYS}`,
    `de_003@${GENESYS}`,
    // Lindsay (2)
    `ai_008@${LINDSAY}`,
    `de_007@${LINDSAY}`,
    // Anthony (6)
    `ai_005@${ANTHONY}`,
    `ai_006@${ANTHONY}`,
    `de_004@${ANTHONY}`,
    `de_005@${ANTHONY}`,
    `de_006@${ANTHONY}`,
    `le_002@${ANTHONY}`,
    // Uncategorized orphan (1)
    `ai_009@${ORPHAN}`,
  ];

  it('every staged item appears EXACTLY ONCE in the rendered doc (incl. superseded/moot/Uncategorized)', () => {
    const doc = golden618Doc();
    const anchors = [
      ...doc.matchAll(/<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/g),
    ].map((m) => `${m[1]}@${m[2]}`);

    assert.equal(anchors.length, EXPECTED_ANCHORS.length, '15 items in → 15 anchors out');
    assert.deepEqual([...anchors].sort(), [...EXPECTED_ANCHORS].sort());
    assert.equal(new Set(anchors).size, anchors.length, 'no duplicate anchors');
  });

  it('the superseded + moot + Uncategorized items are present (not silently dropped)', () => {
    const doc = golden618Doc();
    for (const a of [`de_001@${JAMIE}`, `de_002@${JAMIE}`, `ai_003@${JAMIE}`, `ai_009@${ORPHAN}`]) {
      assert.ok(doc.includes(`<!-- ${a} -->`), `${a} present`);
    }
  });
});

// ===========================================================================
// AC5 — false-supersession guard (the silent-loss twin of AC1)
// ===========================================================================

describe('golden 6/18 — AC5 false-supersession guard (different facet)', () => {
  // A later item refines a DIFFERENT FACET of status-letter-automation (the
  // retention window — orthogonal to the recipient model), NOT a reversal. Both
  // must survive; NEITHER may be marked superseded.
  function differentFacetInputs() {
    const morning = mtg({
      slug: JAMIE,
      label: '09:30 Jamie 1:1',
      sections: {
        actionItems: [],
        decisions: [de('de_010', 'Status letters render in the recipient locale')],
        learnings: [],
      },
      // NOT superseded — a standing facet decision, elevated as a genuine keep.
      meta: { de_010: { elevated: true } },
    });
    const afternoon = mtg({
      slug: ANTHONY,
      label: '15:00 Anthony spec-sync',
      sections: {
        actionItems: [],
        // Refines a DIFFERENT facet (retention) — does not touch locale.
        decisions: [de('de_011', 'Snapshot retention window is 90 days')],
        learnings: [],
      },
      meta: { de_011: { elevated: true } },
    });
    return [
      { meeting: morning, theme: 'status-letter-automation', timeIso: '2026-06-18T09:30:00.000Z' },
      { meeting: afternoon, theme: 'status-letter-automation', timeIso: '2026-06-18T15:00:00.000Z' },
    ];
  }

  it('BOTH survive, NEITHER marked superseded, BOTH elevated [x]', () => {
    const view = buildThemeView(differentFacetInputs(), { date: '2026-06-18' });
    const doc = renderThemeView(view);
    // both elevated, both checked
    assert.match(doc, /- \[x\] Status letters render in the recipient locale/);
    assert.match(doc, /- \[x\] Snapshot retention window is 90 days/);
    // neither struck through, neither carries a superseded arc
    assert.doesNotMatch(doc, /~~Status letters render in the recipient locale~~/);
    assert.doesNotMatch(doc, /~~Snapshot retention window is 90 days~~/);
    assert.doesNotMatch(doc, /superseded/);
    // both anchors present (count conservation holds here too)
    assert.match(doc, new RegExp(`<!-- de_010@${JAMIE} -->`));
    assert.match(doc, new RegExp(`<!-- de_011@${ANTHONY} -->`));
  });

  it('superseded items carry their anchor so a wrong supersession is re-elevatable (rescue path)', () => {
    // From the REAL 6/18 doc: the superseded de_001 keeps its anchor + renders
    // [ ], so a user re-check ([ ]→[x]) classifies as a `rescue` via apply.
    const doc = golden618Doc();
    assert.match(doc, new RegExp(`- \\[ \\] ~~Single recipient.*<!-- de_001@${JAMIE} -->`, 's'));
    // prove the rescue diff: take the baseline doc, re-check de_001 in the edit.
    const editLine = (line: string) =>
      line.includes(`<!-- de_001@${JAMIE} -->`) ? line.replace('- [ ]', '- [x]') : line;
    const edited = doc.split('\n').map(editLine).join('\n');
    const plan = buildApplyPlan('2026-06-18', doc, edited);
    const de001 = plan.items.find((i) => i.itemId === 'de_001' && i.meetingSlug === JAMIE);
    assert.ok(de001, 'de_001 classified');
    assert.equal(de001!.decision, 'rescue', 're-checking a superseded item rescues it');
  });
});

// ===========================================================================
// AC6 — apply unchanged + anchors byte-identical
// ===========================================================================

describe('golden 6/18 — AC6 apply unchanged + anchor byte-identity', () => {
  it('parseWinddownDoc recovers every anchor from the theme doc, 0 malformed', () => {
    const doc = golden618Doc();
    const parsed = parseWinddownDoc(doc);
    assert.equal(parsed.malformed.length, 0, 'no malformed checkbox lines');
    // 15 item anchors recovered (choices/actions aside — none in this fixture)
    const itemAnchors = [...parsed.byAnchor.keys()].filter((k) => /^(ai|de|le)_\d+@/.test(k));
    assert.equal(itemAnchors.length, 15);
  });

  it('checkbox states are recovered correctly (winners [x], superseded/moot/FYI/standing [ ])', () => {
    const doc = golden618Doc();
    const parsed = parseWinddownDoc(doc);
    const checked = (a: string) => parsed.byAnchor.get(a)!.checked;
    // winners
    assert.equal(checked(`de_004@${ANTHONY}`), true);
    assert.equal(checked(`de_005@${ANTHONY}`), true);
    assert.equal(checked(`de_006@${ANTHONY}`), true);
    assert.equal(checked(`ai_005@${ANTHONY}`), true);
    assert.equal(checked(`le_002@${ANTHONY}`), true);
    assert.equal(checked(`de_003@${GENESYS}`), true);
    assert.equal(checked(`de_007@${LINDSAY}`), true);
    // superseded / moot / FYI / standing / orphan → unchecked
    assert.equal(checked(`de_001@${JAMIE}`), false);
    assert.equal(checked(`de_002@${JAMIE}`), false);
    assert.equal(checked(`ai_003@${JAMIE}`), false);
    assert.equal(checked(`ai_006@${ANTHONY}`), false); // FYI direction:none
    assert.equal(checked(`ai_007@${GENESYS}`), false); // standing, your call
    assert.equal(checked(`ai_009@${ORPHAN}`), false); // Uncategorized
  });

  it('per-item anchor lines are byte-identical to what checklist mode emits for the SAME items', () => {
    // The load-bearing AC6 assertion: emit each item through BOTH the theme path
    // (renderItemLine + theme decoration) and the checklist path (renderItemLine,
    // no decoration) and prove the trailing anchor segment is byte-for-byte equal.
    // The decoration only touches the MIDDLE of the line, never the anchor tail.
    const cases: Array<{ item: StagedItem; slug: string; meta: ChecklistItemMeta; isAction: boolean }> = [
      { item: de('de_004', 'Status letters use a join table'), slug: ANTHONY, meta: { elevated: true }, isAction: false },
      { item: ai('ai_005', 'Draft the join-table migration'), slug: ANTHONY, meta: { elevated: true, direction: 'i_owe_them' }, isAction: true },
      { item: de('de_001', 'Single recipient'), slug: JAMIE, meta: { skipKind: 'superseded', skipReason: 'superseded by 15:00 spec-sync', skipMatchedRef: `de_004@${ANTHONY}` }, isAction: false },
    ];
    for (const c of cases) {
      const anchor = `<!-- ${c.item.id}@${c.slug} -->`;
      const checklistLine = renderItemLine(c.item, c.slug, c.meta, { isAction: c.isAction });
      const themeLine = renderItemLine(c.item, c.slug, c.meta, {
        isAction: c.isAction,
        theme: {
          sourceTag: '*(15:00 spec-sync)*',
          superseded: c.meta.skipKind === 'superseded',
        },
      });
      // identical anchor tail
      assert.ok(checklistLine.endsWith(anchor), `${c.item.id} checklist anchor tail`);
      assert.ok(themeLine.endsWith(anchor), `${c.item.id} theme anchor tail`);
      // identical checkbox prefix (the decoration never flips the box)
      const box = checklistLine.slice(0, 6);
      assert.equal(themeLine.slice(0, 6), box, `${c.item.id} checkbox prefix identical`);
    }
  });

  it('apply dry-run over an UNTOUCHED theme doc is a no-op (every item: approve/skip, no edits)', () => {
    const doc = golden618Doc();
    // baseline === edited → no toggles, no amendments.
    const plan = buildApplyPlan('2026-06-18', doc, doc);
    assert.equal(plan.warnings.length, 0, 'no warnings on a clean round-trip');
    for (const item of plan.items) {
      assert.ok(['approve', 'skip'].includes(item.decision), `${item.itemId} stable (${item.decision})`);
      assert.equal(item.edited, false, `${item.itemId} unedited`);
    }
    // all 15 items present in the plan
    assert.equal(plan.items.length, 15);
  });
});

// ===========================================================================
// AC7 — no-regression: checklist render of the SAME meetings is unchanged
// ===========================================================================

describe('golden 6/18 — AC7 no-regression (checklist mode unchanged)', () => {
  it('checklist render of the same meetings emits the SAME per-item anchors (mode is just grouping)', () => {
    // The theme flag only switches GROUPING; the per-item lines (incl. anchors)
    // come from the shared renderItemLine. Render each meeting in checklist mode
    // and assert the anchor set matches the theme doc's anchor set.
    const meetings = [jamie11(), genesys(), lindsay(), anthony(), orphan()];
    const checklistDoc = meetings.map((m) => renderStagedItemsAsChecklist(m)).join('\n\n');
    const themeDoc = golden618Doc();

    const anchorsOf = (doc: string) =>
      new Set(
        [...doc.matchAll(/<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/g)].map(
          (m) => `${m[1]}@${m[2]}`,
        ),
      );
    assert.deepEqual([...anchorsOf(checklistDoc)].sort(), [...anchorsOf(themeDoc)].sort());
  });

  it('checklist mode groups by `## <meeting>`, theme mode by `## <project/area>` (the only diff)', () => {
    const themeDoc = golden618Doc();
    const checklistDoc = renderStagedItemsAsChecklist(anthony());
    // checklist: meeting-titled heading
    assert.match(checklistDoc, /## Anthony spec-sync/);
    // theme: project heading, NOT the meeting title
    assert.match(themeDoc, /## 📋 status-letter-automation/);
    assert.doesNotMatch(themeDoc, /## Anthony spec-sync/);
  });
});

// ===========================================================================
// Golden-doc SNAPSHOT — structural skeleton for eyeballing against MOCK.md.
// (Report item #3: structural assertions over a full byte-diff; this pins the
// skeleton — headings, ordering, the arc, the Uncategorized + Notes tail.)
// ===========================================================================

describe('golden 6/18 — structural skeleton (eyeball anchor)', () => {
  it('section ordering: status-letter → genesys → eng-management → Uncategorized → Notes', () => {
    const doc = golden618Doc();
    const order = [
      '## 📋 status-letter-automation',
      '## 📋 genesys-migration',
      '## 🗂 areas/engineering-management',
      '## ⚠ Uncategorized',
      '## Notes (chef reasoning',
    ];
    let last = -1;
    for (const h of order) {
      const idx = doc.indexOf(h);
      assert.ok(idx > last, `"${h}" present and after the previous heading`);
      last = idx;
    }
  });

  it('the Lindsay coarse-limitation callout renders as a blockquote', () => {
    const doc = golden618Doc();
    assert.match(doc, /> This 1:1 also touched \*\*status-letter-automation\*\*/);
  });

  it('the orphan lands under Uncategorized (anchor after the heading)', () => {
    const doc = golden618Doc();
    const uncatIdx = doc.indexOf('## ⚠ Uncategorized');
    assert.ok(uncatIdx >= 0);
    assert.ok(doc.indexOf(`<!-- ai_009@${ORPHAN} -->`) > uncatIdx);
  });
});
