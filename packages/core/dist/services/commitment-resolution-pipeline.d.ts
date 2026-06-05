/**
 * Phase 11 11a — Gmail Sent external-resolution detection pipeline.
 *
 * Detects when an open commitment's intended action has external evidence
 * of completion in the user's Gmail Sent folder, and proposes an
 * auto-resolution at HIGH / MEDIUM / LOW confidence.
 *
 * Hybrid pipeline (mirrors commitment-dedup-pipeline.ts):
 *
 *   findResolutionEvidence(commitment, sentMessages, peopleDir)
 *     → deterministic pre-filter, NO LLM:
 *        a. suppress check        — skip if unresolveSuppressedUntil > now (G5)
 *        b. recipient match       — commitment.stakeholders[] (EXCLUDING
 *                                    role='self', M5) ↔ Sent to[]/cc[]/bcc[]
 *                                    via slug↔email people directory
 *        c. temporal window       — Sent.sentAt AFTER commitment.date (NOT
 *                                    createdAt, AC3b), within MAX window
 *        d. artifact match        — if commitment names a named artifact
 *                                    ("deck"/"doc"/"PRD"…), require attachment
 *                                    OR subject/body filename overlap
 *        e. keyword Jaccard        — pre-filter floor on commitment text vs
 *                                    subject+body
 *      → ResolutionCandidate[]  (cap top N by Jaccard)
 *
 *   runResolutionCrossCheck(commitment, candidates, callConcurrent)
 *     → LLM cross-check (fast tier, task external_resolution):
 *        "Is there evidence this action was completed?
 *         Confidence: HIGH/MEDIUM/LOW + evidence quote"
 *      → ResolutionLLMDecision per candidate
 *
 *   applyResolutionDecisions(...) → ResolutionOutcome:
 *        HIGH   → auto-resolve (or STAGE during week-1, decided by caller)
 *        MEDIUM → "possibly done, confirm?" (winddown surface only, no write)
 *        LOW    → ignore
 *
 * Pure module — NO I/O, NO filesystem, NO live Gmail/LLM. The LLM call and
 * the people directory are injected. The caller (chef-orchestrator winddown
 * wire-in) owns commitments.json lock + the Gmail Sent cache read + the
 * week-1-vs-week-2 gate decision + log writes + the still-staged ordering
 * guard (Step 6 / AC8 — see `shouldDeferToFollowup2`).
 *
 * Critical invariants:
 *   - NO production data writes from this module.
 *   - NO LLM calls without the caller-injected callConcurrent.
 *   - All inputs read-only; outputs are new objects/decisions.
 *   - MEDIUM/LOW never mutate a commitment (HARD part 1 — trust crater).
 */
import type { Commitment } from '../models/index.js';
import type { EmailThread } from '../integrations/gws/types.js';
/**
 * Permanent-suppress sentinel (M4 / AC6c). `[[unresolve <id> --permanent]]`
 * sets `unresolveSuppressedUntil` to this far-future ISO date. The pipeline's
 * suppress check treats it identically to a 14d window — never re-resolves.
 */
export declare const PERMANENT_SUPPRESS_SENTINEL = "2100-01-01T00:00:00.000Z";
/** Default 14-day suppress window for `[[unresolve]]` (G5). */
export declare const UNRESOLVE_SUPPRESS_DAYS = 14;
/**
 * Temporal window ceiling — a Sent message more than this many days AFTER
 * the commitment date is too far removed to be evidence of THIS commitment
 * (a later, unrelated send). The cache-depth ceiling (M3) bounds how far
 * BACK we look; this bounds how far FORWARD a single match may reach.
 *
 * Generous (90d) because async reviews + slow follow-through are real — but
 * not unbounded (an open commitment from Q1 should not match a Q3 email).
 */
export declare const TEMPORAL_WINDOW_FORWARD_DAYS = 90;
/** Jaccard floor for the keyword pre-filter (commitment text vs subject+body). */
export declare const RESOLUTION_JACCARD_THRESHOLD = 0.08;
/** Cap on candidates sent to the LLM per commitment (cost throttle, AC4). */
export declare const RESOLUTION_CANDIDATE_CAP = 3;
/**
 * Named-artifact vocabulary. When a commitment's text mentions one of these,
 * the candidate Sent message MUST carry corroborating artifact evidence
 * (an attachment, OR the artifact noun appearing in subject/body) to survive
 * the pre-filter. This is the false-positive guard for "Send Lindsay the
 * deck" — a Sent email with no deck attachment and no "deck" in body is NOT
 * deterministic evidence and is culled before the LLM call.
 */
export declare const ARTIFACT_NOUNS: readonly ["deck", "doc", "document", "prd", "spec", "draft", "proposal", "report", "memo", "slides", "presentation", "sheet", "spreadsheet", "pdf", "agenda", "summary", "notes", "plan", "contract", "invoice", "brief", "analysis", "review", "letter", "attachment"];
/**
 * Minimal people-directory shape the pipeline consumes for slug↔email
 * resolution. Injected (NOT a live Gmail/directory call) so the pipeline
 * stays pure + testable.
 *
 * `emailsForSlug(slug)` returns ALL known emails for a person slug
 * (normalized lowercase). Empty array = unknown slug (graceful degradation,
 * R8 — the commitment's recipient check fails closed: no email → no match).
 */
export type PeopleDirectory = {
    emailsForSlug(slug: string): string[];
};
/**
 * Build a `PeopleDirectory` from a plain `slug → emails` map. Convenience
 * for the wire-in (which reads `people/internal/*.md` frontmatter) and for
 * tests (which hand-build fixtures).
 */
export declare function peopleDirectoryFromMap(map: Record<string, string | string[] | undefined>): PeopleDirectory;
/**
 * The open-commitment shape the pipeline reads. Adapted from `Commitment`
 * via `commitmentToResolutionInput` so the pipeline API doesn't depend on
 * the full v1/v2 dual shape.
 */
export type OpenCommitmentForResolution = {
    id: string;
    text: string;
    /** ISO date (YYYY-MM-DD) — temporal-window source of truth (AC3b). */
    date: string;
    /**
     * Non-self recipient slugs (M5 — role='self' already excluded by the
     * adapter). Empty = no recipient to match against → pipeline no-matches
     * cleanly (R8 graceful degradation).
     */
    recipientSlugs: string[];
    /**
     * Structured suppress marker (G5). When set and in the future, the
     * commitment is skipped at pre-check (AC6b). `'2100-...'` = permanent (M4).
     */
    unresolveSuppressedUntil?: string;
};
/** A Sent message that survived the deterministic pre-filter. */
export type ResolutionCandidate = {
    /** Gmail thread id. */
    threadId: string;
    /** Thread subject. */
    subject: string;
    /** Clickable evidence URL (permalink). */
    url?: string;
    /** ISO8601 send timestamp (used as resolvedAt on auto-resolve). */
    sentAt: string;
    /** Which recipient slug matched (for log / explain). */
    matchedRecipientSlug: string;
    /** Which normalized email matched. */
    matchedRecipientEmail: string;
    /** Whether the artifact gate was satisfied (or N/A — no named artifact). */
    artifactMatch: boolean;
    /** Keyword Jaccard score (commitment text vs subject+body). */
    jaccard: number;
    /** First 400 chars of body (LLM input). */
    bodyExcerpt: string;
    /** Attachment filenames (LLM input). */
    attachmentNames: string[];
};
/** Why a commitment short-circuited before producing candidates. */
export type FindEvidenceResult = {
    kind: 'suppressed';
    until: string;
} | {
    kind: 'no-recipient';
} | {
    kind: 'candidates';
    candidates: ResolutionCandidate[];
};
/** LLM cross-check verdict for a single candidate. */
export type ResolutionLLMDecision = {
    threadId: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    /** Evidence quote / 1-sentence reasoning. */
    reasoning: string;
};
/**
 * Final pipeline outcome per HARD part 1.
 *
 * - `resolve-high`: HIGH confidence. Caller STAGES (week-1) or auto-mutates
 *   (week-2+ gate passed). The ONLY outcome that may write status='resolved'.
 * - `flag-medium`: MEDIUM. Winddown-surface only ("possibly done — confirm?").
 *   NEVER mutates a commitment (Q6). User adjudicates via [[confirm]].
 * - `ignore`: LOW or no candidates. No surface, no write, no log (per plan
 *   "LOW → ignore, no log").
 */
export type ResolutionOutcome = {
    kind: 'resolve-high';
    candidate: ResolutionCandidate;
    reasoning: string;
} | {
    kind: 'flag-medium';
    candidate: ResolutionCandidate;
    reasoning: string;
} | {
    kind: 'ignore';
    reason: 'no-candidates' | 'all-low' | 'suppressed' | 'no-recipient';
    until?: string;
};
/**
 * LLM injection point — same shape as commitment-dedup-pipeline's
 * `LLMCallConcurrentFn` so the wire-in can pass the same AIService binding.
 */
export type LLMCallConcurrentFn = (prompts: {
    tier: 'fast' | 'standard' | 'frontier';
    prompt: string;
}[]) => Promise<string[]>;
/**
 * True when the commitment is currently suppressed from auto-resolve.
 *
 * Structured field check (G5) — NOT a log grep. `now < unresolveSuppressedUntil`.
 * The permanent sentinel ('2100-...') compares as far-future and always
 * suppresses (M4 / AC6c).
 *
 * Exported for the wire-in's Step 2a pre-check + tests.
 */
export declare function isSuppressed(commitment: Pick<OpenCommitmentForResolution, 'unresolveSuppressedUntil'>, now?: Date): boolean;
/** Compute the 14d suppress timestamp from a base time (G5). */
export declare function computeSuppressUntil(now?: Date): string;
/**
 * Tokenize for keyword Jaccard. Lowercase, strip non-alphanumeric, drop
 * ≤2-char tokens + a small stopword set (the verbs that appear in nearly
 * every commitment would otherwise inflate overlap with unrelated emails).
 *
 * Exported for test introspection.
 */
export declare function tokenize(text: string): Set<string>;
/** Jaccard similarity of two token sets. */
export declare function jaccard(a: Set<string>, b: Set<string>): number;
/**
 * Extract the named artifacts a commitment refers to (e.g. "deck", "PRD").
 * Returns the matched artifact nouns (lowercase, deduped). Empty = the
 * commitment names no specific artifact → artifact gate is N/A (not required).
 *
 * Exported for test introspection.
 */
export declare function extractArtifactNouns(text: string): string[];
/**
 * Decide whether a Sent message corroborates the named artifact.
 *
 * Satisfied when ANY:
 *   - an attachment filename contains the artifact noun OR a generic doc ext,
 *   - the artifact noun appears in subject OR body.
 *
 * When the commitment names NO artifact (`artifactNouns` empty), returns
 * `true` (gate N/A — nothing to corroborate).
 *
 * Exported for test introspection.
 */
export declare function checkArtifactMatch(artifactNouns: string[], message: Pick<EmailThread, 'subject' | 'body' | 'attachments'>): boolean;
/**
 * True when `sentAt` is AFTER `commitmentDate` (start-of-day, inclusive of
 * same-day) and within TEMPORAL_WINDOW_FORWARD_DAYS.
 *
 * AC3b: window source-of-truth is `commitment.date` (the meeting date), NOT
 * `createdAt`. A meeting Monday → Gmail evidence Wednesday → processed
 * Thursday still resolves because Wednesday > Monday.
 *
 * A Sent message dated BEFORE the commitment date is pre-commitment and can
 * NOT be evidence (it happened before the action was promised).
 *
 * Exported for test introspection.
 */
export declare function inTemporalWindow(commitmentDate: string, sentAt: string): boolean;
/**
 * Find Sent-message candidates that could be evidence of completion for
 * `commitment`. Pure + deterministic — NO LLM, NO I/O.
 *
 * Pre-filter order (cheap → expensive):
 *   a. suppress check (G5)            → short-circuit `suppressed`
 *   b. recipient resolution (M5)      → short-circuit `no-recipient` if no
 *                                       email-resolvable non-self stakeholder
 *   c. per-message: recipient email overlap (to/cc/bcc)
 *   d. temporal window (AC3b)
 *   e. artifact gate (named artifact → require corroboration)
 *   f. keyword Jaccard floor
 *   → cap top RESOLUTION_CANDIDATE_CAP by Jaccard (cost throttle, AC4)
 *
 * @param commitment open commitment (already adapted; self stakeholders excluded)
 * @param sentMessages Gmail Sent cache threads (fetchBody=true shape)
 * @param peopleDir slug↔email resolver (injected; NOT a live call)
 * @param now current time (suppress check); defaults to wall clock
 */
export declare function findResolutionEvidence(commitment: OpenCommitmentForResolution, sentMessages: ReadonlyArray<EmailThread>, peopleDir: PeopleDirectory, now?: Date): FindEvidenceResult;
/**
 * Build the cross-check prompt for ONE commitment + its candidates.
 *
 * One prompt for all candidates (cost throttle). The model returns, per
 * numbered candidate, a confidence + a short evidence quote/reasoning.
 *
 * Exported for test introspection (golden-set prompt stability).
 */
export declare function buildResolutionPrompt(commitment: OpenCommitmentForResolution, candidates: ReadonlyArray<ResolutionCandidate>): string;
/**
 * Parse the LLM response into per-candidate decisions.
 *
 * Tolerant parser (mirrors dedup pipeline):
 *   - accepts `<N>.` / `<N>)` / `<N>:` delimiters,
 *   - verdict case-insensitive,
 *   - reasoning after `|` / `-` optional,
 *   - any candidate with no parseable line defaults to LOW (FAIL-SAFE — an
 *     unparseable response must NEVER auto-resolve; trust crater guard).
 *
 * Exported for test introspection.
 */
export declare function parseResolutionResponse(response: string, candidates: ReadonlyArray<ResolutionCandidate>): ResolutionLLMDecision[];
/**
 * Run the LLM cross-check at fast tier (task external_resolution, AC3a).
 *
 * - Empty candidates → [] (no LLM call).
 * - LLM throw → all LOW (fail-safe; never auto-resolve on a provider hiccup).
 */
export declare function runResolutionCrossCheck(commitment: OpenCommitmentForResolution, candidates: ReadonlyArray<ResolutionCandidate>, callConcurrent: LLMCallConcurrentFn, tier?: 'fast' | 'standard' | 'frontier'): Promise<ResolutionLLMDecision[]>;
/**
 * Combine candidates + LLM decisions into a single `ResolutionOutcome`.
 *
 * Precedence:
 *   - any HIGH → resolve-high at the highest-Jaccard HIGH candidate.
 *   - else any MEDIUM → flag-medium at the highest-Jaccard MEDIUM.
 *   - else → ignore (all LOW).
 *
 * MEDIUM/LOW NEVER produce a mutation outcome (HARD part 1).
 */
export declare function applyResolutionDecisions(candidates: ReadonlyArray<ResolutionCandidate>, decisions: ReadonlyArray<ResolutionLLMDecision>): ResolutionOutcome;
/**
 * Run the full pipeline for ONE open commitment.
 *
 * Caller (chef-orchestrator wire-in) responsibilities (NOT this module):
 *   - acquire commitments.json lock,
 *   - read the Gmail Sent cache,
 *   - run `shouldDeferToFollowup2` FIRST (Step 6 / AC8 ordering),
 *   - decide week-1 STAGE vs week-2 auto-mutate on a `resolve-high` outcome,
 *   - write the mutation via CommitmentsService.withLock,
 *   - write the resolution-decisions.log line.
 *
 * This function does the pre-filter + LLM cross-check + outcome synthesis and
 * NOTHING else (no writes, no logs).
 */
export declare function runResolutionPipeline(commitment: OpenCommitmentForResolution, sentMessages: ReadonlyArray<EmailThread>, peopleDir: PeopleDirectory, callConcurrent: LLMCallConcurrentFn, options?: {
    tier?: 'fast' | 'standard' | 'frontier';
    now?: Date;
}): Promise<{
    outcome: ResolutionOutcome;
    candidates: ResolutionCandidate[];
    decisions: ResolutionLLMDecision[];
}>;
/**
 * Adapt the on-disk `Commitment` into the pipeline's input shape.
 *
 * recipientSlugs (M5 — self EXCLUDED):
 *   - prefer `stakeholders[]` filtered to role ∈ {recipient, sender,
 *     mentioned} (NOT self). For an OUTBOUND commitment the recipient is the
 *     person we owe; we include all non-self stakeholders as candidate
 *     recipients (a cc'd "mentioned" person can still be the To: line on the
 *     fulfilling email).
 *   - else fall back to `[personSlug]` (v1) — but ONLY when direction is not
 *     'self' (a self-reminder has no external recipient).
 *
 * Exported for the wire-in + tests to share one adapter.
 */
export declare function commitmentToResolutionInput(c: Commitment): OpenCommitmentForResolution;
//# sourceMappingURL=commitment-resolution-pipeline.d.ts.map