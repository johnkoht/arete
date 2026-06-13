/**
 * Winddown approval-doc renderer (W1/W2 — winddown-approval-doc plan).
 *
 * Pure, deterministic functions that render staged meeting items + cross-cutting
 * proposed actions as the checkbox-approval markdown surface described in
 * `dev/work/plans/winddown-approval-doc/mockup.md`. No LLM, no I/O.
 *
 * The renderer pre-fills the agent's recommendation as `- [x]` / `- [ ]`
 * checkboxes grouped by meeting + category, stamps tier markers
 * (`[BLOCKER]` / `[high]` / `⚠`), inline skip/uncertainty reasons, and a HIDDEN
 * STABLE ANCHOR per line (`<!-- ai_001@meeting-slug -->`). The apply mapper
 * (see `winddown-apply.ts`) keys on these anchors, never on text, so editing an
 * item's text round-trips as an amendment rather than breaking the mapping.
 *
 * Pre-fill semantics (mockup §"Checkbox semantics summary"):
 *   - status 'approved'           → `[x]`
 *   - status 'skipped'            → `[ ]` + skip reason
 *   - status 'pending' + tier     → `[x]` (agent recommends keep), unless
 *                                    uncertain (⚠) → routed to "Your call",
 *                                    not pre-filled
 *   - uncertain (⚠ channel)       → "Your call" question block, never pre-filled
 *
 * Anchors:
 *   - item:   `<!-- <id>@<slug> -->`            e.g. `<!-- ai_001@anthony -->`
 *   - choice: `<!-- choice:<key> -->`           e.g. `<!-- choice:ai_007>acc2a220 -->`
 *   - action: `<!-- act:<verb>:<id> -->`        e.g. `<!-- act:resolve:d9bee08c -->`
 */
// ---------------------------------------------------------------------------
// Anchor helpers (single source of truth — apply mapper imports these)
// ---------------------------------------------------------------------------
export function itemAnchor(id, slug) {
    return `<!-- ${id}@${slug} -->`;
}
export function choiceAnchor(key) {
    return `<!-- choice:${key} -->`;
}
export function actionAnchor(verb, id) {
    return `<!-- act:${verb}:${id} -->`;
}
/** Regexes that recover anchors from a saved doc (apply mapper). */
export const ITEM_ANCHOR_RE = /<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/;
export const CHOICE_ANCHOR_RE = /<!--\s*choice:(\S+?)\s*-->/;
export const ACTION_ANCHOR_RE = /<!--\s*act:([a-z0-9-]+):(\S+?)\s*-->/;
// ---------------------------------------------------------------------------
// Pre-fill + marker logic
// ---------------------------------------------------------------------------
/** True when the ⚠ channel fired for this item (routes to "Your call"). */
export function isUncertain(meta) {
    return meta !== undefined && meta.uncertainReason !== undefined;
}
/**
 * Decide the pre-fill checkbox state for a per-meeting item.
 * `[x]` (keep/approve) vs `[ ]` (skip). Uncertain items are handled out of
 * band (Your-call block) and should not be passed here.
 */
export function prefillChecked(meta) {
    if (!meta)
        return true; // no overlay → agent keeps by default (legacy-ish)
    if (meta.status === 'skipped')
        return false;
    if (meta.status === 'approved')
        return true;
    // pending + a tier → agent recommends keep (mockup: blocker/high/normal pre-checked)
    return true;
}
/** Tier-prefix marker, e.g. "[BLOCKER] " / "[high] " / "" for normal. */
export function tierMarker(tier) {
    if (tier === 'blocker')
        return '**[BLOCKER]** ';
    if (tier === 'high')
        return '**[high]** ';
    return '';
}
/** Link annotation suffix (↩ continues / ⤴ supersedes) from staged_item_links. */
export function linkSuffix(links) {
    if (!links)
        return '';
    const parts = [];
    if (links.continuationOf)
        parts.push(`↩ continues ${links.continuationOf}`);
    if (links.supersedes)
        parts.push(`⤴ supersedes ${links.supersedes}`);
    return parts.length > 0 ? `  ${parts.join(' · ')}` : '';
}
// ---------------------------------------------------------------------------
// Tier ordering
// ---------------------------------------------------------------------------
const TIER_RANK = { blocker: 0, high: 1, normal: 2 };
/**
 * Stable tier sort: blocker → high → normal, ties keep original (meeting) order.
 * Items with no tier sort as 'normal'.
 */
export function sortByTier(items, meta) {
    return items
        .map((item, idx) => ({ item, idx }))
        .sort((a, b) => {
        const ta = TIER_RANK[meta[a.item.id]?.tier ?? 'normal'];
        const tb = TIER_RANK[meta[b.item.id]?.tier ?? 'normal'];
        if (ta !== tb)
            return ta - tb;
        return a.idx - b.idx;
    })
        .map((x) => x.item);
}
// ---------------------------------------------------------------------------
// Line rendering
// ---------------------------------------------------------------------------
/**
 * Render a single per-meeting item line (checkbox + markers + reason + anchor).
 * Returns undefined for uncertain items (they belong in the Your-call block).
 */
function renderItemLine(item, slug, meta) {
    const checked = prefillChecked(meta);
    const box = checked ? '[x]' : '[ ]';
    const marker = tierMarker(meta?.tier);
    let text = item.text;
    // Skip reason inline (only on unchecked lines — the agent-recommended skip).
    if (!checked && meta?.skipReason) {
        text = `${text} — skip: ${meta.skipReason}`;
    }
    const link = linkSuffix(meta?.links);
    return `- ${box} ${marker}${text}${link}  ${itemAnchor(item.id, slug)}`;
}
/** Render a `### <Heading>` block for one item type, or '' if empty. */
function renderSection(heading, items, slug, meta) {
    // Uncertain items are pulled into the Your-call block, not rendered here.
    const visible = items.filter((i) => !isUncertain(meta[i.id]));
    if (visible.length === 0)
        return '';
    const ordered = sortByTier(visible, meta);
    const lines = ordered.map((i) => renderItemLine(i, slug, meta[i.id]));
    return `### ${heading}\n${lines.join('\n')}`;
}
/** Render one meeting's three sections under its `## <title>` header. */
export function renderMeeting(meeting) {
    const header = meeting.label
        ? `## ${meeting.title}   ·   ${meeting.label}`
        : `## ${meeting.title}`;
    const blocks = [
        renderSection('Action items', meeting.sections.actionItems, meeting.slug, meeting.meta),
        renderSection('Decisions', meeting.sections.decisions, meeting.slug, meeting.meta),
        renderSection('Learnings', meeting.sections.learnings, meeting.slug, meeting.meta),
    ].filter((b) => b !== '');
    if (blocks.length === 0)
        return '';
    return `${header}\n\n${blocks.join('\n\n')}`;
}
/**
 * Public W1 entry point: render ONE meeting's staged items as the checklist
 * markdown surface. Unit-tested directly on fixtures.
 */
export function renderStagedItemsAsChecklist(meeting) {
    return renderMeeting(meeting);
}
// ---------------------------------------------------------------------------
// "Your call" + actions blocks (W2)
// ---------------------------------------------------------------------------
/** Render the uncertain items already in `view.choices` as a Your-call block. */
export function renderChoices(choices) {
    if (choices.length === 0)
        return '';
    const blocks = choices.map((c) => {
        const opts = c.options
            .map((o) => {
            const rec = o.recommended ? ' (recommended)' : '';
            return `   - [ ] ${o.label}${rec}   ${choiceAnchor(o.key)}`;
        })
            .join('\n');
        return `⚠ ${c.question}\n${opts}`;
    });
    return `## ⛔ Blockers & ⚠ Your call first   (decide these — not pre-filled)\n\n${blocks.join('\n\n')}`;
}
/**
 * Render an uncertain PER-MEETING item as a Your-call question (W2).
 * The single "keep / skip" decision is offered as two choice options whose
 * anchors carry the item id so apply can resolve them back to the meeting.
 */
export function uncertainItemToChoice(item, slug, meta) {
    const reason = meta.uncertainReason && meta.uncertainReason.trim() !== ''
        ? ` — ${meta.uncertainReason}`
        : '';
    return {
        question: `**${item.text}**${reason} — keep or skip?`,
        options: [
            { label: 'keep (stage it)', key: `${item.id}@${slug}:keep` },
            { label: 'skip', key: `${item.id}@${slug}:skip` },
        ],
    };
}
/** Render the proposed-actions block (W2 + D8 editable bodies). */
export function renderActions(actions) {
    if (actions.length === 0)
        return '';
    const lines = actions.map((a) => {
        const box = a.recommend ? '[x]' : '[ ]';
        let head = `- ${box} ${a.description}`;
        if (a.reason) {
            head += a.recommend ? ` — ${a.reason}` : ` — skip: ${a.reason}`;
        }
        head += `  ${actionAnchor(a.verb, a.id)}`;
        if (a.body) {
            const label = a.body.label ?? 'edit before apply — used verbatim:';
            // Indented fenced block scoped by the action anchor above.
            const fenced = a.body.text
                .split('\n')
                .map((l) => `      > ${l}`)
                .join('\n');
            head += `\n      > _${label}_\n      > \`\`\`\n${fenced}\n      > \`\`\``;
        }
        return head;
    });
    return `## Proposed actions   (cross-cutting — same check-to-do)\n\n${lines.join('\n')}`;
}
// ---------------------------------------------------------------------------
// Full doc render
// ---------------------------------------------------------------------------
/**
 * Render the full winddown approval doc body (header + Your-call + meetings +
 * actions). This is the agent-written BASELINE that apply diffs against.
 *
 * Uncertain per-meeting items are auto-promoted into the Your-call block
 * (merged ahead of any explicit `view.choices`) so the surface always forces a
 * pick for ⚠ items (D2/D5).
 */
export function renderWinddownDoc(view) {
    // Promote uncertain per-meeting items into choices.
    const autoChoices = [];
    for (const m of view.meetings) {
        const all = [
            ...m.sections.actionItems,
            ...m.sections.decisions,
            ...m.sections.learnings,
        ];
        for (const item of all) {
            const meta = m.meta[item.id];
            if (isUncertain(meta))
                autoChoices.push(uncertainItemToChoice(item, m.slug, meta));
        }
    }
    const allChoices = [...view.choices, ...autoChoices];
    const dateLabel = view.weekday ? `${view.date} (${view.weekday})` : view.date;
    const parts = [`# Daily Winddown — ${dateLabel}   ·   review & apply`];
    parts.push('> ☑ leave checked to accept · ☐ uncheck to reject · edit text to amend ·\n' +
        '> `/winddown apply` when done (shows a summary, confirms, then executes).');
    const choicesBlock = renderChoices(allChoices);
    if (choicesBlock)
        parts.push(choicesBlock);
    for (const m of view.meetings) {
        const block = renderMeeting(m);
        if (block)
            parts.push(block);
    }
    const actionsBlock = renderActions(view.actions);
    if (actionsBlock)
        parts.push(actionsBlock);
    return parts.join('\n\n---\n\n') + '\n';
}
//# sourceMappingURL=winddown-checklist.js.map