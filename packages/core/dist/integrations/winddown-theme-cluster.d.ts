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
/**
 * Canonical bucket slug for meetings with no/invalid theme assignment. Stable
 * sentinel — the render keys the `## Uncategorized` section off this. NOT a
 * valid project/area slug, so it can never collide with a real theme.
 */
export declare const UNCATEGORIZED_THEME = "__uncategorized__";
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
    audit: {
        meetingsIn: number;
        itemsIn: number;
        itemsOut: number;
    };
}
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
export declare function clusterMeetingsByTheme(inputs: ThemeMeetingInput[]): ThemeClusterResult;
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
export declare function orderChronologically(meetings: ThemeMeetingInput[]): ThemeMeetingInput[];
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
export declare function supersededSkipReason(supersededByRef: string, humanReason: string, laterContext: string, now?: Date): StagedItemSkipReasonMeta;
//# sourceMappingURL=winddown-theme-cluster.d.ts.map