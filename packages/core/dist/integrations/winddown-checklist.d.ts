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
 * Pre-fill semantics (W4 B-1 — conservative-but-confident default):
 *   - elevated === true           → `[x]` (chef confidently keeps — the new
 *                                    structural signal, see staged-items B-2)
 *   - status 'approved'           → `[x]` (post-apply only; never set pre-apply)
 *   - status 'skipped'            → `[ ]` + skip reason
 *   - status 'pending'            → `[ ]` (NOT pre-checked — the W4 flip;
 *                                    pending should be rare, the chef elevates
 *                                    confident keeps and skips the rest)
 *   - no meta                     → `[ ]` (was `[x]`; nothing to vouch for it)
 *   - uncertain (⚠ channel)       → "Your call" question block, never pre-filled
 *
 * The flip from "pre-check by default" to "pre-check only what's vouched for"
 * is the anti-blanket-approval guarantee: the doc never silently pre-commits an
 * item the chef didn't explicitly elevate. Combined with B-2 (elevation ≠
 * commit-ready), the user can't accidentally over-commit.
 *
 * Anchors:
 *   - item:   `<!-- <id>@<slug> -->`            e.g. `<!-- ai_001@anthony -->`
 *   - choice: `<!-- choice:<key> -->`           e.g. `<!-- choice:ai_007>acc2a220 -->`
 *   - action: `<!-- act:<verb>:<id> -->`        e.g. `<!-- act:resolve:d9bee08c -->`
 */
import type { StagedItem, StagedItemDirection, StagedSections } from '../models/index.js';
/** Importance tier mirrored from single-pass `staged_item_importance`. */
export type ChecklistTier = 'blocker' | 'high' | 'normal';
/** Per-item judgment + status overlay sourced from meeting frontmatter maps. */
export interface ChecklistItemMeta {
    /** `staged_item_status[id]` — the agent's recommendation. */
    status?: 'approved' | 'skipped' | 'pending';
    /**
     * `staged_item_elevated[id]` (W4 B-2) — `true` when the chef confidently
     * keeps this item during the reconcile pass. Pre-checks the box (`[x]`) in
     * the render WITHOUT being commit-able: only the apply checkbox-diff promotes
     * a left-checked item to `'approved'`. NEVER read by the commit filter.
     */
    elevated?: boolean;
    /** `staged_item_importance[id]`. */
    tier?: ChecklistTier;
    /**
     * `staged_item_uncertain[id]` — presence of an entry means the ⚠ channel
     * fired. Empty string is a valid "uncertain, no reason given" entry.
     */
    uncertainReason?: string;
    /** `staged_item_skip_reason[id].reason` — inline reason on a skip line. */
    skipReason?: string;
    /**
     * `staged_item_skip_reason[id].matchedRef` (Issue C) — the matched canonical
     * item/topic this skip duplicates. When present on a `[ ]` line, the renderer
     * shows `— skip: already captured as [[<matchedRef>]]` (a verifiable link)
     * instead of the raw reason. Only meaningful on unchecked lines.
     */
    skipMatchedRef?: string;
    /** `staged_item_links[id]`. */
    links?: {
        continuationOf?: string;
        supersedes?: string;
    };
    /**
     * `staged_item_owner[id].direction` (single-pass D3). Drives the owner tag
     * suffix + routing of `none` (third-party) action items into the FYI group.
     */
    direction?: StagedItemDirection;
    /** `staged_item_owner[id].ownerSlug` — who is responsible. */
    ownerSlug?: string;
    /** `staged_item_owner[id].counterpartySlug` — the other party. */
    counterpartySlug?: string;
}
/**
 * One meeting's staged items + the frontmatter overlay maps keyed by item id.
 * `slug` is the meeting file basename (without `.md`) — it forms the second
 * half of every item anchor (`<!-- ai_001@<slug> -->`) so the apply mapper can
 * resolve the line back to the right meeting file.
 */
export interface ChecklistMeeting {
    slug: string;
    title: string;
    /** Optional time/label suffix shown after the title, e.g. "(2:30p)". */
    label?: string;
    sections: StagedSections;
    meta: Record<string, ChecklistItemMeta>;
}
/**
 * An uncertain item promoted to a "Your call" question with option-checkboxes.
 * NONE pre-filled (D2) — the user must pick (or leave pending → re-asked).
 */
export interface ChecklistChoice {
    /** Short question / framing line (no checkbox). */
    question: string;
    options: Array<{
        label: string;
        /** Anchor key — rendered as `<!-- choice:<key> -->`. */
        key: string;
        /** Recommended option gets a "(recommended)" annotation, still unchecked. */
        recommended?: boolean;
    }>;
}
/**
 * A cross-cutting proposed action (resolve/create commitment, DM, jira, inbox).
 * Pre-filled with the agent's recommendation (`recommend`).
 *
 * D8: an action carrying a `body` (Slack/DM/email draft, jira title+desc)
 * renders the body as an indented fenced block under the checkbox. The anchor
 * scopes the WHOLE block; apply reads the (possibly edited) body verbatim.
 */
export interface ChecklistAction {
    /** Verb segment of the anchor, e.g. 'resolve', 'dm', 'jira', 'inbox', 'create'. */
    verb: string;
    /** Id segment of the anchor (unique within verb), e.g. a commitment id or slug. */
    id: string;
    /** One-line description shown on the checkbox line. */
    description: string;
    /** Agent recommendation: true → `[x]`, false → `[ ]` (+ reason). */
    recommend: boolean;
    /** Inline reason (shown after `— skip:` when not recommended, else after `—`). */
    reason?: string;
    /**
     * D8 editable payload. When present, rendered as an indented fenced block.
     * The label precedes the block (e.g. "edit this message before apply —
     * sent verbatim:"). Apply reads the edited body verbatim.
     */
    body?: {
        label?: string;
        text: string;
    };
}
/** Full input view for one winddown render. */
export interface ChecklistView {
    date: string;
    /** Optional weekday label, e.g. "Tue". */
    weekday?: string;
    meetings: ChecklistMeeting[];
    /** "Your call" uncertain blocks (W2). Rendered first. */
    choices: ChecklistChoice[];
    /** Proposed actions (W2). Rendered after meetings. */
    actions: ChecklistAction[];
}
export declare function itemAnchor(id: string, slug: string): string;
export declare function choiceAnchor(key: string): string;
export declare function actionAnchor(verb: string, id: string): string;
/** Regexes that recover anchors from a saved doc (apply mapper). */
export declare const ITEM_ANCHOR_RE: RegExp;
export declare const CHOICE_ANCHOR_RE: RegExp;
export declare const ACTION_ANCHOR_RE: RegExp;
/** True when the ⚠ channel fired for this item (routes to "Your call"). */
export declare function isUncertain(meta: ChecklistItemMeta | undefined): boolean;
/**
 * Decide the pre-fill checkbox state for a per-meeting item (W4 B-1 —
 * conservative-but-confident). `[x]` (keep/approve) vs `[ ]` (skip). Uncertain
 * items are handled out of band (Your-call block) and should not be passed here.
 *
 * Pre-check (`[x]`) ONLY when the item is explicitly vouched for:
 *   - `elevated === true` — the chef confidently keeps it (the B-2 signal), OR
 *   - `status === 'approved'` — post-apply state (never set pre-apply).
 * Everything else — `'pending'`, `'skipped'`, or no meta — pre-fills `[ ]`.
 * This is the W4 flip: pre-W4 the default (pending / no-meta) was `[x]`, which
 * silently pre-committed un-vouched items (blanket approval). Now nothing is
 * pre-checked unless the chef elevated it or it was already approved.
 */
export declare function prefillChecked(meta: ChecklistItemMeta | undefined): boolean;
/** Tier-prefix marker, e.g. "[BLOCKER] " / "[high] " / "" for normal. */
export declare function tierMarker(tier: ChecklistTier | undefined): string;
/** Workspace owner slug — direction is always relative to John. */
export declare const WORKSPACE_OWNER_SLUG = "john-koht";
/** True when this action item is a third-party action (`direction: none`). */
export declare function isOthersAction(meta: ChecklistItemMeta | undefined): boolean;
/**
 * Owner/direction tag suffix for an ACTION ITEM line (single-pass D3 / D7).
 * Direction is relative to the workspace owner (John):
 *   - `i_owe_them` → ` · (you → @counterparty)` — John owes the counterparty
 *   - `they_owe_me`→ ` · (@owner → you)`        — counterparty owes John
 *   - `none`       → ` · (@owner's — FYI)`       — a third party's action
 * Returns '' when there is no usable owner/direction (decisions/learnings, or
 * action items the extractor left untyped). The chef may prettify slugs → names.
 */
export declare function ownerTag(meta: ChecklistItemMeta | undefined): string;
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
export declare function skipSuffix(meta: ChecklistItemMeta | undefined): string;
/** Link annotation suffix (↩ continues / ⤴ supersedes) from staged_item_links. */
export declare function linkSuffix(links: ChecklistItemMeta['links']): string;
/**
 * Stable tier sort: blocker → high → normal, ties keep original (meeting) order.
 * Items with no tier sort as 'normal'.
 */
export declare function sortByTier(items: StagedItem[], meta: Record<string, ChecklistItemMeta>): StagedItem[];
/** Render one meeting's sections under its `## <title>` header. */
export declare function renderMeeting(meeting: ChecklistMeeting): string;
/**
 * Public W1 entry point: render ONE meeting's staged items as the checklist
 * markdown surface. Unit-tested directly on fixtures.
 */
export declare function renderStagedItemsAsChecklist(meeting: ChecklistMeeting): string;
/** Render the uncertain items already in `view.choices` as a Your-call block. */
export declare function renderChoices(choices: ChecklistChoice[]): string;
/**
 * Render an uncertain PER-MEETING item as a Your-call question (W2).
 * The single "keep / skip" decision is offered as two choice options whose
 * anchors carry the item id so apply can resolve them back to the meeting.
 */
export declare function uncertainItemToChoice(item: StagedItem, slug: string, meta: ChecklistItemMeta): ChecklistChoice;
/** Render the proposed-actions block (W2 + D8 editable bodies). */
export declare function renderActions(actions: ChecklistAction[]): string;
/**
 * Render the full winddown approval doc body (header + Your-call + meetings +
 * actions). This is the agent-written BASELINE that apply diffs against.
 *
 * Uncertain per-meeting items are auto-promoted into the Your-call block
 * (merged ahead of any explicit `view.choices`) so the surface always forces a
 * pick for ⚠ items (D2/D5).
 */
export declare function renderWinddownDoc(view: ChecklistView): string;
/**
 * Build the per-meeting `ChecklistMeeting` portion of a `ChecklistView` from a
 * meeting file's RAW markdown content (frontmatter + body). Pure: the caller
 * reads the file; this assembles the staged sections + the overlay maps the
 * renderer consumes. Mirrors the single_pass writer keys:
 *   - `staged_item_status`     → ChecklistItemMeta.status
 *   - `staged_item_elevated`   → .elevated (W4 B-2 — chef confident keep ⇒ [x])
 *   - `staged_item_importance` → .tier
 *   - `staged_item_uncertain`  → .uncertainReason (presence ⇒ ⚠ channel)
 *   - `staged_item_skip_reason`→ .skipReason (the `.reason` field)
 *   - `staged_item_links`      → .links
 *
 * `slug` forms the second half of every item anchor (`<!-- ai_001@<slug> -->`)
 * so the apply mapper resolves the line back to this meeting file.
 */
export declare function buildChecklistMeeting(content: string, meta: {
    slug: string;
    title: string;
    label?: string;
}): ChecklistMeeting;
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
export declare function renderStagedBlock(meetings: ChecklistMeeting[]): string;
//# sourceMappingURL=winddown-checklist.d.ts.map