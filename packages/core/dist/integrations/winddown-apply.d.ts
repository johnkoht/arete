/**
 * Winddown approval-doc apply mapper (W3/W4 — winddown-approval-doc plan).
 *
 * Reads a SAVED winddown approval doc (the user has toggled checkboxes / edited
 * text), maps every checkbox / choice / action back to its hidden anchor id,
 * diffs against the agent-written BASELINE (persisted at render time), and
 * classifies each line into an apply decision. Pure functions for parse + diff
 * + classify + summary; `executeWinddownApply` performs the mutations via
 * injected primitives (no direct service deps in this module).
 *
 * Round-trip safety (W4):
 *   - Anchors are the key, never text — editing an item's text round-trips as
 *     an amendment (`edited`), not a broken mapping.
 *   - unchecked an `[x]` → `user-override` (skip, reason "user-rejected").
 *   - checked a `[ ]`    → `rescue` (approve, overrides the agent skip).
 *   - text changed, anchor intact → `edited` (amendment → staged_item_edits).
 *   - malformed / missing / unknown anchor → surfaced in `warnings`, NEVER
 *     silently dropped or mis-applied.
 *   - idempotent: re-apply over an already-applied day mutates nothing (the
 *     R7 resolvedAt guard + meeting `status: approved` guard live in the deps).
 *
 * No LLM. Parse/diff/classify/render are deterministic over the doc text.
 */
/** A single parsed checkbox/choice/action line keyed by its anchor. */
export interface ParsedLine {
    kind: 'item' | 'choice' | 'action';
    /** Stable anchor id used as the diff key. */
    anchor: string;
    /** `[x]` → true, `[ ]` → false. */
    checked: boolean;
    /** Visible text with the checkbox, markers, reason, and anchor stripped. */
    text: string;
    /**
     * The raw line text with ONLY the checkbox + trailing anchor removed — agent
     * decoration (tier marker / `— skip: …` / ↩ continues / ⤴ supersedes) is
     * PRESERVED. Used to detect user amendments without truncating an edit that
     * legitimately contains a decoration sentinel (S1): the baseline-clean `text`
     * is compared against the edited line's `rawText`, and an amended item's
     * staged text is taken from `rawText` verbatim.
     */
    rawText: string;
    /** For items: the staged item id (ai_001) + meeting slug. */
    itemId?: string;
    meetingSlug?: string;
    /** For choices: the choice key (everything after `choice:`). */
    choiceKey?: string;
    /** For actions: verb + id segments. */
    verb?: string;
    actionId?: string;
    /** D8: the (possibly edited) action body text, fenced block stripped. */
    body?: string;
}
export interface ParsedWinddownDoc {
    /** anchor → parsed line. */
    byAnchor: Map<string, ParsedLine>;
    /**
     * Checkbox lines whose anchor could not be recovered (malformed / removed).
     * Surfaced in the summary so they are never silently mis-applied (AC2).
     */
    malformed: string[];
}
/**
 * Parse a saved winddown approval doc into a keyed line map.
 * Handles item / choice / action checkboxes + D8 action bodies.
 */
export declare function parseWinddownDoc(markdown: string): ParsedWinddownDoc;
export type ItemDecision = 'approve' | 'skip' | 'user-override' | 'rescue';
export interface ItemClassification {
    itemId: string;
    meetingSlug: string;
    decision: ItemDecision;
    /** True when the visible text differs from the baseline (amendment). */
    edited: boolean;
    baselineText: string;
    editedText: string;
}
export interface ChoiceClassification {
    choiceKey: string;
    /** True when exactly this option is checked. */
    chosen: boolean;
}
export interface ActionClassification {
    verb: string;
    actionId: string;
    /** Final user intent: execute (checked) or skip (unchecked). */
    execute: boolean;
    /** Whether the user changed the checkbox vs baseline. */
    toggled: boolean;
    /** D8: final (possibly edited) body, when the action carries one. */
    body?: string;
    bodyEdited: boolean;
    baselineBody?: string;
}
export interface WinddownApplyPlan {
    date: string;
    items: ItemClassification[];
    choices: ChoiceClassification[];
    actions: ActionClassification[];
    /**
     * Lines present in the edited doc that map to no baseline anchor, plus any
     * malformed (anchorless) checkbox lines — surfaced, never applied (AC2).
     */
    warnings: string[];
}
/**
 * Diff a saved doc against the agent baseline and produce the apply plan.
 * Both docs are parsed; classification keys on anchors.
 */
export declare function buildApplyPlan(date: string, baselineMarkdown: string, editedMarkdown: string): WinddownApplyPlan;
/**
 * Render the human confirm summary (counts + edited diffs + final outbound text
 * for message actions). AC5/AC5b: the summary must match the executed mutations
 * exactly — it is computed from the SAME plan execute() consumes.
 */
export declare function renderApplySummary(plan: WinddownApplyPlan): string;
/**
 * Injected primitives — keeps this module free of direct service deps and lets
 * the CLI wire real services / tests wire fakes. Mutations route through the
 * EXISTING primitives (meeting approve/skip status writes, commitments
 * resolve/create, action drafts).
 */
export interface WinddownApplyDeps {
    /**
     * Set a staged item's status (+ optional edited text) on its meeting file.
     * Wraps `writeItemStatusToFile`.
     */
    setItemStatus: (meetingSlug: string, itemId: string, status: 'approved' | 'skipped', opts?: {
        editedText?: string;
        skipReason?: string;
    }) => Promise<void>;
    /**
     * Commit all approved items for a meeting (wraps `commitApprovedItems`).
     * Called once per touched meeting AFTER per-item statuses are written.
     * MUST be a no-op when the meeting is already approved (idempotency) and
     * signal that via the return value: `'committed'` when it mutated,
     * `'already-applied'` when it no-op'd. The engine counts only real commits.
     */
    commitMeeting: (meetingSlug: string) => Promise<'committed' | 'already-applied'>;
    /**
     * Resolve a commitment. MUST honor the R7 idempotency guard — return
     * `'already-resolved'` (no mutation) when the commitment is already resolved.
     */
    resolveCommitment: (id: string) => Promise<'resolved' | 'already-resolved'>;
    /** Create a commitment (for `act:create:*`). */
    createCommitment?: (text: string) => Promise<void>;
    /**
     * Produce/queue an outbound draft (DM/Slack/email/jira/inbox). Does NOT send
     * — the chef executes through MCP. `body` is the FINAL (possibly edited)
     * verbatim payload (D8 / AC5b).
     */
    draftAction?: (verb: string, id: string, body?: string) => Promise<void>;
}
export interface WinddownApplyResult {
    approvedItems: number;
    skippedItems: number;
    rescuedItems: number;
    overriddenItems: number;
    editedItems: number;
    meetingsCommitted: string[];
    resolvedCommitments: string[];
    alreadyResolved: string[];
    createdCommitments: number;
    draftedActions: number;
    /** Item-decision choices (`<id>@<slug>:keep|skip`) executed here. */
    choicesResolved: number;
    /** Non-item choices handed off to the chef (DRAFT choice:<key>), NOT executed. */
    choicesRecorded: number;
    warnings: string[];
}
/**
 * Execute the apply plan via injected primitives. Idempotent: re-running over
 * an already-applied day mutates nothing (deps enforce the guards).
 *
 * Order: per-item statuses first (grouped by meeting), then commit each touched
 * meeting once, then choices, then actions.
 */
export declare function executeWinddownApply(plan: WinddownApplyPlan, deps: WinddownApplyDeps): Promise<WinddownApplyResult>;
//# sourceMappingURL=winddown-apply.d.ts.map