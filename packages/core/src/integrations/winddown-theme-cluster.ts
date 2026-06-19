/**
 * Theme clustering + within-theme chronological ordering (theme-render v1
 * COARSE — `dev/work/plans/theme-render/plan.md`, work items W1 + W2).
 *
 * Pure, deterministic. No LLM, no I/O. This is the SEAM the theme render
 * (W3, next gate) consumes: given the already-built per-meeting checklist
 * views + a COARSE meeting→theme assignment + each meeting's timestamp, it
 * groups meetings by theme and orders each cluster oldest→newest.
 *
 * What this module is NOT (deliberate v1 scope, plan D3/D9):
 *  - It does NOT assign themes. Assignment is CHEF SEMANTIC and MEETING-level,
 *    reusing the already-shipped Step-2.0 topic-review / `meeting topics`
 *    surface — the caller resolves each meeting's dominant `topics:` entry and
 *    hands it in as `theme`. No new `staged_item_theme` per-item map (v2).
 *  - It does NOT do supersession/moot/arc REASONING. That is chef judgment
 *    (semantic, not Jaccard) and lives in SKILL prose. This module only
 *    provides (a) the deterministic chronological ordering, and (b) helpers to
 *    RECORD an arc outcome on an item (see `supersededSkipReason`), which reuse
 *    the existing `staged_item_skip_reason` machinery — no new frontmatter
 *    field (plan W2: "prefer reusing existing machinery").
 *
 * HARD INVARIANT — count conservation (plan AC3): every staged item across the
 * input meetings appears in EXACTLY ONE cluster (a theme or `Uncategorized`);
 * none lost, none duplicated. The helper iterates the FULL staged set; any
 * meeting whose theme is missing/blank/invalid routes to the structural
 * `Uncategorized` cluster (plan D7 — Uncategorized is a structural default, not
 * a judgment outcome). Silent loss is impossible by construction.
 */

import type { StagedItemSkipReasonMeta } from '../models/index.js';
import type { ChecklistMeeting } from './winddown-checklist.js';

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/**
 * Canonical bucket slug for meetings with no/invalid theme assignment. Stable
 * sentinel — the render keys the `## Uncategorized` section off this. NOT a
 * valid project/area slug, so it can never collide with a real theme.
 */
export const UNCATEGORIZED_THEME = '__uncategorized__';

/**
 * One meeting fed into the clusterer: the already-built `ChecklistMeeting`
 * (slug + sections + per-item meta) PLUS the two coarse-render fields.
 *
 * `theme` — the meeting's dominant `topics:` entry (a project slug, or an area
 * slug as fallback) resolved by the caller from the Step-2.0 assignment. An
 * empty / whitespace-only / undefined value routes the meeting to
 * `Uncategorized` (D7). The clusterer NEVER recomputes or second-guesses this.
 *
 * `timeIso` — the meeting frontmatter `date:` (a full ISO datetime on the live
 * MCP path, verified 75/75; e.g. `2026-06-18T11:00:00.000Z`). Used to order
 * the cluster oldest→newest (W2 / D5). DEFENSIVE FALLBACK: when absent or
 * unparseable, the meeting keeps its INPUT (staging) order rather than crashing
 * or assuming a time (plan W2: "never assume/crash").
 */
export interface ThemeMeetingInput {
  meeting: ChecklistMeeting;
  /** Dominant theme slug (project-primary / area-fallback), or '' / undefined → Uncategorized. */
  theme?: string;
  /** Meeting timestamp (frontmatter `date:`), ISO. Missing → staging-order fallback. */
  timeIso?: string;
}

/**
 * One theme cluster: the theme slug + its meetings ordered oldest→newest. The
 * render (W3) iterates these in cluster order, then each cluster's `meetings`
 * in the chronological order this module fixed.
 */
export interface ThemeCluster {
  /** Theme slug, or `UNCATEGORIZED_THEME` for the structural catch-all. */
  theme: string;
  /** True iff this is the structural Uncategorized bucket. */
  uncategorized: boolean;
  /** Member meetings, oldest→newest by `timeIso` (staging-order fallback). */
  meetings: ThemeMeetingInput[];
}

/** Result of clustering: the ordered clusters + a count-conservation audit. */
export interface ThemeClusterResult {
  /** Project/area clusters first (in first-seen order), then Uncategorized last. */
  clusters: ThemeCluster[];
  /**
   * Count-conservation audit (plan AC3). `itemsIn` is the total staged items
   * across ALL input meetings; `itemsOut` is the total across all clusters.
   * They MUST be equal — the clusterer asserts this and throws if not, so a
   * regression can never silently drop/duplicate an item.
   */
  audit: { meetingsIn: number; itemsIn: number; itemsOut: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Total staged items in a meeting (action items + decisions + learnings). */
function itemCount(m: ChecklistMeeting): number {
  return (
    m.sections.actionItems.length +
    m.sections.decisions.length +
    m.sections.learnings.length
  );
}

/** Normalize a theme assignment → a real slug, or `UNCATEGORIZED_THEME`. */
function resolveTheme(theme: string | undefined): string {
  if (typeof theme !== 'string') return UNCATEGORIZED_THEME;
  const t = theme.trim();
  return t === '' ? UNCATEGORIZED_THEME : t;
}

/**
 * Parse a meeting `timeIso` to epoch millis for ordering. Returns `null` when
 * the value is missing or unparseable — the caller then falls back to staging
 * order (W2 defensive fallback; the codebase has date-only importers, so a
 * meeting can legitimately lack a time).
 */
function parseTime(timeIso: string | undefined): number | null {
  if (typeof timeIso !== 'string' || timeIso.trim() === '') return null;
  const ms = Date.parse(timeIso);
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// W1 + W2 — cluster + chronological order
// ---------------------------------------------------------------------------

/**
 * Cluster meetings by their coarse theme assignment, ordering each cluster's
 * meetings oldest→newest by timestamp (W1 + W2).
 *
 * Cluster order (plan D6 / MOCK §5): real themes appear in FIRST-SEEN input
 * order (deterministic, stable), and the structural `Uncategorized` bucket is
 * ALWAYS appended last — even when empty it is materialized by the caller-
 * facing render, but here it is only emitted when it actually has a member
 * meeting (the render layer is responsible for the "always show Uncategorized"
 * affordance; this layer reports only real membership). Within a cluster,
 * meetings sort oldest→newest by `timeIso`; meetings with no parseable time
 * keep their relative INPUT order and sort AFTER timed meetings (stable, never
 * crash — W2 defensive fallback).
 *
 * COUNT CONSERVATION (AC3): iterates the FULL input set; every meeting (hence
 * every staged item) lands in exactly one cluster. Asserts `itemsIn ===
 * itemsOut` and throws on mismatch so a future regression can't silently lose
 * or duplicate an item.
 */
export function clusterMeetingsByTheme(inputs: ThemeMeetingInput[]): ThemeClusterResult {
  const itemsIn = inputs.reduce((n, i) => n + itemCount(i.meeting), 0);

  // Group by resolved theme, preserving first-seen order for real themes.
  const order: string[] = [];
  const byTheme = new Map<string, ThemeMeetingInput[]>();
  for (const input of inputs) {
    const theme = resolveTheme(input.theme);
    let bucket = byTheme.get(theme);
    if (!bucket) {
      bucket = [];
      byTheme.set(theme, bucket);
      // Defer Uncategorized to the tail (added after the loop), keep real
      // themes in first-seen order.
      if (theme !== UNCATEGORIZED_THEME) order.push(theme);
    }
    bucket.push(input);
  }
  // Uncategorized always sorts last (D7 / MOCK §5).
  if (byTheme.has(UNCATEGORIZED_THEME)) order.push(UNCATEGORIZED_THEME);

  const clusters: ThemeCluster[] = order.map((theme) => ({
    theme,
    uncategorized: theme === UNCATEGORIZED_THEME,
    meetings: orderChronologically(byTheme.get(theme)!),
  }));

  const itemsOut = clusters.reduce(
    (n, c) => n + c.meetings.reduce((mm, i) => mm + itemCount(i.meeting), 0),
    0,
  );

  // HARD INVARIANT (AC3): no item lost, none duplicated.
  if (itemsOut !== itemsIn) {
    throw new Error(
      `theme clustering broke count conservation: ${itemsIn} staged items in, ` +
        `${itemsOut} out (every item must land in exactly one cluster)`,
    );
  }

  return { clusters, audit: { meetingsIn: inputs.length, itemsIn, itemsOut } };
}

/**
 * Order one cluster's meetings oldest→newest by `timeIso` (W2 / D5). Stable:
 *  - timed meetings sort ascending by parsed epoch millis;
 *  - ties keep input order;
 *  - meetings with NO parseable time keep their relative input order and sort
 *    AFTER all timed meetings (defensive fallback — never assume a time, never
 *    crash). This is the only sane deterministic placement for an untimed
 *    meeting: the chronological walk still sees every timed meeting in true
 *    order, and the untimed one trails predictably.
 *
 * Exported for direct unit-testing of the ordering contract.
 */
export function orderChronologically(meetings: ThemeMeetingInput[]): ThemeMeetingInput[] {
  return meetings
    .map((m, idx) => ({ m, idx, t: parseTime(m.timeIso) }))
    .sort((a, b) => {
      if (a.t !== null && b.t !== null) {
        if (a.t !== b.t) return a.t - b.t;
        return a.idx - b.idx; // stable tie-break
      }
      if (a.t !== null) return -1; // timed before untimed
      if (b.t !== null) return 1;
      return a.idx - b.idx; // both untimed → input (staging) order
    })
    .map((x) => x.m);
}

// ---------------------------------------------------------------------------
// W2 — arc-outcome metadata (reuses staged_item_skip_reason; no new field)
// ---------------------------------------------------------------------------

/**
 * Build a `staged_item_skip_reason` entry recording that an item was SUPERSEDED
 * by a later one in the chronological walk (W2 arc metadata).
 *
 * DESIGN (plan W2 — "prefer reusing existing machinery; if you add a field,
 * wire it into the cleanup filter"): we do NOT add a new `arc`/`superseded`
 * frontmatter field. The existing skip-reason machinery already delivers every
 * requirement, with zero new wiring:
 *  - renders `[ ]` (unchecked, never pre-elevated) — guaranteed because the
 *    chef simply does NOT elevate a superseded item (`prefillChecked` only
 *    pre-checks `elevated===true` / `status==='approved'`);
 *  - carries a human reason — `reason` ("superseded by [later], 15:00
 *    spec-sync");
 *  - RETAINS its anchor — anchors are render-time (`id@slug`), untouched by
 *    skip-reason, so a wrongly-superseded item is re-elevatable via the apply
 *    rescue path (check `[ ]`→`[x]`) — plan AC5 false-supersession safety;
 *  - already in the finding-#12 cleanup filter — `staged_item_skip_reason` is
 *    in the `commitApprovedItems` sibling-cleanup list
 *    (`staged-items.ts`), so no orphan trap.
 *
 * `setBy: 'chef'` (a confirmed chef judgment, semantic). The chef writes this
 * via the existing skip path; this helper only standardizes the entry shape +
 * the human-readable reason so the arc reads consistently across clusters.
 *
 * @param supersededByRef  the later (winning) item's ref the render links to,
 *                         e.g. `de_004@2026-06-18-anthony-spec-sync`.
 * @param humanReason      the chef's one-line arc reason, e.g.
 *                         "recipient model changed single → multiple".
 * @param laterContext     short human anchor for the later item, e.g.
 *                         "15:00 Anthony spec-sync" (shown in the reason text).
 * @param now              ISO timestamp; defaults to `new Date()`.
 */
export function supersededSkipReason(
  supersededByRef: string,
  humanReason: string,
  laterContext: string,
  now: Date = new Date(),
): StagedItemSkipReasonMeta {
  const ctx = laterContext.trim();
  const why = humanReason.trim();
  const reason = ctx
    ? `superseded by ${ctx}${why ? ` — ${why}` : ''}`
    : `superseded${why ? ` — ${why}` : ''}`;
  return {
    reason,
    // Evidence points at the later/winning item so the arc is verifiable +
    // the render can surface the linkable target.
    evidence: `superseded by [[${supersededByRef}]]`,
    setBy: 'chef',
    setAt: now.toISOString(),
    // matchedRef carries the winning item's ref — the same field the dedup
    // skip uses, so the render's existing `[[matchedRef]]` link works unchanged.
    matchedRef: supersededByRef,
  };
}
