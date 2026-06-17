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
import { parseStagedSections, parseStagedItemStatus, parseStagedItemImportance, parseStagedItemUncertain, parseStagedItemLinks, parseStagedItemSkipReason, parseStagedItemOwner, } from './staged-items.js';
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
/** Workspace owner slug — direction is always relative to John. */
export const WORKSPACE_OWNER_SLUG = 'john-koht';
/** True when this action item is a third-party action (`direction: none`). */
export function isOthersAction(meta) {
    return meta?.direction === 'none';
}
/**
 * Owner/direction tag suffix for an ACTION ITEM line (single-pass D3 / D7).
 * Direction is relative to the workspace owner (John):
 *   - `i_owe_them` → ` · (you → @counterparty)` — John owes the counterparty
 *   - `they_owe_me`→ ` · (@owner → you)`        — counterparty owes John
 *   - `none`       → ` · (@owner's — FYI)`       — a third party's action
 * Returns '' when there is no usable owner/direction (decisions/learnings, or
 * action items the extractor left untyped). The chef may prettify slugs → names.
 */
export function ownerTag(meta) {
    if (!meta || !meta.direction)
        return '';
    const owner = meta.ownerSlug ? `@${meta.ownerSlug}` : 'they';
    const counterparty = meta.counterpartySlug ? `@${meta.counterpartySlug}` : 'them';
    if (meta.direction === 'i_owe_them')
        return `  · (you → ${counterparty})`;
    if (meta.direction === 'they_owe_me')
        return `  · (${owner} → you)`;
    // none → third-party action, visibility-only (never John's commitment, D7)
    return `  · (${owner}'s — FYI)`;
}
/**
 * Terse skip-reason suffix for an UNCHECKED (`[ ]`) line (Issue C). Records WHY
 * the agent pre-filled skip — one clause, only ever on `[ ]` items.
 *
 * Highest-value case: a dedup / already-captured skip carrying a `matchedRef`
 * renders `— skip: already captured as [[<matchedRef>]]`, the matched target
 * linked so the user can verify Areté has it stored (reusing the `[[…]]` link
 * form). Otherwise falls back to the raw reason (`— skip: <reason>`). Returns ''
 * when there is no reason. Kept short to avoid clutter (John's worry).
 */
export function skipSuffix(meta) {
    if (!meta)
        return '';
    if (meta.skipMatchedRef && meta.skipMatchedRef.trim() !== '') {
        return ` — skip: already captured as [[${meta.skipMatchedRef.trim()}]]`;
    }
    if (meta.skipReason && meta.skipReason.trim() !== '') {
        return ` — skip: ${meta.skipReason.trim()}`;
    }
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
 *
 * `isAction` adds the owner/direction tag (action items only — decisions and
 * learnings have no direction). `forceUnchecked` renders `[ ]` regardless of
 * the agent's recommendation — used for the "Others' actions (FYI)" group,
 * which is visibility-only and must never read as John's pre-filled to-do (D7).
 */
function renderItemLine(item, slug, meta, opts = {}) {
    const checked = opts.forceUnchecked ? false : prefillChecked(meta);
    const box = checked ? '[x]' : '[ ]';
    const marker = tierMarker(meta?.tier);
    let text = item.text;
    // Skip reason inline (only on unchecked lines — the agent-recommended skip).
    // FYI (none) items are force-unchecked for visibility, NOT skipped, so we
    // don't decorate them with a skip reason. Issue C: a dedup/already-captured
    // skip renders `— skip: already captured as [[<match>]]` (verifiable link).
    if (!checked && !opts.forceUnchecked) {
        text = `${text}${skipSuffix(meta)}`;
    }
    const owner = opts.isAction ? ownerTag(meta) : '';
    const link = linkSuffix(meta?.links);
    return `- ${box} ${marker}${text}${owner}${link}  ${itemAnchor(item.id, slug)}`;
}
/** Render a `### <Heading>` block for one item type, or '' if empty. */
function renderSection(heading, items, slug, meta, opts = {}) {
    // Uncertain items are pulled into the Your-call block, not rendered here.
    const visible = items.filter((i) => !isUncertain(meta[i.id]));
    if (visible.length === 0)
        return '';
    const ordered = sortByTier(visible, meta);
    const lines = ordered.map((i) => renderItemLine(i, slug, meta[i.id], opts));
    return `### ${heading}\n${lines.join('\n')}`;
}
/**
 * Render the "Others' actions (FYI)" block — `direction: none` action items
 * (third-party actions). Visibility-only per D7: rendered NOT pre-filled `[ ]`,
 * never reading as John's commitments, but keeping their anchors (apply ignores
 * non-`[x]` lines + a `none` item creates no commitment regardless). Returns ''
 * when there are no `none` items.
 */
function renderOthersActions(items, slug, meta) {
    const visible = items.filter((i) => !isUncertain(meta[i.id]) && isOthersAction(meta[i.id]));
    if (visible.length === 0)
        return '';
    const ordered = sortByTier(visible, meta);
    const lines = ordered.map((i) => renderItemLine(i, slug, meta[i.id], { isAction: true, forceUnchecked: true }));
    return `#### Others' actions (FYI)\n${lines.join('\n')}`;
}
/** Render one meeting's sections under its `## <title>` header. */
export function renderMeeting(meeting) {
    const header = meeting.label
        ? `## ${meeting.title}   ·   ${meeting.label}`
        : `## ${meeting.title}`;
    const meta = meeting.meta;
    // Split action items: John's (i_owe_them / they_owe_me) stay in the actionable
    // list; third-party (`direction: none`) move to the FYI subsection (finding #8).
    const actionable = meeting.sections.actionItems.filter((i) => !isOthersAction(meta[i.id]));
    const blocks = [
        renderSection('Action items', actionable, meeting.slug, meta, { isAction: true }),
        renderOthersActions(meeting.sections.actionItems, meeting.slug, meta),
        renderSection('Decisions', meeting.sections.decisions, meeting.slug, meta),
        renderSection('Learnings', meeting.sections.learnings, meeting.slug, meta),
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
// ---------------------------------------------------------------------------
// View builder — frontmatter + body → ChecklistMeeting (deterministic, no I/O)
// ---------------------------------------------------------------------------
/**
 * Build the per-meeting `ChecklistMeeting` portion of a `ChecklistView` from a
 * meeting file's RAW markdown content (frontmatter + body). Pure: the caller
 * reads the file; this assembles the staged sections + the overlay maps the
 * renderer consumes. Mirrors the single_pass writer keys:
 *   - `staged_item_status`     → ChecklistItemMeta.status
 *   - `staged_item_importance` → .tier
 *   - `staged_item_uncertain`  → .uncertainReason (presence ⇒ ⚠ channel)
 *   - `staged_item_skip_reason`→ .skipReason (the `.reason` field)
 *   - `staged_item_links`      → .links
 *
 * `slug` forms the second half of every item anchor (`<!-- ai_001@<slug> -->`)
 * so the apply mapper resolves the line back to this meeting file.
 */
export function buildChecklistMeeting(content, meta) {
    // parseStagedSections takes the BODY; the frontmatter parsers take full content.
    const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = fmMatch ? fmMatch[1] : content;
    const sections = parseStagedSections(body);
    const status = parseStagedItemStatus(content);
    const importance = parseStagedItemImportance(content);
    const uncertain = parseStagedItemUncertain(content);
    const links = parseStagedItemLinks(content);
    const skipReason = parseStagedItemSkipReason(content);
    const owner = parseStagedItemOwner(content);
    const itemMeta = {};
    const allItems = [
        ...sections.actionItems,
        ...sections.decisions,
        ...sections.learnings,
    ];
    // Owner/direction fields may live in the `staged_item_owner` frontmatter map
    // OR be inline in the action-item text (parseStagedSections extracts both).
    // Frontmatter takes precedence; text-parsed values are the fallback.
    const itemById = new Map(allItems.map((i) => [i.id, i]));
    for (const item of allItems) {
        const id = item.id;
        const m = {};
        if (status[id])
            m.status = status[id];
        if (importance[id])
            m.tier = importance[id];
        // PRESENCE in the uncertain map (even empty string) ⇒ ⚠ channel fired.
        if (Object.prototype.hasOwnProperty.call(uncertain, id))
            m.uncertainReason = uncertain[id];
        if (skipReason[id]) {
            m.skipReason = skipReason[id].reason;
            if (skipReason[id].matchedRef)
                m.skipMatchedRef = skipReason[id].matchedRef;
        }
        if (links[id])
            m.links = links[id];
        // Owner/direction (action items only). Frontmatter map > inline text.
        const fmOwner = owner[id];
        const textItem = itemById.get(id);
        const direction = fmOwner?.direction ?? textItem?.direction;
        const ownerSlug = fmOwner?.ownerSlug ?? textItem?.ownerSlug;
        const counterpartySlug = fmOwner?.counterpartySlug ?? textItem?.counterpartySlug;
        if (direction)
            m.direction = direction;
        if (ownerSlug)
            m.ownerSlug = ownerSlug;
        if (counterpartySlug)
            m.counterpartySlug = counterpartySlug;
        itemMeta[id] = m;
    }
    return { slug: meta.slug, title: meta.title, label: meta.label, sections, meta: itemMeta };
}
/**
 * Render only the deterministic staged-items/decisions/learnings + auto-promoted
 * "Your call" surface for a set of meetings — WITHOUT the doc title/legend
 * header or proposed-actions block. This is the block the agent splices into the
 * curated view as `## Stage for approval`, AND the verbatim baseline `apply`
 * diffs against (apply keys on hidden anchors, ignoring narrative lines).
 *
 * Uncertain per-meeting items are promoted into a leading Your-call block, same
 * as `renderWinddownDoc`, so ⚠ items always force a pick.
 */
export function renderStagedBlock(meetings) {
    const autoChoices = [];
    for (const m of meetings) {
        const all = [...m.sections.actionItems, ...m.sections.decisions, ...m.sections.learnings];
        for (const item of all) {
            const meta = m.meta[item.id];
            if (isUncertain(meta))
                autoChoices.push(uncertainItemToChoice(item, m.slug, meta));
        }
    }
    const parts = [];
    const choicesBlock = renderChoices(autoChoices);
    if (choicesBlock)
        parts.push(choicesBlock);
    for (const m of meetings) {
        const block = renderMeeting(m);
        if (block)
            parts.push(block);
    }
    return parts.join('\n\n---\n\n') + (parts.length > 0 ? '\n' : '');
}
//# sourceMappingURL=winddown-checklist.js.map