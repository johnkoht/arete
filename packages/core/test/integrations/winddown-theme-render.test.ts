/**
 * Tests for the theme-grouped winddown render (theme-render v1 COARSE, W3 —
 * `dev/work/plans/theme-render/plan.md`; expected output = MOCK.md).
 *
 * Coverage:
 *  - GROUPING: items render under `## <project/area>` headings, consolidated
 *    Decisions / Action items / Learnings, meetings chronological within.
 *  - AC3 count conservation: every staged item appears in exactly one section
 *    (a theme or Uncategorized); none lost, none duplicated.
 *  - D7 Uncategorized-always: the `## Uncategorized` section is materialized
 *    even when no meeting routed there.
 *  - AC6 ANCHOR BYTE-IDENTITY: the per-item anchor lines are emitted by the
 *    SHARED `renderItemLine`, so the `<!-- id@slug -->` anchors are byte-for-byte
 *    recoverable + identical to checklist mode (apply diffs unchanged).
 *  - D6 arc: a superseded item renders `[ ]`, struck-through, with the
 *    `skipKind:'superseded'` arc suffix; never pre-elevated; keeps its anchor.
 *  - pickDominantTheme: project-primary → area-fallback → first-topic → undefined.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderThemeView,
  buildThemeView,
  pickDominantTheme,
} from '../../src/integrations/winddown-theme-render.js';
import { UNCATEGORIZED_THEME } from '../../src/integrations/winddown-theme-cluster.js';
import {
  renderItemLine,
  ITEM_ANCHOR_RE,
  type ChecklistMeeting,
} from '../../src/integrations/winddown-checklist.js';
import { parseWinddownDoc } from '../../src/integrations/winddown-apply.js';
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

function mtg(over: Partial<ChecklistMeeting> & { slug: string }): ChecklistMeeting {
  return {
    slug: over.slug,
    title: over.title ?? over.slug,
    label: over.label,
    sections: over.sections ?? { actionItems: [], decisions: [], learnings: [] },
    meta: over.meta ?? {},
  };
}

describe('theme-render W3 — renderThemeView grouping', () => {
  it('groups items under project/area headings with Decisions/Action/Learnings', () => {
    const slug = '2026-06-18-anthony-spec-sync';
    const meeting = mtg({
      slug,
      title: 'Anthony spec-sync',
      label: '15:00 Anthony spec-sync',
      sections: {
        actionItems: [ai('ai_005', 'Draft the join-table migration')],
        decisions: [de('de_004', 'Status letters use a join table')],
        learnings: [le('ln_002', 'Spec-sync is the source of truth')],
      },
      meta: {
        ai_005: { elevated: true },
        de_004: { elevated: true },
        ln_002: { elevated: true },
      },
    });
    const view = buildThemeView(
      [{ meeting, theme: 'status-letter-automation', timeIso: '2026-06-18T15:00:00.000Z' }],
      { date: '2026-06-18', themeMeta: { 'status-letter-automation': { headingPrefix: '📋' } } },
    );
    const out = renderThemeView(view);
    assert.match(out, /## 📋 status-letter-automation/);
    assert.match(out, /\*\*Decisions\*\*/);
    assert.match(out, /\*\*Action items\*\*/);
    assert.match(out, /\*\*Learnings\*\*/);
    // grouping header is project/area, NOT a meeting title
    assert.doesNotMatch(out, /## Anthony spec-sync/);
    // pre-elevated items show [x]
    assert.match(out, /- \[x\] Status letters use a join table/);
  });

  it('AC3 — count conservation: every staged item appears exactly once', () => {
    const m1 = mtg({
      slug: '2026-06-18-a',
      sections: {
        actionItems: [ai('ai_001', 'A1'), ai('ai_002', 'A2')],
        decisions: [de('de_001', 'D1')],
        learnings: [le('le_001', 'L1')],
      },
    });
    const m2 = mtg({
      slug: '2026-06-18-b',
      sections: {
        actionItems: [ai('ai_010', 'B1')],
        decisions: [de('de_010', 'BD1'), de('de_011', 'BD2')],
        learnings: [],
      },
    });
    const m3 = mtg({
      slug: '2026-06-18-c',
      sections: { actionItems: [ai('ai_020', 'C1')], decisions: [], learnings: [] },
    });
    const view = buildThemeView(
      [
        { meeting: m1, theme: 'proj-x', timeIso: '2026-06-18T09:00:00Z' },
        { meeting: m2, theme: 'areas/eng', timeIso: '2026-06-18T10:00:00Z' },
        { meeting: m3, theme: undefined, timeIso: '2026-06-18T11:00:00Z' }, // → Uncategorized
      ],
      { date: '2026-06-18' },
    );
    const out = renderThemeView(view);

    // Count every staged-item anchor in the rendered doc.
    const anchors = [...out.matchAll(/<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/g)].map(
      (m) => `${m[1]}@${m[2]}`,
    );
    const expected = [
      'ai_001@2026-06-18-a',
      'ai_002@2026-06-18-a',
      'de_001@2026-06-18-a',
      'le_001@2026-06-18-a',
      'ai_010@2026-06-18-b',
      'de_010@2026-06-18-b',
      'de_011@2026-06-18-b',
      'ai_020@2026-06-18-c',
    ];
    // exactly once each, none missing, none duplicated
    assert.equal(anchors.length, expected.length);
    assert.deepEqual([...anchors].sort(), [...expected].sort());
    const set = new Set(anchors);
    assert.equal(set.size, anchors.length, 'no duplicate anchors');
  });

  it('D7 — `## Uncategorized` is ALWAYS rendered, even when empty', () => {
    const m1 = mtg({
      slug: '2026-06-18-a',
      sections: { actionItems: [ai('ai_001', 'A1')], decisions: [], learnings: [] },
    });
    const view = buildThemeView([{ meeting: m1, theme: 'proj-x' }], { date: '2026-06-18' });
    // no input routed to Uncategorized…
    assert.ok(view.themes.some((t) => t.uncategorized));
    const out = renderThemeView(view);
    // …yet the section is materialized as a structural affordance.
    assert.match(out, /## ⚠ Uncategorized/);
  });

  it('D7 — an unassigned meeting routes into the Uncategorized section', () => {
    const m1 = mtg({
      slug: '2026-06-18-orphan',
      sections: { actionItems: [ai('ai_009', 'Explore comms calendar')], decisions: [], learnings: [] },
    });
    const view = buildThemeView([{ meeting: m1, theme: '' }], { date: '2026-06-18' });
    const out = renderThemeView(view);
    const uncatIdx = out.indexOf('## ⚠ Uncategorized');
    assert.ok(uncatIdx >= 0);
    // the orphan item's anchor appears AFTER the Uncategorized heading
    assert.ok(out.indexOf('<!-- ai_009@2026-06-18-orphan -->') > uncatIdx);
  });

  it('D6 — superseded item renders [ ], struck-through, with arc suffix + anchor; never [x]', () => {
    const slug = '2026-06-18-jamie';
    const meeting = mtg({
      slug,
      label: '09:30 Jamie 1:1',
      sections: { actionItems: [], decisions: [de('de_001', 'Single recipient per status letter')], learnings: [] },
      meta: {
        de_001: {
          // superseded skip-reason (Gate-1 supersededSkipReason shape)
          skipReason: 'superseded by 15:00 spec-sync — recipient model changed single → multiple',
          skipMatchedRef: 'de_004@2026-06-18-anthony-spec-sync',
          skipKind: 'superseded',
        },
      },
    });
    const view = buildThemeView(
      [{ meeting, theme: 'status-letter-automation', timeIso: '2026-06-18T09:30:00Z' }],
      { date: '2026-06-18' },
    );
    const out = renderThemeView(view);
    // unchecked (never pre-elevated)
    assert.match(out, /- \[ \] ~~Single recipient per status letter~~/);
    // arc suffix surfaces the verbatim reason + links the superseding target
    assert.match(out, /superseded by 15:00 spec-sync — recipient model changed single → multiple/);
    assert.match(out, /\[\[de_004@2026-06-18-anthony-spec-sync\]\]/);
    // anchor retained for rescue (AC5)
    assert.match(out, /<!-- de_001@2026-06-18-jamie -->/);
    // never elevated
    assert.doesNotMatch(out, /- \[x\] ~~Single recipient/);
  });
});

describe('theme-render W3 — AC6 anchor byte-identity vs checklist mode', () => {
  // The single most load-bearing AC: the theme render MUST emit per-item anchor
  // lines byte-for-byte identical to checklist mode so winddown-apply diffs it
  // unchanged. We prove it by emitting the SAME item through both code paths and
  // asserting the trailing anchor segment is byte-identical, and that the apply
  // parser recovers the identical anchor key + checkbox state from the theme doc.

  it('the shared renderItemLine produces a byte-identical anchor tail in both modes', () => {
    const item = ai('ai_001', 'Draft the join-table migration');
    const slug = '2026-06-18-anthony-spec-sync';
    const meta = { elevated: true, tier: 'high' as const };

    // checklist mode: no theme decoration
    const checklistLine = renderItemLine(item, slug, meta, { isAction: true });
    // theme mode: same function, with source-tag decoration
    const themeLine = renderItemLine(item, slug, meta, {
      isAction: true,
      theme: { sourceTag: '*(15:00 spec-sync)*' },
    });

    const anchor = `<!-- ai_001@${slug} -->`;
    // the anchor is the byte-identical TAIL of both lines
    assert.ok(checklistLine.endsWith(anchor));
    assert.ok(themeLine.endsWith(anchor));
    // checkbox prefix identical
    assert.ok(checklistLine.startsWith('- [x] '));
    assert.ok(themeLine.startsWith('- [x] '));
  });

  it('theme doc anchors are recovered identically by the apply parser', () => {
    const meeting = mtg({
      slug: '2026-06-18-anthony-spec-sync',
      label: '15:00 spec-sync',
      sections: {
        actionItems: [ai('ai_005', 'Draft the join-table migration')],
        decisions: [de('de_004', 'Status letters use a join table')],
        learnings: [],
      },
      meta: { ai_005: { elevated: true }, de_004: { elevated: true } },
    });
    const view = buildThemeView(
      [{ meeting, theme: 'status-letter-automation' }],
      { date: '2026-06-18' },
    );
    const doc = renderThemeView(view);
    const parsed = parseWinddownDoc(doc);
    // both anchors recovered, no malformed lines
    assert.equal(parsed.malformed.length, 0);
    assert.ok(parsed.byAnchor.has('ai_005@2026-06-18-anthony-spec-sync'));
    assert.ok(parsed.byAnchor.has('de_004@2026-06-18-anthony-spec-sync'));
    // checkbox state recovered ([x] = elevated)
    assert.equal(parsed.byAnchor.get('de_004@2026-06-18-anthony-spec-sync')!.checked, true);
  });

  it('every emitted item anchor is recoverable (apply baseline validity)', () => {
    const meeting = mtg({
      slug: '2026-06-18-m',
      sections: {
        actionItems: [ai('ai_001', 'A'), ai('ai_002', 'B')],
        decisions: [de('de_001', 'C')],
        learnings: [le('le_001', 'D')],
      },
    });
    const view = buildThemeView([{ meeting, theme: 'proj' }], { date: '2026-06-18' });
    const doc = renderThemeView(view);
    for (const id of ['ai_001', 'ai_002', 'de_001', 'le_001']) {
      const m = `<!-- ${id}@2026-06-18-m -->`.match(ITEM_ANCHOR_RE);
      assert.ok(doc.includes(`<!-- ${id}@2026-06-18-m -->`), `${id} anchor present`);
      assert.ok(m);
    }
  });
});

describe('theme-render W3 — pickDominantTheme', () => {
  const projects = ['status-letter-automation', 'genesys-migration'];
  const areas = ['engineering-management', 'product'];

  it('1. picks the first topic matching an active PROJECT slug (project-primary)', () => {
    assert.equal(
      pickDominantTheme(['product', 'status-letter-automation'], projects, areas),
      'status-letter-automation',
    );
  });

  it('2. falls back to the first topic matching an active AREA slug', () => {
    assert.equal(pickDominantTheme(['unknown-x', 'product'], projects, areas), 'product');
  });

  it('3. falls back to the FIRST topic when nothing matches the spine', () => {
    assert.equal(pickDominantTheme(['mystery-workstream', 'other'], projects, areas), 'mystery-workstream');
  });

  it('4. returns undefined for empty/blank/missing topics → Uncategorized', () => {
    assert.equal(pickDominantTheme([], projects, areas), undefined);
    assert.equal(pickDominantTheme(['  ', ''], projects, areas), undefined);
    assert.equal(pickDominantTheme(undefined, projects, areas), undefined);
  });

  it('project beats area even when the area appears earlier in topics', () => {
    assert.equal(
      pickDominantTheme(['engineering-management', 'genesys-migration'], projects, areas),
      'genesys-migration',
    );
  });

  it('an undefined result clusters the meeting to Uncategorized in the view', () => {
    const m = mtg({
      slug: '2026-06-18-z',
      sections: { actionItems: [ai('ai_001', 'X')], decisions: [], learnings: [] },
    });
    const theme = pickDominantTheme([], projects, areas);
    const view = buildThemeView([{ meeting: m, theme }], { date: '2026-06-18' });
    const uncat = view.themes.find((t) => t.uncategorized);
    assert.ok(uncat);
    assert.equal(uncat!.theme, UNCATEGORIZED_THEME);
    assert.equal(uncat!.meetings.length, 1);
  });
});
