/**
 * Integrations domain types.
 *
 * Imports from common.ts ONLY.
 */
import type { ItemSource } from './common.js';
/**
 * Status of an individual staged item — pending until the user acts on it.
 *
 * Producer set (R6): `'skipped'` is written by multiple producers across the
 * codebase:
 * - extract pipeline (`meeting-processing.ts`) writes `'skipped'` for
 *   extract-time existing-task matches, silent-merge reconciler decisions,
 *   etc. These extract-time writes do NOT populate `staged_item_skip_reason`.
 * - chef (winddown, phase-10 followup-2) writes `'skipped'` when cross-source
 *   evidence shows the item is already fulfilled. ALWAYS populates
 *   `staged_item_skip_reason[id]` with `setBy: 'chef'` (post-week-1) or
 *   `setBy: 'chef-proposed'` (week-1 gate, stays `'pending'`).
 * - user overrides via direct frontmatter edit OR `[[unskip]]` /
 *   `[[confirm-skip]]` directives populate `setBy: 'user'`.
 *
 * The consumer (`commitApprovedItems` filter) is shape-agnostic — only
 * cares that status !== 'approved'. The discriminator for provenance is
 * the presence + `setBy` value of `staged_item_skip_reason[id]`. See
 * `StagedItemSkipReason` JSDoc for the discriminator table.
 */
export type StagedItemStatus = Record<string, 'approved' | 'skipped' | 'pending'>;
/**
 * Reason metadata for a chef-skipped or chef-proposed staged item.
 *
 * Sibling-field shape mirrors `StagedItemEdits` / `StagedItemOwner` / etc.
 * Each entry corresponds to an item ID in `StagedItemStatus`; the presence
 * of an entry here disambiguates extract-time vs chef provenance of a
 * `'pending'` or `'skipped'` status.
 *
 * Discriminator table (M2 from phase-10-followup-2 plan v3):
 *
 *   | Producer                 | status     | skip_reason.setBy   |
 *   |--------------------------|------------|---------------------|
 *   | extract default          | 'pending'  | (undefined)         |
 *   | chef-proposed (week-1)   | 'pending'  | 'chef-proposed'     |
 *   | chef confirmed (week-2+) | 'skipped'  | 'chef'              |
 *   | user override [[unskip]] | 'pending'  | (deleted)           |
 *   | extract-time skip        | 'skipped'  | (undefined)         |
 *
 * SKILL.md winddown prose MUST filter the "Chef proposes skipping" section
 * by `staged_item_skip_reason[id]?.setBy === 'chef-proposed'`. Bare-pending
 * items (extract default) must NOT be surfaced in that section.
 */
export type StagedItemSkipReasonMeta = {
    /** Human-readable reason — e.g. "already fulfilled via slack-dm". */
    reason: string;
    /** Free-form evidence reference — e.g. "Slack DM → Jamie Burk, 2026-06-04". */
    evidence: string;
    /**
     * Provenance of the skip:
     * - `'chef'`: chef wrote the skip with confirmed/post-week-1 semantics.
     *   `staged_item_status[id] === 'skipped'`; apply drops the item.
     * - `'chef-proposed'`: chef proposed the skip in week-1 mode (first 7 days
     *   post-ship). `staged_item_status[id]` stays `'pending'`; user can
     *   confirm via `[[confirm-skip]]` (flips to `'skipped'` + `setBy: 'chef'`)
     *   or omit and let it lapse (item stages normally on apply).
     * - `'user'`: user override via `[[unskip]]` directive deletes the entry
     *   entirely rather than setting `setBy: 'user'` — this value exists as
     *   a placeholder for future direct frontmatter edits where the user
     *   wants to record a manual skip with provenance.
     */
    setBy: 'chef' | 'chef-proposed' | 'user';
    /** ISO 8601 timestamp when the entry was last written. Idempotent
     * re-writes update this on each call. */
    setAt: string;
    /**
     * Optional linkable target for a dedup / already-captured skip — the matched
     * canonical item text (or topic/item ref) this item duplicates. When present,
     * the winddown checklist renders the skip suffix as
     * `— skip: already captured as [[<matchedRef>]]` on the `[ ]` line, so the
     * user can verify Areté actually has the thing stored (single-pass Issue C).
     * Absent on chef/user skips that aren't dedup-driven (those render the plain
     * `reason`). Backward-compatible: pre-Issue-C entries have no matchedRef.
     */
    matchedRef?: string;
};
/** Map of itemId → skip reason metadata (set by chef OR user). */
export type StagedItemSkipReason = Record<string, StagedItemSkipReasonMeta>;
/** Map of itemId → edited text (only present when the user edits the default text) */
export type StagedItemEdits = Record<string, string>;
/** Owner metadata for a single action item */
export type StagedItemOwnerMeta = {
    ownerSlug?: string;
    direction?: StagedItemDirection;
    counterpartySlug?: string;
};
/** Map of itemId → owner metadata (for action items) */
export type StagedItemOwner = Record<string, StagedItemOwnerMeta>;
/**
 * Direction of an action item relative to the user.
 *
 * `'none'` (single-pass-extraction D3): team-internal / not-user-relative.
 * Never creates a commitment (D7) — visibility-only in staging. Rendered
 * with a `·` marker instead of a direction arrow.
 */
export type StagedItemDirection = 'i_owe_them' | 'they_owe_me' | 'none';
/** A single staged item extracted from a meeting file */
export type StagedItem = {
    id: string;
    text: string;
    type: 'ai' | 'de' | 'le';
    /** Origin of this item — see ItemSource in models/common.ts for value meanings */
    source?: ItemSource;
    /** LLM confidence score (0-1) for extracted items */
    confidence?: number;
    /** Owner slug for action items (who is responsible) */
    ownerSlug?: string;
    /** Direction: does the user owe them, or do they owe the user? */
    direction?: StagedItemDirection;
    /** Counterparty slug for action items (who is the other party) */
    counterpartySlug?: string;
    /** Matched text from week.md for reconciled items */
    matchedText?: string;
};
/** All three staged sections for a meeting */
export type StagedSections = {
    actionItems: StagedItem[];
    decisions: StagedItem[];
    learnings: StagedItem[];
};
/** Fathom transcript from integration */
export type FathomTranscript = {
    id: string;
    title: string;
    date: string;
    duration?: number;
    summary?: string;
    transcriptPath?: string;
    meetingId?: string;
};
/** Integration configuration (maps to IntegrationDefinition) */
export type IntegrationConfig = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    auth: IntegrationAuth;
    status: 'available' | 'planned';
};
/** Integration auth configuration */
export type IntegrationAuth = {
    type: 'api_key' | 'oauth' | 'none';
    envVar?: string;
    configKey?: string;
    instructions?: string;
};
/** Integration definition */
export type IntegrationDefinition = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    auth: IntegrationAuth;
    status: 'available' | 'planned';
};
/** Seedable/pullable integration config */
export type ScriptableIntegration = {
    name: string;
    displayName: string;
    description: string;
    defaultDays: number;
    maxDays?: number;
    script: string;
    command: string;
};
/** Result from running an integration script */
export type ScriptResult = {
    stdout: string;
    stderr: string;
    code?: number;
};
/** Options for pull operations */
export type PullOptions = {
    integration: string;
    days?: number;
    force?: boolean;
    /** Notion: array of page URLs or IDs to pull */
    pages?: string[];
    /** Notion: where to save pulled pages */
    destination?: string;
};
/** Result of a pull operation */
export type PullResult = {
    integration: string;
    itemsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    errors: string[];
};
/** Integration status from config file */
export type IntegrationStatus = 'active' | 'inactive' | 'error' | null;
/** Entry returned by IntegrationService.list() */
export type IntegrationListEntry = {
    name: string;
    displayName: string;
    description: string;
    implements: string[];
    status: 'available' | 'planned';
    configured: IntegrationStatus;
    active: boolean;
};
//# sourceMappingURL=integrations.d.ts.map