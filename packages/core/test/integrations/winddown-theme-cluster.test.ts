/**
 * Tests for theme clustering + within-theme chronological ordering
 * (theme-render v1 COARSE — plan W1 + W2).
 *
 * Coverage (the deterministic layer the chef-judgment render rides on):
 *  - W1 clustering: meetings grouped by their coarse theme assignment
 *  - count conservation (AC3): every staged item lands in exactly one cluster
 *  - unassigned → Uncategorized (D7): blank/undefined/whitespace theme routed
 *    to the structural catch-all, which always sorts LAST
 *  - W2 chronological ordering (D5): oldest→newest by meeting `timeIso`
 *  - defensive fallback: a meeting with no/invalid time keeps staging order,
 *    sorts after timed meetings, never crashes
 *  - arc metadata (W2): supersededSkipReason reuses staged_item_skip_reason
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterMeetingsByTheme,
  orderChronologically,
  supersededSkipReason,
  UNCATEGORIZED_THEME,
  type ThemeMeetingInput,
} from '../../src/integrations/winddown-theme-cluster.js';
import { skipSuffix } from '../../src/integrations/winddown-checklist.js';
import type { ChecklistMeeting } from '../../src/integrations/winddown-checklist.js';
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

/** Build a ChecklistMeeting with the given counts of each item type. */
function meeting(
  slug: string,
  counts: { ai?: number; de?: number; le?: number } = {},
): ChecklistMeeting {
  const actionItems = Array.from({ length: counts.ai ?? 0 }, (_, i) =>
    ai(`ai_${String(i + 1).padStart(3, '0')}`, `${slug} action ${i + 1}`),
  );
  const decisions = Array.from({ length: counts.de ?? 0 }, (_, i) =>
    de(`de_${String(i + 1).padStart(3, '0')}`, `${slug} decision ${i + 1}`),
  );
  const learnings = Array.from({ length: counts.le ?? 0 }, (_, i) =>
    le(`le_${String(i + 1).padStart(3, '0')}`, `${slug} learning ${i + 1}`),
  );
  return {
    slug,
    title: slug,
    sections: { actionItems, decisions, learnings },
    meta: {},
  };
}

function input(m: ChecklistMeeting, theme: string | undefined, timeIso?: string): ThemeMeetingInput {
  return { meeting: m, theme, timeIso };
}

describe('clusterMeetingsByTheme (W1)', () => {
  it('groups meetings by their coarse theme assignment', () => {
    const inputs = [
      input(meeting('jamie', { de: 2 }), 'status-letter-automation', '2026-06-18T09:30:00.000Z'),
      input(meeting('genesys', { de: 1 }), 'genesys-migration', '2026-06-18T11:00:00.000Z'),
      input(meeting('anthony', { de: 3 }), 'status-letter-automation', '2026-06-18T15:00:00.000Z'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    const themes = clusters.map((c) => c.theme);
    assert.deepEqual(themes, ['status-letter-automation', 'genesys-migration']);
    const sl = clusters[0];
    assert.equal(sl.meetings.length, 2);
    assert.equal(sl.uncategorized, false);
  });

  it('real themes appear in first-seen order; Uncategorized is always last', () => {
    const inputs = [
      input(meeting('a', { ai: 1 }), undefined), // → Uncategorized
      input(meeting('b', { ai: 1 }), 'beta'),
      input(meeting('c', { ai: 1 }), 'alpha'),
      input(meeting('d', { ai: 1 }), 'beta'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    assert.deepEqual(
      clusters.map((c) => c.theme),
      ['beta', 'alpha', UNCATEGORIZED_THEME],
    );
    assert.equal(clusters[clusters.length - 1].uncategorized, true);
  });
});

describe('count conservation (AC3 — the single most important invariant)', () => {
  it('every staged item lands in exactly one cluster; itemsIn === itemsOut', () => {
    const inputs = [
      input(meeting('m1', { ai: 2, de: 1, le: 1 }), 'proj-x', '2026-06-18T09:00:00.000Z'),
      input(meeting('m2', { ai: 1 }), 'proj-y', '2026-06-18T10:00:00.000Z'),
      input(meeting('m3', { de: 3, le: 2 }), '', '2026-06-18T11:00:00.000Z'), // → Uncategorized
    ];
    const { clusters, audit } = clusterMeetingsByTheme(inputs);
    // 2+1+1 + 1 + 3+2 = 10
    assert.equal(audit.itemsIn, 10);
    assert.equal(audit.itemsOut, 10);
    assert.equal(audit.itemsIn, audit.itemsOut);
    assert.equal(audit.meetingsIn, 3);

    // No item appears twice — collect every id+slug across clusters.
    const seen = new Set<string>();
    for (const c of clusters) {
      for (const mi of c.meetings) {
        const all = [
          ...mi.meeting.sections.actionItems,
          ...mi.meeting.sections.decisions,
          ...mi.meeting.sections.learnings,
        ];
        for (const it of all) {
          const key = `${it.id}@${mi.meeting.slug}`;
          assert.ok(!seen.has(key), `duplicate item ${key}`);
          seen.add(key);
        }
      }
    }
    assert.equal(seen.size, 10);
  });

  it('handles the empty input set without crashing (0 in, 0 out)', () => {
    const { clusters, audit } = clusterMeetingsByTheme([]);
    assert.deepEqual(clusters, []);
    assert.deepEqual(audit, { meetingsIn: 0, itemsIn: 0, itemsOut: 0 });
  });
});

describe('unassigned → Uncategorized (D7 — structural default)', () => {
  it('routes undefined / blank / whitespace-only themes to Uncategorized', () => {
    const inputs = [
      input(meeting('u1', { ai: 1 }), undefined),
      input(meeting('u2', { ai: 1 }), ''),
      input(meeting('u3', { ai: 1 }), '   '),
      input(meeting('real', { ai: 1 }), 'proj-x'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    const uncat = clusters.find((c) => c.uncategorized);
    assert.ok(uncat, 'Uncategorized cluster exists');
    assert.equal(uncat!.theme, UNCATEGORIZED_THEME);
    assert.equal(uncat!.meetings.length, 3);
    // The real theme stays its own cluster — no item lost.
    assert.equal(clusters.find((c) => c.theme === 'proj-x')!.meetings.length, 1);
  });

  it('emits NO Uncategorized cluster when every meeting is assigned', () => {
    const inputs = [
      input(meeting('a', { ai: 1 }), 'proj-x'),
      input(meeting('b', { ai: 1 }), 'proj-y'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    assert.equal(clusters.some((c) => c.uncategorized), false);
  });
});

describe('within-theme chronological ordering (W2 / D5)', () => {
  it('orders a cluster oldest→newest by meeting timeIso', () => {
    // Hand them in newest-first to prove the sort actually reorders.
    const inputs = [
      input(meeting('afternoon', { de: 1 }), 'status-letter-automation', '2026-06-18T15:00:00.000Z'),
      input(meeting('morning', { de: 1 }), 'status-letter-automation', '2026-06-18T09:30:00.000Z'),
      input(meeting('noon', { de: 1 }), 'status-letter-automation', '2026-06-18T12:00:00.000Z'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    assert.deepEqual(
      clusters[0].meetings.map((m) => m.meeting.slug),
      ['morning', 'noon', 'afternoon'],
    );
  });

  it('orderChronologically is stable on equal timestamps (input order kept)', () => {
    const a = input(meeting('a'), 't', '2026-06-18T10:00:00.000Z');
    const b = input(meeting('b'), 't', '2026-06-18T10:00:00.000Z');
    const c = input(meeting('c'), 't', '2026-06-18T10:00:00.000Z');
    assert.deepEqual(
      orderChronologically([a, b, c]).map((m) => m.meeting.slug),
      ['a', 'b', 'c'],
    );
  });
});

describe('defensive time fallback (W2 — never assume/crash)', () => {
  it('a meeting with no time keeps staging order and sorts after timed meetings', () => {
    const inputs = [
      input(meeting('untimed', { ai: 1 }), 'proj-x'), // no timeIso
      input(meeting('timed-late', { ai: 1 }), 'proj-x', '2026-06-18T16:00:00.000Z'),
      input(meeting('timed-early', { ai: 1 }), 'proj-x', '2026-06-18T08:00:00.000Z'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    assert.deepEqual(
      clusters[0].meetings.map((m) => m.meeting.slug),
      ['timed-early', 'timed-late', 'untimed'],
    );
  });

  it('an unparseable timeIso falls back to staging order without throwing', () => {
    const inputs = [
      input(meeting('bad', { ai: 1 }), 'proj-x', 'not-a-date'),
      input(meeting('good', { ai: 1 }), 'proj-x', '2026-06-18T10:00:00.000Z'),
    ];
    let clusters: ReturnType<typeof clusterMeetingsByTheme>['clusters'];
    assert.doesNotThrow(() => {
      clusters = clusterMeetingsByTheme(inputs).clusters;
    });
    // good (timed) sorts before bad (untimed fallback).
    assert.deepEqual(
      clusters![0].meetings.map((m) => m.meeting.slug),
      ['good', 'bad'],
    );
  });

  it('multiple untimed meetings keep their relative input (staging) order', () => {
    const inputs = [
      input(meeting('one', { ai: 1 }), 'proj-x'),
      input(meeting('two', { ai: 1 }), 'proj-x'),
      input(meeting('three', { ai: 1 }), 'proj-x'),
    ];
    const { clusters } = clusterMeetingsByTheme(inputs);
    assert.deepEqual(
      clusters[0].meetings.map((m) => m.meeting.slug),
      ['one', 'two', 'three'],
    );
  });
});

describe('supersededSkipReason (W2 arc metadata — reuses skip-reason machinery)', () => {
  it('builds a chef skip entry with reason, evidence, matchedRef, and timestamp', () => {
    const now = new Date('2026-06-18T15:05:00.000Z');
    const entry = supersededSkipReason(
      'de_004@2026-06-18-anthony-spec-sync',
      'recipient model changed single → multiple',
      '15:00 Anthony spec-sync',
      now,
    );
    assert.equal(entry.setBy, 'chef');
    assert.equal(entry.setAt, '2026-06-18T15:05:00.000Z');
    assert.equal(entry.matchedRef, 'de_004@2026-06-18-anthony-spec-sync');
    assert.match(entry.reason, /^superseded by 15:00 Anthony spec-sync — recipient model changed/);
    assert.match(entry.evidence, /\[\[de_004@2026-06-18-anthony-spec-sync\]\]/);
    // eng-lead finding #2 — the discriminator distinguishing it from a dedup.
    assert.equal(entry.kind, 'superseded');
  });

  it('the superseded entry RENDERS through skipSuffix as supersession, not dedup', () => {
    // End-to-end seam: a superseded entry must NOT collapse to the dedup
    // "already captured as" framing once it reaches the render (finding #2).
    const entry = supersededSkipReason(
      'de_004@2026-06-18-anthony-spec-sync',
      'recipient model changed single → multiple',
      '15:00 Anthony spec-sync',
    );
    const out = skipSuffix({
      status: 'skipped',
      skipKind: entry.kind,
      skipReason: entry.reason,
      skipMatchedRef: entry.matchedRef,
    });
    assert.ok(!out.includes('already captured as'), 'must not render as dedup');
    assert.ok(out.includes('superseded by 15:00 Anthony spec-sync'), 'reason verbatim');
    assert.ok(out.includes('[[de_004@2026-06-18-anthony-spec-sync]]'), 'links superseding ref');
  });

  it('omits the trailing reason clause when humanReason is blank', () => {
    const entry = supersededSkipReason('de_005@later', '', '15:00 spec-sync');
    assert.equal(entry.reason, 'superseded by 15:00 spec-sync');
  });

  it('does not mark the item elevated/approved — superseded renders [ ] by construction', () => {
    // The arc entry is a SKIP reason only; it carries no elevation/status — so
    // prefillChecked stays false (the item renders unchecked, re-elevatable).
    const entry = supersededSkipReason('de_x@m', 'reason', 'ctx');
    assert.ok(!('elevated' in entry));
    assert.ok(!('status' in entry));
  });
});
