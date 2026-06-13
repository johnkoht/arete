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
import type { StagedItem, StagedSections } from '../models/index.js';
/** Importance tier mirrored from single-pass `staged_item_importance`. */
export type ChecklistTier = 'blocker' | 'high' | 'normal';
/** Per-item judgment + status overlay sourced from meeting frontmatter maps. */
export interface ChecklistItemMeta {
    /** `staged_item_status[id]` — the agent's recommendation. */
    status?: 'approved' | 'skipped' | 'pending';
    /** `staged_item_importance[id]`. */
    tier?: ChecklistTier;
    /**
     * `staged_item_uncertain[id]` — presence of an entry means the ⚠ channel
     * fired. Empty string is a valid "uncertain, no reason given" entry.
     */
    uncertainReason?: string;
    /** `staged_item_skip_reason[id].reason` — inline reason on a skip line. */
    skipReason?: string;
    /** `staged_item_links[id]`. */
    links?: {
        continuationOf?: string;
        supersedes?: string;
    };
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
 * Decide the pre-fill checkbox state for a per-meeting item.
 * `[x]` (keep/approve) vs `[ ]` (skip). Uncertain items are handled out of
 * band (Your-call block) and should not be passed here.
 */
export declare function prefillChecked(meta: ChecklistItemMeta | undefined): boolean;
/** Tier-prefix marker, e.g. "[BLOCKER] " / "[high] " / "" for normal. */
export declare function tierMarker(tier: ChecklistTier | undefined): string;
/** Link annotation suffix (↩ continues / ⤴ supersedes) from staged_item_links. */
export declare function linkSuffix(links: ChecklistItemMeta['links']): string;
/**
 * Stable tier sort: blocker → high → normal, ties keep original (meeting) order.
 * Items with no tier sort as 'normal'.
 */
export declare function sortByTier(items: StagedItem[], meta: Record<string, ChecklistItemMeta>): StagedItem[];
/** Render one meeting's three sections under its `## <title>` header. */
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
//# sourceMappingURL=winddown-checklist.d.ts.map