/**
 * Theme-grouped winddown render (theme-render v1 COARSE —
 * `dev/work/plans/theme-render/plan.md`, work item W3; expected output =
 * `dev/work/plans/theme-render/MOCK.md`).
 *
 * Consumes Gate-1's clustering seam (`clusterMeetingsByTheme` →
 * `ThemeCluster[]`) and emits the approval doc grouped by PROJECT/AREA instead
 * of by meeting. Pure, deterministic. No LLM, no I/O — the chef supplies the
 * per-theme reasoning + Notes text; this module renders the STRUCTURE.
 *
 * Why a new module (plan D4): `ChecklistView` is meeting-keyed and
 * `renderMeeting` emits `## <meeting>` headers. Theme mode needs a different
 * grouping (project/area headings, items consolidated Decisions / Action items /
 * Learnings within a theme, meetings chronological inside). The APPLY half is
 * unchanged — it diffs purely by the `<!-- id@slug -->` anchor (winddown-apply),
 * with zero dependence on doc order/heading/grouping — SO LONG AS the anchor
 * lines are byte-identical to checklist mode.
 *
 * THE BYTE-IDENTITY MECHANISM (plan AC6): this module does NOT re-implement line
 * emission. It calls the SHARED `renderItemLine` exported from
 * winddown-checklist.ts — the exact function checklist mode uses — for every
 * staged item. The checkbox (`- [ ]`/`- [x]`), tier marker, owner tag, link
 * suffix, and the trailing `<!-- <id>@<slug> -->` ANCHOR are therefore produced
 * by one code path and are byte-for-byte identical between modes. Theme mode
 * only passes optional MIDDLE-of-line decoration (source tag + superseded
 * strikethrough), which never touches the checkbox or the anchor.
 *
 * COUNT CONSERVATION (plan AC3): the clusterer already asserts every staged item
 * lands in exactly one cluster. This render iterates the FULL cluster set and
 * emits every item exactly once across the three sections — it never re-drops or
 * re-filters by theme. Uncertain items still route to the Your-call block (same
 * as checklist mode), so the per-theme sections + Your-call together cover the
 * full set.
 */
import { type ChecklistChoice } from './winddown-checklist.js';
import { type ThemeMeetingInput } from './winddown-theme-cluster.js';
/**
 * One theme's render inputs: the cluster (theme slug + chronologically-ordered
 * member meetings, from Gate 1) PLUS the human heading + optional chef
 * reasoning line. The render reads the items straight off each meeting's
 * `ChecklistMeeting.sections` — no per-item theme map (coarse v1).
 */
export interface ThemeRenderGroup {
    /** Theme slug, or `UNCATEGORIZED_THEME` for the structural catch-all. */
    theme: string;
    /** True iff this is the structural Uncategorized bucket. */
    uncategorized: boolean;
    /**
     * Display heading for the section, e.g. `status-letter-automation` or
     * `areas/engineering-management`. Defaults to the theme slug. For
     * Uncategorized the renderer uses a fixed label and ignores this.
     */
    heading?: string;
    /**
     * Optional emoji/marker prefix for the heading (cosmetic — MOCK uses 📋 for
     * projects, 🗂 for areas). Omitted ⇒ plain `## <heading>`.
     */
    headingPrefix?: string;
    /** Optional one-line chef reasoning shown under the heading (italic). */
    reasoning?: string;
    /**
     * Optional trailing callout (MOCK's `⚠ This 1:1 also touched …` v1-coarse
     * limitation note). Rendered verbatim as a blockquote. Omitted ⇒ none.
     */
    callout?: string;
    /** Member meetings, oldest→newest (Gate 1 ordered them). */
    meetings: ThemeMeetingInput[];
}
/** Full input view for a theme-grouped render. */
export interface ThemeView {
    date: string;
    /** Optional weekday label, e.g. "Tue". */
    weekday?: string;
    /** Project/area groups first, then Uncategorized last. */
    themes: ThemeRenderGroup[];
    /**
     * "Your call" uncertain blocks. Auto-promoted from per-item ⚠ overlays (same
     * as checklist mode) plus any explicit ones the chef hands in. Rendered first.
     */
    choices: ChecklistChoice[];
    /**
     * Optional chef-authored `## Notes` body (assignments + arc + count check —
     * MOCK §Notes). Rendered verbatim under a `## Notes` heading. Omitted ⇒ no
     * Notes section.
     */
    notes?: string;
}
/**
 * Render the full theme-grouped winddown approval doc body. The agent-written
 * BASELINE that apply diffs against (D4: baseline + edited are the SAME
 * grouping). Structure (MOCK):
 *   # Daily Winddown — <date> (theme view)
 *   <legend>
 *   <Your-call block, if any>
 *   ## <project/area> … (one per theme, in cluster order)
 *   ## ⚠ Uncategorized (ALWAYS rendered — D7)
 *   ## Notes (chef reasoning, if supplied)
 *
 * Uncertain per-item overlays are auto-promoted into the Your-call block (same
 * as `renderWinddownDoc`) so ⚠ items always force a pick and are not silently
 * dropped from the per-theme sections.
 */
export declare function renderThemeView(view: ThemeView): string;
/**
 * Options for `buildThemeView`: per-theme heading/prefix/reasoning/callout
 * overlays (the chef supplies these), plus the chef's Notes body. Keyed by
 * theme slug; `UNCATEGORIZED_THEME` keys the Uncategorized overlay.
 */
export interface BuildThemeViewOptions {
    date: string;
    weekday?: string;
    /** Per-theme display overlays, keyed by theme slug. */
    themeMeta?: Record<string, {
        heading?: string;
        headingPrefix?: string;
        reasoning?: string;
        callout?: string;
    }>;
    /** Explicit Your-call blocks (auto-promoted ⚠ items are added on top). */
    choices?: ChecklistChoice[];
    /** Chef `## Notes` body. */
    notes?: string;
}
/**
 * Build a `ThemeView` from the meeting inputs: cluster them by theme (Gate 1),
 * then materialize the render groups in cluster order, ALWAYS appending a
 * `## Uncategorized` group last even when no meeting routed there (plan D7 /
 * MOCK §4 — the clusterer only emits Uncategorized when non-empty; the RENDER
 * adds the always-present structural affordance).
 *
 * COUNT CONSERVATION (AC3): the clusterer asserts items-in === items-out; this
 * builder neither adds nor drops items, it only wraps clusters with display
 * metadata + the always-present (possibly empty) Uncategorized group.
 */
export declare function buildThemeView(inputs: ThemeMeetingInput[], opts: BuildThemeViewOptions): ThemeView;
/**
 * Resolve a meeting's COARSE dominant theme from its `topics:` frontmatter
 * (the shipped Step-2.0 assignment surface — plan W1/D3), deterministically:
 *
 *   1. the first `topics:` entry that matches an ACTIVE PROJECT slug
 *      (project-primary — plan D2), else
 *   2. the first that matches an ACTIVE AREA slug (area-fallback), else
 *   3. the first topic entry (a non-empty assignment the chef made that we
 *      don't recognize — still better than dropping to Uncategorized; surfaces
 *      visibly under its own heading), else
 *   4. `undefined` → the caller routes the meeting to `## Uncategorized` (D7).
 *
 * Pure + order-preserving: `topics` is scanned in its frontmatter order, so the
 * result is stable. Slugs are compared case-sensitively after trimming (slugs
 * are already normalized lowercase by the writer). Blank/whitespace topics are
 * skipped.
 */
export declare function pickDominantTheme(topics: string[] | undefined, activeProjects: string[], activeAreas: string[]): string | undefined;
//# sourceMappingURL=winddown-theme-render.d.ts.map