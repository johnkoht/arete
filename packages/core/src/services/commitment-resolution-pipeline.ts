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
import { normalizeEmail } from '../integrations/gws/types.js';
import type { EmailThread } from '../integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Permanent-suppress sentinel (M4 / AC6c). `[[unresolve <id> --permanent]]`
 * sets `unresolveSuppressedUntil` to this far-future ISO date. The pipeline's
 * suppress check treats it identically to a 14d window — never re-resolves.
 */
export const PERMANENT_SUPPRESS_SENTINEL = '2100-01-01T00:00:00.000Z';

/** Default 14-day suppress window for `[[unresolve]]` (G5). */
export const UNRESOLVE_SUPPRESS_DAYS = 14;

/**
 * Temporal window ceiling — a Sent message more than this many days AFTER
 * the commitment date is too far removed to be evidence of THIS commitment
 * (a later, unrelated send). The cache-depth ceiling (M3) bounds how far
 * BACK we look; this bounds how far FORWARD a single match may reach.
 *
 * Generous (90d) because async reviews + slow follow-through are real — but
 * not unbounded (an open commitment from Q1 should not match a Q3 email).
 */
export const TEMPORAL_WINDOW_FORWARD_DAYS = 90;

/** Jaccard floor for the keyword pre-filter (commitment text vs subject+body). */
export const RESOLUTION_JACCARD_THRESHOLD = 0.08;

/** Cap on candidates sent to the LLM per commitment (cost throttle, AC4). */
export const RESOLUTION_CANDIDATE_CAP = 3;

/**
 * Named-artifact vocabulary. When a commitment's text mentions one of these,
 * the candidate Sent message MUST carry corroborating artifact evidence
 * (an attachment, OR the artifact noun appearing in subject/body) to survive
 * the pre-filter. This is the false-positive guard for "Send Lindsay the
 * deck" — a Sent email with no deck attachment and no "deck" in body is NOT
 * deterministic evidence and is culled before the LLM call.
 */
export const ARTIFACT_NOUNS = [
  'deck',
  'doc',
  'document',
  'prd',
  'spec',
  'draft',
  'proposal',
  'report',
  'memo',
  'slides',
  'presentation',
  'sheet',
  'spreadsheet',
  'pdf',
  'agenda',
  'summary',
  'notes',
  'plan',
  'contract',
  'invoice',
  'brief',
  'analysis',
  'review',
  'letter',
  'attachment',
] as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
export function peopleDirectoryFromMap(
  map: Record<string, string | string[] | undefined>,
): PeopleDirectory {
  const normalized = new Map<string, string[]>();
  for (const [slug, raw] of Object.entries(map)) {
    if (!raw) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    const emails = list.map((e) => normalizeEmail(e)).filter((e) => e.length > 0);
    if (emails.length > 0) normalized.set(slug.toLowerCase(), emails);
  }
  return {
    emailsForSlug(slug: string): string[] {
      return normalized.get(slug.toLowerCase()) ?? [];
    },
  };
}

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
export type FindEvidenceResult =
  | { kind: 'suppressed'; until: string }
  | { kind: 'no-recipient' } // R8 — no email-resolvable non-self stakeholder
  | { kind: 'candidates'; candidates: ResolutionCandidate[] };

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
export type ResolutionOutcome =
  | {
      kind: 'resolve-high';
      candidate: ResolutionCandidate;
      reasoning: string;
    }
  | {
      kind: 'flag-medium';
      candidate: ResolutionCandidate;
      reasoning: string;
    }
  | {
      kind: 'ignore';
      reason: 'no-candidates' | 'all-low' | 'suppressed' | 'no-recipient';
      until?: string;
    };

/**
 * LLM injection point — same shape as commitment-dedup-pipeline's
 * `LLMCallConcurrentFn` so the wire-in can pass the same AIService binding.
 */
export type LLMCallConcurrentFn = (
  prompts: { tier: 'fast' | 'standard' | 'frontier'; prompt: string }[],
) => Promise<string[]>;

// ---------------------------------------------------------------------------
// Suppress check (Step 2a / AC6b)
// ---------------------------------------------------------------------------

/**
 * True when the commitment is currently suppressed from auto-resolve.
 *
 * Structured field check (G5) — NOT a log grep. `now < unresolveSuppressedUntil`.
 * The permanent sentinel ('2100-...') compares as far-future and always
 * suppresses (M4 / AC6c).
 *
 * Exported for the wire-in's Step 2a pre-check + tests.
 */
export function isSuppressed(
  commitment: Pick<OpenCommitmentForResolution, 'unresolveSuppressedUntil'>,
  now: Date = new Date(),
): boolean {
  const until = commitment.unresolveSuppressedUntil;
  if (!until) return false;
  const untilTime = new Date(until).getTime();
  if (Number.isNaN(untilTime)) return false;
  return now.getTime() < untilTime;
}

/** Compute the 14d suppress timestamp from a base time (G5). */
export function computeSuppressUntil(now: Date = new Date()): string {
  return new Date(now.getTime() + UNRESOLVE_SUPPRESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Tokenization / artifact extraction
// ---------------------------------------------------------------------------

/**
 * Tokenize for keyword Jaccard. Lowercase, strip non-alphanumeric, drop
 * ≤2-char tokens + a small stopword set (the verbs that appear in nearly
 * every commitment would otherwise inflate overlap with unrelated emails).
 *
 * Exported for test introspection.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'her', 'him', 'them', 'you', 'our', 'out',
  'send', 'sent', 'email', 'will', 'can', 'get', 'got', 'has', 'have',
  'this', 'that', 'about', 'from', 'into', 'over', 'after', 'before',
  're', 'fwd',
]);

/** Jaccard similarity of two token sets. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Extract the named artifacts a commitment refers to (e.g. "deck", "PRD").
 * Returns the matched artifact nouns (lowercase, deduped). Empty = the
 * commitment names no specific artifact → artifact gate is N/A (not required).
 *
 * Exported for test introspection.
 */
export function extractArtifactNouns(text: string): string[] {
  const tokens = new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
  const out: string[] = [];
  for (const noun of ARTIFACT_NOUNS) {
    if (tokens.has(noun)) out.push(noun);
  }
  return out;
}

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
export function checkArtifactMatch(
  artifactNouns: string[],
  message: Pick<EmailThread, 'subject' | 'body' | 'attachments'>,
): boolean {
  if (artifactNouns.length === 0) return true; // N/A — no named artifact
  const haystack = `${message.subject ?? ''} ${message.body ?? ''}`.toLowerCase();
  const attachNames = (message.attachments ?? []).map((a) => (a.filename ?? '').toLowerCase());
  const docExtRe = /\.(pdf|docx?|pptx?|xlsx?|key|pages|csv)$/;
  // Generic: a doc attachment present at all is corroboration for "deck/doc/…".
  const hasDocAttachment = attachNames.some((n) => docExtRe.test(n));
  for (const noun of artifactNouns) {
    if (haystack.includes(noun)) return true;
    if (attachNames.some((n) => n.includes(noun))) return true;
  }
  return hasDocAttachment;
}

// ---------------------------------------------------------------------------
// Temporal window (AC3b)
// ---------------------------------------------------------------------------

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
export function inTemporalWindow(commitmentDate: string, sentAt: string): boolean {
  // Commitment date is YYYY-MM-DD (date-only) — anchor at start of that UTC day.
  const commitStart = new Date(`${commitmentDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const sent = new Date(sentAt).getTime();
  if (Number.isNaN(commitStart) || Number.isNaN(sent)) return false;
  if (sent < commitStart) return false; // pre-commitment
  const forwardMs = TEMPORAL_WINDOW_FORWARD_DAYS * 24 * 60 * 60 * 1000;
  return sent - commitStart <= forwardMs;
}

// ---------------------------------------------------------------------------
// findResolutionEvidence — deterministic pre-filter (NO LLM)
// ---------------------------------------------------------------------------

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
export function findResolutionEvidence(
  commitment: OpenCommitmentForResolution,
  sentMessages: ReadonlyArray<EmailThread>,
  peopleDir: PeopleDirectory,
  now: Date = new Date(),
): FindEvidenceResult {
  // a. Suppress check (Step 2a / AC6b) — structured field, never log-grep.
  if (isSuppressed(commitment, now)) {
    return { kind: 'suppressed', until: commitment.unresolveSuppressedUntil! };
  }

  // b. Resolve recipient emails (M5 — self already excluded by the adapter).
  const recipientEmailToSlug = new Map<string, string>();
  for (const slug of commitment.recipientSlugs) {
    for (const email of peopleDir.emailsForSlug(slug)) {
      // First slug wins if two map to the same email (deterministic).
      if (!recipientEmailToSlug.has(email)) recipientEmailToSlug.set(email, slug);
    }
  }
  if (recipientEmailToSlug.size === 0) {
    // R8 graceful degradation — no email for any non-self stakeholder.
    return { kind: 'no-recipient' };
  }

  const artifactNouns = extractArtifactNouns(commitment.text);
  const commitTokens = tokenize(commitment.text);

  const candidates: ResolutionCandidate[] = [];
  for (const msg of sentMessages) {
    if (!msg.sentAt) continue; // no timestamp → can't temporal-gate

    // c. Recipient email overlap (to + cc + bcc).
    const recipients = [
      ...(msg.to ?? []),
      ...(msg.cc ?? []),
      ...(msg.bcc ?? []),
    ].map((r) => normalizeEmail(r));
    let matchedEmail = '';
    let matchedSlug = '';
    for (const r of recipients) {
      const slug = recipientEmailToSlug.get(r);
      if (slug) {
        matchedEmail = r;
        matchedSlug = slug;
        break;
      }
    }
    if (!matchedSlug) continue;

    // d. Temporal window (AC3b — uses commitment.date, not createdAt).
    if (!inTemporalWindow(commitment.date, msg.sentAt)) continue;

    // e. Artifact gate (named-artifact false-positive guard).
    const artifactMatch = checkArtifactMatch(artifactNouns, msg);
    if (artifactNouns.length > 0 && !artifactMatch) continue;

    // f. Keyword Jaccard floor.
    const msgTokens = tokenize(`${msg.subject ?? ''} ${msg.body ?? ''}`);
    const j = jaccard(commitTokens, msgTokens);
    if (j < RESOLUTION_JACCARD_THRESHOLD) continue;

    candidates.push({
      threadId: msg.id,
      subject: msg.subject ?? '',
      url: buildThreadUrl(msg),
      sentAt: msg.sentAt,
      matchedRecipientSlug: matchedSlug,
      matchedRecipientEmail: matchedEmail,
      artifactMatch,
      jaccard: j,
      bodyExcerpt: (msg.body ?? '').slice(0, 400),
      attachmentNames: (msg.attachments ?? []).map((a) => a.filename),
    });
  }

  candidates.sort((a, b) => b.jaccard - a.jaccard);
  return { kind: 'candidates', candidates: candidates.slice(0, RESOLUTION_CANDIDATE_CAP) };
}

/**
 * Build a clickable Gmail thread URL. Prefers an existing `body`-adjacent
 * permalink if the provider supplied one in a future field; today we derive
 * the canonical `#sent/<threadId>` deep link.
 */
function buildThreadUrl(msg: EmailThread): string {
  return `https://mail.google.com/mail/u/0/#sent/${msg.id}`;
}

// ---------------------------------------------------------------------------
// runResolutionCrossCheck — LLM (fast tier)
// ---------------------------------------------------------------------------

/**
 * Build the cross-check prompt for ONE commitment + its candidates.
 *
 * One prompt for all candidates (cost throttle). The model returns, per
 * numbered candidate, a confidence + a short evidence quote/reasoning.
 *
 * Exported for test introspection (golden-set prompt stability).
 */
export function buildResolutionPrompt(
  commitment: OpenCommitmentForResolution,
  candidates: ReadonlyArray<ResolutionCandidate>,
): string {
  const artifactNouns = extractArtifactNouns(commitment.text);
  const lines: string[] = [];
  lines.push(
    'You are deciding whether a Sent email is evidence that an outbound commitment was COMPLETED.',
  );
  lines.push('');
  lines.push('Answer HIGH only when ALL hold:');
  lines.push('  - the email was sent TO the intended recipient,');
  lines.push('  - it was sent at/after the commitment was made,');
  lines.push('  - it delivers the SAME artifact / fulfills the SAME action');
  lines.push('    (a DRAFT/partial is NOT the same as a FINAL deliverable).');
  lines.push('Answer MEDIUM when it plausibly fulfills the commitment but the');
  lines.push('  artifact identity or completeness is uncertain (e.g. "FINAL deck"');
  lines.push('  commitment vs a "deck-draft" attachment).');
  lines.push('Answer LOW when it clearly does not fulfill the commitment.');
  lines.push('');
  lines.push(`COMMITMENT (outbound): ${commitment.text}`);
  lines.push(`  made on: ${commitment.date}`);
  if (artifactNouns.length > 0) {
    lines.push(`  named artifact(s): ${artifactNouns.join(', ')}`);
  }
  lines.push('');
  lines.push('SENT EMAIL CANDIDATES:');
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    lines.push(`${i + 1}. to: ${c.matchedRecipientEmail}  sent: ${c.sentAt}`);
    lines.push(`   subject: ${c.subject}`);
    lines.push(`   attachments: ${c.attachmentNames.length ? c.attachmentNames.join(', ') : '(none)'}`);
    lines.push(`   body excerpt: ${c.bodyExcerpt.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push('');
  lines.push('For EACH candidate, respond with EXACTLY one line in the format:');
  lines.push('  <N>. <HIGH|MEDIUM|LOW> | <one-sentence evidence quote or reasoning>');
  lines.push('');
  lines.push('Respond with only the numbered lines, nothing else.');
  return lines.join('\n');
}

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
export function parseResolutionResponse(
  response: string,
  candidates: ReadonlyArray<ResolutionCandidate>,
): ResolutionLLMDecision[] {
  const seen = new Map<number, ResolutionLLMDecision>();
  for (const rawLine of response.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(
      /^(\d+)[.)\]:]\s*(HIGH|MEDIUM|LOW)\b\s*(?:[|\-—]\s*(.*))?$/i,
    );
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1 || n > candidates.length) continue;
    seen.set(n, {
      threadId: candidates[n - 1].threadId,
      confidence: m[2].toUpperCase() as ResolutionLLMDecision['confidence'],
      reasoning: (m[3] ?? '').trim(),
    });
  }
  const out: ResolutionLLMDecision[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const dec = seen.get(i + 1);
    out.push(
      dec ?? {
        threadId: candidates[i].threadId,
        confidence: 'LOW', // FAIL-SAFE — never auto-resolve on parse miss.
        reasoning: 'no parseable LLM response (defaulted LOW)',
      },
    );
  }
  return out;
}

/**
 * Run the LLM cross-check at fast tier (task external_resolution, AC3a).
 *
 * - Empty candidates → [] (no LLM call).
 * - LLM throw → all LOW (fail-safe; never auto-resolve on a provider hiccup).
 */
export async function runResolutionCrossCheck(
  commitment: OpenCommitmentForResolution,
  candidates: ReadonlyArray<ResolutionCandidate>,
  callConcurrent: LLMCallConcurrentFn,
  tier: 'fast' | 'standard' | 'frontier' = 'fast',
): Promise<ResolutionLLMDecision[]> {
  if (candidates.length === 0) return [];
  const prompt = buildResolutionPrompt(commitment, candidates);
  let response: string;
  try {
    const results = await callConcurrent([{ tier, prompt }]);
    response = results[0] ?? '';
  } catch {
    return candidates.map((c) => ({
      threadId: c.threadId,
      confidence: 'LOW' as const,
      reasoning: 'LLM call failed; defaulted to LOW',
    }));
  }
  return parseResolutionResponse(response, candidates);
}

// ---------------------------------------------------------------------------
// applyResolutionDecisions
// ---------------------------------------------------------------------------

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
export function applyResolutionDecisions(
  candidates: ReadonlyArray<ResolutionCandidate>,
  decisions: ReadonlyArray<ResolutionLLMDecision>,
): ResolutionOutcome {
  if (candidates.length === 0) {
    return { kind: 'ignore', reason: 'no-candidates' };
  }
  const byId = new Map<string, ResolutionCandidate>();
  for (const c of candidates) byId.set(c.threadId, c);

  const pick = (conf: 'HIGH' | 'MEDIUM') => {
    let best: { dec: ResolutionLLMDecision; cand: ResolutionCandidate } | null = null;
    for (const d of decisions) {
      if (d.confidence !== conf) continue;
      const c = byId.get(d.threadId);
      if (!c) continue;
      if (!best || c.jaccard > best.cand.jaccard) best = { dec: d, cand: c };
    }
    return best;
  };

  const high = pick('HIGH');
  if (high) {
    return { kind: 'resolve-high', candidate: high.cand, reasoning: high.dec.reasoning };
  }
  const medium = pick('MEDIUM');
  if (medium) {
    return { kind: 'flag-medium', candidate: medium.cand, reasoning: medium.dec.reasoning };
  }
  return { kind: 'ignore', reason: 'all-low' };
}

// ---------------------------------------------------------------------------
// runResolutionPipeline — top-level convenience runner
// ---------------------------------------------------------------------------

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
export async function runResolutionPipeline(
  commitment: OpenCommitmentForResolution,
  sentMessages: ReadonlyArray<EmailThread>,
  peopleDir: PeopleDirectory,
  callConcurrent: LLMCallConcurrentFn,
  options: { tier?: 'fast' | 'standard' | 'frontier'; now?: Date } = {},
): Promise<{
  outcome: ResolutionOutcome;
  candidates: ResolutionCandidate[];
  decisions: ResolutionLLMDecision[];
}> {
  const now = options.now ?? new Date();
  const found = findResolutionEvidence(commitment, sentMessages, peopleDir, now);

  if (found.kind === 'suppressed') {
    return { outcome: { kind: 'ignore', reason: 'suppressed', until: found.until }, candidates: [], decisions: [] };
  }
  if (found.kind === 'no-recipient') {
    return { outcome: { kind: 'ignore', reason: 'no-recipient' }, candidates: [], decisions: [] };
  }

  const candidates = found.candidates;
  const tier = options.tier ?? 'fast';
  const decisions = await runResolutionCrossCheck(commitment, candidates, callConcurrent, tier);
  const outcome = applyResolutionDecisions(candidates, decisions);
  return { outcome, candidates, decisions };
}

// ---------------------------------------------------------------------------
// Adapter: Commitment → OpenCommitmentForResolution
// ---------------------------------------------------------------------------

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
export function commitmentToResolutionInput(c: Commitment): OpenCommitmentForResolution {
  const recipientSlugs: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(c.stakeholders) && c.stakeholders.length > 0) {
    for (const sh of c.stakeholders) {
      if (sh.role === 'self') continue; // M5
      if (!sh.slug) continue;
      const slug = sh.slug.toLowerCase();
      if (seen.has(slug)) continue;
      seen.add(slug);
      recipientSlugs.push(slug);
    }
  } else if (c.personSlug && c.direction !== 'self') {
    recipientSlugs.push(c.personSlug.toLowerCase());
  }

  return {
    id: c.id,
    text: c.text,
    date: c.date,
    recipientSlugs,
    unresolveSuppressedUntil: c.unresolveSuppressedUntil,
  };
}
