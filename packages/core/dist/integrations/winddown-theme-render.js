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
import { renderItemLine, isUncertain, isOthersAction, sortByTier, uncertainItemToChoice, renderChoices, } from './winddown-checklist.js';
import { clusterMeetingsByTheme, UNCATEGORIZED_THEME, } from './winddown-theme-cluster.js';
// ---------------------------------------------------------------------------
// Per-item helpers
// ---------------------------------------------------------------------------
/** True when the item's meta marks it superseded (theme-render W2 discriminator). */
function isSuperseded(meta) {
    return meta?.skipKind === 'superseded';
}
/**
 * Build the theme-mode line decoration for one item. The source tag is the
 * meeting's `label` (e.g. "15:00 spec-sync") when present — purely cosmetic
 * context (MOCK shows `*(15:00 …)*`). Superseded items get the strikethrough +
 * arc-note treatment (D6). Returns undefined when no decoration applies, so the
 * shared line is emitted exactly as in checklist mode.
 */
function lineDecoration(meeting, meta) {
    const superseded = isSuperseded(meta);
    const sourceTag = meeting.label && meeting.label.trim() !== ''
        ? `*(${meeting.label.trim()})*`
        : undefined;
    if (!superseded && !sourceTag)
        return undefined;
    return { superseded, sourceTag };
}
/**
 * Render one consolidated section (Decisions / Action items / Learnings) for a
 * whole theme: walk the theme's meetings in chronological order, and within
 * each meeting tier-sort the items. Uncertain items are excluded (they go to
 * Your-call). For action items, third-party (`direction: none`) items are
 * routed to a separate FYI sub-block (re-homed from `renderMeeting`).
 *
 * Returns `''` when the section has no visible items.
 */
function renderThemeSection(heading, kind, meetings, opts = {}) {
    const lines = [];
    const fyiLines = [];
    for (const input of meetings) {
        const m = input.meeting;
        const meta = m.meta;
        const visible = m.sections[kind].filter((i) => !isUncertain(meta[i.id]));
        const ordered = sortByTier(visible, meta);
        for (const item of ordered) {
            const im = meta[item.id];
            const deco = lineDecoration(m, im);
            if (opts.isAction && isOthersAction(im)) {
                // FYI: visibility-only, force-unchecked (D7). Keep its anchor + source.
                fyiLines.push(renderItemLine(item, m.slug, im, { isAction: true, forceUnchecked: true, theme: deco }));
            }
            else {
                lines.push(renderItemLine(item, m.slug, im, { isAction: opts.isAction, theme: deco }));
            }
        }
    }
    if (lines.length === 0 && fyiLines.length === 0)
        return '';
    const parts = [];
    if (lines.length > 0)
        parts.push(`**${heading}**\n${lines.join('\n')}`);
    if (fyiLines.length > 0)
        parts.push(`_Others' actions (FYI)_\n${fyiLines.join('\n')}`);
    return parts.join('\n\n');
}
/** Render one project/area (or Uncategorized) theme group. */
function renderThemeGroup(group) {
    const headingText = group.uncategorized
        ? 'Uncategorized'
        : group.heading && group.heading.trim() !== ''
            ? group.heading.trim()
            : group.theme;
    const prefix = group.uncategorized
        ? '⚠ '
        : group.headingPrefix && group.headingPrefix.trim() !== ''
            ? `${group.headingPrefix.trim()} `
            : '';
    const header = `## ${prefix}${headingText}`;
    const blocks = [header];
    if (group.uncategorized) {
        // D7 / MOCK §Uncategorized: a structural affordance, always present.
        blocks.push(group.reasoning && group.reasoning.trim() !== ''
            ? `*${group.reasoning.trim()}*`
            : '*Items whose meeting matched no active project/area. Visible by construction — never dropped.*');
    }
    else if (group.reasoning && group.reasoning.trim() !== '') {
        blocks.push(`*${group.reasoning.trim()}*`);
    }
    if (group.uncategorized) {
        // Uncategorized is a flat list of every routed item (no Decisions/Action/
        // Learnings split — MOCK §Uncategorized renders a single bullet list). Walk
        // chronologically, all three kinds, tier-sorted within meeting.
        const lines = [];
        for (const input of group.meetings) {
            const m = input.meeting;
            const all = [
                ...m.sections.actionItems,
                ...m.sections.decisions,
                ...m.sections.learnings,
            ].filter((i) => !isUncertain(m.meta[i.id]));
            for (const item of sortByTier(all, m.meta)) {
                const im = m.meta[item.id];
                const isAction = m.sections.actionItems.some((a) => a.id === item.id);
                // Parity (FIX 2): a `direction: none` FYI action must be force-unchecked
                // here too — same as the normal theme path (renderThemeSection) and
                // checklist mode — so it never reads as John's pre-filled to-do (D7).
                const forceUnchecked = isAction && isOthersAction(im);
                lines.push(renderItemLine(item, m.slug, im, { isAction, forceUnchecked, theme: lineDecoration(m, im) }));
            }
        }
        if (lines.length > 0)
            blocks.push(lines.join('\n'));
    }
    else {
        const decisions = renderThemeSection('Decisions', 'decisions', group.meetings);
        const actions = renderThemeSection('Action items', 'actionItems', group.meetings, { isAction: true });
        const learnings = renderThemeSection('Learnings', 'learnings', group.meetings);
        for (const b of [decisions, actions, learnings])
            if (b !== '')
                blocks.push(b);
    }
    if (group.callout && group.callout.trim() !== '') {
        blocks.push(group.callout
            .trim()
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'));
    }
    return blocks.join('\n\n');
}
// ---------------------------------------------------------------------------
// Full doc render
// ---------------------------------------------------------------------------
/**
 * The fixed legend shown under the title (theme view variant — MOCK §legend).
 */
const THEME_LEGEND = '> Review: check items to commit, uncheck to drop, edit text freely, then `arete winddown apply` ' +
    '<date>.\n> Pre-checked `[x]` = high-confidence keeps (the chef elevated them). `[ ]` = your call. ' +
    'Superseded items stay unchecked with the arc shown — re-check to rescue.';
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
export function renderThemeView(view) {
    // Promote uncertain per-meeting items into choices (count-conservation: an
    // uncertain item shows in Your-call, not its theme section — same as checklist).
    const autoChoices = [];
    for (const group of view.themes) {
        for (const input of group.meetings) {
            const m = input.meeting;
            const all = [...m.sections.actionItems, ...m.sections.decisions, ...m.sections.learnings];
            for (const item of all) {
                const meta = m.meta[item.id];
                if (isUncertain(meta))
                    autoChoices.push(uncertainItemToChoice(item, m.slug, meta));
            }
        }
    }
    const allChoices = [...view.choices, ...autoChoices];
    const dateLabel = view.weekday ? `${view.date} (${view.weekday})` : view.date;
    const parts = [`# Daily Winddown — ${dateLabel} (theme view)`, THEME_LEGEND];
    const choicesBlock = renderChoices(allChoices);
    if (choicesBlock)
        parts.push(choicesBlock);
    for (const group of view.themes) {
        parts.push(renderThemeGroup(group));
    }
    if (view.notes && view.notes.trim() !== '') {
        parts.push(`## Notes (chef reasoning — assignments & arc)\n\n${view.notes.trim()}`);
    }
    return parts.join('\n\n---\n\n') + '\n';
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
export function buildThemeView(inputs, opts) {
    const { clusters } = clusterMeetingsByTheme(inputs);
    const themeMeta = opts.themeMeta ?? {};
    const groups = [];
    let sawUncategorized = false;
    for (const cluster of clusters) {
        if (cluster.uncategorized)
            sawUncategorized = true;
        groups.push(toRenderGroup(cluster, themeMeta[cluster.theme]));
    }
    // D7: ALWAYS render Uncategorized, even when empty. The clusterer emits it
    // only when it has members AND always last; if it never appeared, append an
    // empty structural group here.
    if (!sawUncategorized) {
        groups.push(toRenderGroup({ theme: UNCATEGORIZED_THEME, uncategorized: true, meetings: [] }, themeMeta[UNCATEGORIZED_THEME]));
    }
    return {
        date: opts.date,
        weekday: opts.weekday,
        themes: groups,
        choices: opts.choices ?? [],
        notes: opts.notes,
    };
}
function toRenderGroup(cluster, meta) {
    return {
        theme: cluster.theme,
        uncategorized: cluster.uncategorized,
        heading: meta?.heading,
        headingPrefix: meta?.headingPrefix,
        reasoning: meta?.reasoning,
        callout: meta?.callout,
        meetings: cluster.meetings,
    };
}
// ---------------------------------------------------------------------------
// pickDominantTheme — coarse meeting→theme resolution (plan D3, flag dispatch)
// ---------------------------------------------------------------------------
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
export function pickDominantTheme(topics, activeProjects, activeAreas) {
    if (!Array.isArray(topics))
        return undefined;
    const clean = topics.map((t) => (typeof t === 'string' ? t.trim() : '')).filter((t) => t !== '');
    if (clean.length === 0)
        return undefined;
    // FIX 3: normalize slug FORMS on both sides before matching. `listActiveSpine`
    // returns bare basenames (`engineering-management`), but a `topics:` entry may
    // be written path-qualified (`areas/engineering-management`,
    // `projects/active/foo`, or `projects/foo`). Compare bare basenames so a
    // path-qualified topic still matches its project/area instead of silently
    // falling through to branch 3 and losing the classification.
    const projectSet = new Set(activeProjects.map((s) => bareSlug(s)).filter((s) => s !== ''));
    const areaSet = new Set(activeAreas.map((s) => bareSlug(s)).filter((s) => s !== ''));
    for (const t of clean)
        if (projectSet.has(bareSlug(t)))
            return bareSlug(t); // 1. project-primary
    for (const t of clean)
        if (areaSet.has(bareSlug(t)))
            return bareSlug(t); //    2. area-fallback
    return clean[0]; //                                                            3. first topic
}
/**
 * Strip a leading `areas/`, `projects/active/`, or `projects/` path prefix and
 * trim, yielding a bare slug for comparison (FIX 3). Order matters:
 * `projects/active/` must be tried before the shorter `projects/` so the more
 * specific prefix wins.
 */
function bareSlug(s) {
    let v = s.trim();
    if (v.startsWith('areas/'))
        v = v.slice('areas/'.length);
    else if (v.startsWith('projects/active/'))
        v = v.slice('projects/active/'.length);
    else if (v.startsWith('projects/'))
        v = v.slice('projects/'.length);
    return v.trim();
}
//# sourceMappingURL=winddown-theme-render.js.map