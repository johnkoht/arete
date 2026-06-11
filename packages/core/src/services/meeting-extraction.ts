/**
 * Meeting intelligence extraction via LLM.
 *
 * Extracts structured intelligence from meeting transcripts:
 *   - summary, action items, next steps, decisions, learnings
 *
 * Uses the same DI pattern as person-signals.ts:
 *   buildMeetingExtractionPrompt() → callLLM() → parseMeetingExtractionResponse()
 *
 * Aggressive validation rejects garbage:
 *   - Action items > 150 chars
 *   - Items starting with "Me:", "Them:", "Yeah", "I'm not sure"
 *   - Items with multiple sentences (more than one period)
 *
 * Context-enhanced extraction (T2):
 *   When a MeetingContextBundle is provided, the prompt is enhanced with:
 *   - Resolved attendee info (stances, open items) for better owner resolution
 *   - Related goals for context-aware extraction
 *   - Unchecked agenda items that become action item candidates
 */

import type { MeetingContextBundle } from './meeting-context.js';
import { calculateSpeakingRatio } from './meeting-processing.js';
import { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;

/** Extraction mode determining prompt style and category limits. */
export type ExtractionMode = 'light' | 'normal' | 'thorough';

/**
 * Direction of an action item relative to the owner.
 *
 * `'none'` (single-pass D3): team-internal / not-owner-relative. Only emitted
 * by the single_pass pipeline; legacy parsing still rejects it. `none` items
 * NEVER become commitments (D7) — they stage for visibility only.
 */
export type ActionItemDirection = 'i_owe_them' | 'they_owe_me' | 'none';

/**
 * Importance tier (single-pass D3). Tier — not confidence — drives
 * auto-approval in single_pass mode: only `blocker` may auto-approve
 * (pre-mortem risk 1).
 */
export type ItemImportance = 'blocker' | 'high' | 'normal';

/**
 * Judgment metadata shared by all single-pass item kinds (D3).
 * All fields optional — absent on legacy extractions, which keeps old
 * parsers/consumers bit-identical.
 */
export type ItemJudgment = {
  importance?: ItemImportance;
  /** The ⚠ channel — model self-flagged uncertainty. Always stages pending. */
  uncertain?: boolean;
  uncertaintyReason?: string;
  /** Claim: this item continues an existing tracked item/commitment (id or text ref). */
  continuationOf?: string;
  /** Claim: this item supersedes a prior item/decision (id or text ref). */
  supersedes?: string;
};

/** A structured action item extracted from a meeting. */
export type ActionItem = {
  owner: string;
  ownerSlug: string;
  description: string;
  direction: ActionItemDirection;
  counterpartySlug?: string;
  due?: string;
  /** LLM confidence score (0-1) for this item. */
  confidence?: number;
} & ItemJudgment;

/** Item from a prior meeting in the same processing batch, used for deduplication. */
export interface PriorItem {
  type: 'action' | 'decision' | 'learning';
  text: string;
  source?: string;
}

/** Full meeting intelligence extracted from a transcript. */
export type MeetingIntelligence = {
  summary: string;
  actionItems: ActionItem[];
  nextSteps: string[];
  decisions: string[];
  learnings: string[];
  /** Confidence scores for decisions, parallel array indexed same as decisions. undefined = not provided by LLM. */
  decisionConfidences?: (number | undefined)[];
  /** Confidence scores for learnings, parallel array indexed same as learnings. undefined = not provided by LLM. */
  learningConfidences?: (number | undefined)[];
  /** Slugified topic keywords (e.g. 'email-templates', 'q2-planning'). 3–6 items. */
  topics?: string[];
  /**
   * Free-form prose lead — most actionable / decided / changed thing surfaced
   * by the LLM. Preferred over `summary` when present (callers in Tasks 8/10).
   * Sanitized of raw `---` lines before assignment to prevent YAML doc-separator
   * injection in downstream frontmattered files (R7 mitigation).
   */
  core?: string;
  /**
   * Up to 8 informative one-line headlines for side threads worth knowing
   * about. Ordered by importance. Each headline is self-contained. Sanitized
   * of raw `---` lines per entry (R7 mitigation).
   */
  could_include?: string[];
  /**
   * Open questions raised but not resolved in the meeting (single-pass D3).
   * Feeds the wiki Open Questions surface (full wiring deferred to F2 —
   * persist-don't-render-everywhere interim). Absent on legacy extractions.
   */
  openQuestions?: string[];
  /** Judgment metadata for decisions, parallel array indexed same as decisions. */
  decisionMeta?: (ItemJudgment | undefined)[];
  /** Judgment metadata for learnings, parallel array indexed same as learnings. */
  learningMeta?: (ItemJudgment | undefined)[];
};

/** Validation warning for rejected items. */
export type ValidationWarning = {
  item: string;
  reason: string;
};

/** Raw item before validation filtering (for debugging/analysis). */
export type RawExtractedItem = {
  type: 'action' | 'decision' | 'learning';
  text: string;
  owner?: string;
  direction?: string;
  confidence?: number;
};

/**
 * Telemetry event from a mechanical detector running in log-only mode
 * (single-pass D4). In single_pass mode the legacy filters/caps no longer
 * gate items — they fire these events instead, which flow to the item-fates
 * stream. Detectors are PERMANENT drift telemetry (2026-06-11 adjudication):
 * if silent, demote to sampled logging, never delete.
 */
export type ExtractionTelemetryEvent = {
  detector:
    | 'garbage_prefix'
    | 'length_limit'
    | 'multi_sentence'
    | 'trivial_pattern'
    | 'invalid_direction'
    | 'mirror_pair'
    | 'near_duplicate'
    | 'category_limit'
    | 'unparseable_item';
  itemType: 'action' | 'decision' | 'learning';
  /** Preview of the flagged item's text (truncated). */
  item: string;
  detail: string;
};

/** Result of parsing extraction response (includes validation warnings). */
export type MeetingExtractionResult = {
  intelligence: MeetingIntelligence;
  validationWarnings: ValidationWarning[];
  /** All items parsed from LLM response before validation filtering (for debugging). */
  rawItems: RawExtractedItem[];
  /**
   * Detector telemetry (single_pass mode only — D4 log-only flip). Absent in
   * legacy mode so legacy result shape is unchanged.
   */
  telemetryEvents?: ExtractionTelemetryEvent[];
};

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 */
type RawJudgmentFields = {
  importance?: string;
  uncertain?: boolean;
  uncertainty_reason?: string;
  continuation_of?: string;
  supersedes?: string;
};

type RawExtractionResult = {
  summary?: string;
  action_items?: Array<{
    owner?: string;
    owner_slug?: string;
    description?: string;
    direction?: string;
    counterparty_slug?: string;
    due?: string;
    confidence?: number;
  } & RawJudgmentFields>;
  next_steps?: string[];
  decisions?: Array<string | ({ text?: string; confidence?: number } & RawJudgmentFields)>;
  learnings?: Array<string | ({ text?: string; confidence?: number } & RawJudgmentFields)>;
  open_questions?: unknown;
  topics?: unknown;
  core?: string;
  could_include?: unknown;
};

/**
 * Strip line-start `---` separators that would corrupt downstream frontmatter
 * parsing if these LLM-generated strings get written into a YAML-frontmattered
 * file (e.g., a meeting markdown's staged section). Pure helper; safe to call
 * on any string.
 *
 * Returns the sanitized string and the count of stripped lines (callers may
 * log a warning when count > 0). Lines matching `^---\s*$` are removed
 * entirely (the line and its trailing newline).
 *
 * Pre-mortem R7 mitigation. See also `parseIntegrateResponse` in
 * `topic-memory.ts:475`, which DROPS the entire field instead — we strip
 * here because rejecting `core`/`could_include[]` outright would cause the
 * extraction to silently lose lead-prose content; the LLM is the author and
 * a noisy doc-separator is more often a formatting accident than a malicious
 * payload.
 */
export function stripYamlDocSeparator(s: string): { sanitized: string; stripped: number } {
  const lines = s.split('\n');
  let stripped = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      stripped += 1;
      continue;
    }
    kept.push(line);
  }
  return { sanitized: kept.join('\n'), stripped };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTION_ITEM_LENGTH = 150;

const GARBAGE_PREFIXES = [
  'me:',
  'them:',
  'yeah',
  "i'm not sure",
  'i am not sure',
  'so the way',
  'the way the',
  'basically',
  'um',
  'uh',
];

const VALID_DIRECTIONS = new Set<string>(['i_owe_them', 'they_owe_me']);

/**
 * single_pass mode accepts `none` (D3). Legacy keeps the binary set so the
 * legacy parse path is bit-identical (a stray `none` still drops with the
 * same "invalid direction" warning it produces today).
 */
const VALID_DIRECTIONS_SINGLE_PASS = new Set<string>(['i_owe_them', 'they_owe_me', 'none']);

const VALID_IMPORTANCE = new Set<string>(['blocker', 'high', 'normal']);

/** Max open questions parsed per meeting (sanity guard, not a category cap). */
const OPEN_QUESTIONS_MAX = 20;

/**
 * Parse the shared judgment fields (D3) off a raw LLM item. Pure; returns
 * undefined when no judgment field is present so legacy-shaped items carry
 * no extra keys.
 */
function parseJudgmentFields(raw: RawJudgmentFields): ItemJudgment | undefined {
  const out: ItemJudgment = {};
  if (typeof raw.importance === 'string') {
    const imp = raw.importance.trim().toLowerCase();
    if (VALID_IMPORTANCE.has(imp)) out.importance = imp as ItemImportance;
  }
  if (raw.uncertain === true) out.uncertain = true;
  if (typeof raw.uncertainty_reason === 'string' && raw.uncertainty_reason.trim()) {
    out.uncertaintyReason = raw.uncertainty_reason.trim();
    // A reason implies the flag even if the model forgot the boolean.
    out.uncertain = true;
  }
  if (typeof raw.continuation_of === 'string' && raw.continuation_of.trim()) {
    out.continuationOf = raw.continuation_of.trim();
  }
  if (typeof raw.supersedes === 'string' && raw.supersedes.trim()) {
    out.supersedes = raw.supersedes.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const TOPIC_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const TOPIC_BANNED = new Set([
  'meeting', 'discussion', 'update', 'call', 'sync', 'review',
  'followup', 'follow-up', 'next-steps',
]);
const TOPIC_MAX_COUNT = 6;

// ---------------------------------------------------------------------------
// Post-processing filters
// ---------------------------------------------------------------------------

/** Category limits: max items per category (keep first N in LLM response order). */
export const CATEGORY_LIMITS = {
  actionItems: 10,
  decisions: 7,
  learnings: 7,
};

/** Light mode limits: summary + minimal learnings only. */
export const LIGHT_LIMITS = {
  actionItems: 0,
  decisions: 0,
  learnings: 2,
};

/** Thorough mode limits: higher caps for comprehensive extraction. */
export const THOROUGH_LIMITS = {
  actionItems: 20,
  decisions: 10,
  learnings: 10,
};

/** Type for category limits. */
export type CategoryLimits = typeof CATEGORY_LIMITS;

/** Jaccard threshold for near-duplicate detection. */
const JACCARD_DEDUP_THRESHOLD = 0.8;

/**
 * Jaccard threshold for mirror-pair detection (Phase 8 followup-6).
 *
 * Tighter than the general dedup threshold because mirror-pair pathology is
 * "identical or near-identical" (the LLM is emitting the SAME compound sentence
 * split into two opposite-direction rows — observed Jaccard ≥0.95 in the
 * structural-failure case). 0.90 is the post-review-1 revision (was 0.85);
 * tighter threshold = fewer false-positives on legitimate bilateral pairs at
 * minimal catch-rate cost. If AC5 eval reveals <100% catch at 0.90, ratchet
 * down with logged rationale.
 */
export const MIRROR_PAIR_JACCARD_THRESHOLD = 0.9;

/** Trivial action item patterns to filter (case-insensitive). */
const TRIVIAL_PATTERNS = [
  /^schedule a meeting/i,
  /^follow up/i,
  /^touch base/i,
  /^we (should|will|can)\s*(just|probably)?\s*(meet|discuss|talk)/i,
];

// normalizeForJaccard and jaccardSimilarity are imported from ../utils/similarity.js
// and re-exported below for public API compatibility.
export { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';

/**
 * Check if an item matches trivial patterns.
 * Returns the matched pattern description or null.
 */
function isTrivialItem(text: string): string | null {
  for (const pattern of TRIVIAL_PATTERNS) {
    if (pattern.test(text)) {
      return `matches trivial pattern: ${pattern.source}`;
    }
  }
  return null;
}

/** Decision verbs that indicate a real decision was made (used as safety check). */
const DECISION_VERBS = /\b(decided|agreed|chose|approved|confirmed|committed|selected|adopted)\b/i;

/** Trivial decision patterns — match only if no decision verb present. */
const TRIVIAL_DECISION_PATTERNS = [
  /^we (discussed|reviewed|talked about|went over|covered)\b/i,
  /^(meeting|call) (moved|rescheduled|cancelled)/i,
  /^team (met|gathered|synced)\b/i,
];

/**
 * Check if a decision matches trivial patterns.
 * Safety: patterns do NOT match items containing decision verbs.
 */
export function isTrivialDecision(text: string): string | null {
  if (DECISION_VERBS.test(text)) return null; // Contains a real decision verb — keep it
  for (const pattern of TRIVIAL_DECISION_PATTERNS) {
    if (pattern.test(text)) {
      return `matches trivial decision pattern: ${pattern.source}`;
    }
  }
  return null;
}

/** Trivial learning patterns — personal trivia, social events, common knowledge. */
const TRIVIAL_LEARNING_PATTERNS = [
  /^(company|team|org)\s+(picnic|outing|happy hour|party|offsite)\b/i,
  /\b(lives in|is from|born in|moved to|grew up in)\b/i,
  /\b(birthday|anniversary|wedding|engagement)\b.*\b(is|on|in)\b/i,
  /\b(favorite|favourite)\s+(food|color|colour|movie|show|book|sport)\b/i,
];

/**
 * Check if a learning matches trivial patterns.
 */
export function isTrivialLearning(text: string): string | null {
  for (const pattern of TRIVIAL_LEARNING_PATTERNS) {
    if (pattern.test(text)) {
      return `matches trivial learning pattern: ${pattern.source}`;
    }
  }
  return null;
}

/**
 * Remove near-duplicate items using Jaccard similarity.
 * Keeps first occurrence, filters subsequent items with Jaccard > threshold.
 */
function deduplicateItems<T extends { description?: string; text?: string }>(
  items: T[],
  threshold: number = JACCARD_DEDUP_THRESHOLD,
): { kept: T[]; filtered: Array<{ item: T; reason: string }> } {
  const kept: T[] = [];
  const filtered: Array<{ item: T; reason: string }> = [];
  const normalizedKept: string[][] = [];

  for (const item of items) {
    const text = 'description' in item ? (item.description as string) : (item.text as string);
    if (!text) {
      kept.push(item);
      continue;
    }

    const normalized = normalizeForJaccard(text);
    let isDuplicate = false;

    for (let i = 0; i < normalizedKept.length; i++) {
      const similarity = jaccardSimilarity(normalized, normalizedKept[i]);
      if (similarity > threshold) {
        filtered.push({
          item,
          reason: `near-duplicate (Jaccard ${similarity.toFixed(2)} > ${threshold})`,
        });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(item);
      normalizedKept.push(normalized);
    }
  }

  return { kept, filtered };
}

/**
 * Detect and drop mirror-pair duplicate action items (Phase 8 followup-6).
 *
 * A "mirror pair" is the LLM emitting TWO `action_items[]` entries from a
 * single compound transcript sentence — one `i_owe_them` and one
 * `they_owe_me`, identical or near-identical `description`, different
 * `owner_slug`. The extraction prompt now has Pattern 4 to prevent this
 * upstream (AC1), but this deterministic post-LLM pass catches anything that
 * leaks through. See plan: phase-8-followup-6-direction-parser/plan.md.
 *
 * Pair detection criteria (ALL must hold):
 *   1. `a.direction !== b.direction` (opposite directions),
 *   2. `a.ownerSlug !== b.ownerSlug` (different owners — same-owner same-text
 *      same-direction is handled by `deduplicateItems`),
 *   3. `jaccardSimilarity(normalize(a.description), normalize(b.description))
 *       >= MIRROR_PAIR_JACCARD_THRESHOLD` (0.90).
 *
 * Canonical selection (run in order — first match wins, per pre-mortem R5):
 *   a. **Verbatim-actor heuristic.** If exactly one item's description begins
 *      with the owner's slug-stem (e.g., "john-koht" → /^john\b/i), that item
 *      is canonical. This aligns with Areté's verbatim-action prompt
 *      convention ("<Owner> to ..." / "<Owner> will ..."). Most reliable
 *      signal when both slugs are non-owner.
 *   b. **Workspace-owner-match.** If exactly one of the two slugs equals the
 *      workspace `ownerSlug`, keep that item — it represents the user's
 *      direct commitment. (When the owner has direction `i_owe_them`, this
 *      is the user's actionable commitment; when `they_owe_me`, it's still
 *      the user's tracked expectation.)
 *   c. **Arbitrary (keep `a`).** Ambiguous — neither verbatim-actor nor
 *      owner-match can pick. Keep the first occurrence; both items get
 *      logged to `validationWarnings` so the user can review.
 *
 * Every drop is logged to `validationWarnings[]` with
 * `reason: 'mirror-pair duplicate (kept canonical)'` so the user sees what
 * was suppressed in the chef-curated view (pre-mortem R1 mitigation).
 *
 * Pure function; no I/O. O(n^2) over `items` — fine for n ≤ ~20.
 *
 * @param items - Action items to dedup (typically post-validation, pre-`deduplicateItems`)
 * @param ownerSlug - Workspace owner slug for owner-match heuristic (optional)
 * @returns Kept items + dropped pair-mates with reasons
 */
export function dedupMirrorPairs(
  items: ActionItem[],
  ownerSlug?: string,
): { kept: ActionItem[]; dropped: Array<{ item: ActionItem; reason: string; canonicalDescription: string }> } {
  const dropped: Array<{ item: ActionItem; reason: string; canonicalDescription: string }> = [];
  const droppedIndices = new Set<number>();

  // Precompute normalized tokens
  const normalized = items.map(i => normalizeForJaccard(i.description));

  for (let i = 0; i < items.length; i++) {
    if (droppedIndices.has(i)) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (droppedIndices.has(j)) continue;
      const a = items[i];
      const b = items[j];

      // Mirror pair gate: opposite direction + different owners.
      // `none` (single-pass D3) never participates — a mirror pair is by
      // definition the i_owe_them/they_owe_me false binary; pairing a
      // team-internal item against a directional one would be a false positive.
      if (a.direction === 'none' || b.direction === 'none') continue;
      if (a.direction === b.direction) continue;
      if (a.ownerSlug === b.ownerSlug) continue;

      const similarity = jaccardSimilarity(normalized[i], normalized[j]);
      if (similarity < MIRROR_PAIR_JACCARD_THRESHOLD) continue;

      // Pair detected — pick canonical.
      const canonicalIdx = pickMirrorPairCanonical(a, b, i, j, ownerSlug);
      const dropIdx = canonicalIdx === i ? j : i;
      const droppedItem = items[dropIdx];
      const canonicalItem = items[canonicalIdx];

      droppedIndices.add(dropIdx);
      dropped.push({
        item: droppedItem,
        reason: 'mirror-pair duplicate (kept canonical)',
        canonicalDescription: canonicalItem.description,
      });

      // If we dropped `i`, break inner loop and move outer i forward;
      // the `droppedIndices.has(i)` guard at the top of outer loop handles it.
      if (dropIdx === i) break;
    }
  }

  const kept = items.filter((_, idx) => !droppedIndices.has(idx));
  return { kept, dropped };
}

/**
 * Pick the canonical item from a detected mirror pair.
 * Order (post-review-1 revision per pre-mortem R5):
 *   1. Verbatim-actor heuristic (description begins with owner's slug-stem),
 *   2. Workspace-owner-match (one slug == ownerSlug),
 *   3. Arbitrary (return first index — `aIdx`).
 *
 * Returns the index (one of `aIdx`/`bIdx`) of the canonical item.
 */
function pickMirrorPairCanonical(
  a: ActionItem,
  b: ActionItem,
  aIdx: number,
  bIdx: number,
  ownerSlug?: string,
): number {
  // 1. Verbatim-actor: description begins with owner's slug-stem.
  //    Stem = first segment of slug before any '-'. Match as a word boundary
  //    at the START of the description (case-insensitive).
  const aStartsWithOwner = descriptionStartsWithSlugStem(a.description, a.ownerSlug);
  const bStartsWithOwner = descriptionStartsWithSlugStem(b.description, b.ownerSlug);
  if (aStartsWithOwner && !bStartsWithOwner) return aIdx;
  if (bStartsWithOwner && !aStartsWithOwner) return bIdx;

  // 2. Workspace-owner-match: exactly one of the two slugs == ownerSlug.
  if (ownerSlug) {
    const aIsOwner = a.ownerSlug === ownerSlug;
    const bIsOwner = b.ownerSlug === ownerSlug;
    if (aIsOwner && !bIsOwner) return aIdx;
    if (bIsOwner && !aIsOwner) return bIdx;
  }

  // 3. Arbitrary: keep first.
  return aIdx;
}

/**
 * Check whether `description` begins with the first-name stem of `slug`.
 * Stem = portion of slug before the first '-'. Match is case-insensitive and
 * anchored to a word boundary at the start.
 *
 * Example: slug="john-koht" → stem="john" → matches "John to reach out..."
 */
function descriptionStartsWithSlugStem(description: string, slug: string): boolean {
  if (!slug) return false;
  const stem = slug.split('-')[0];
  if (!stem) return false;
  // Anchor at start; allow optional leading whitespace; require word boundary
  // after the stem (so "john" doesn't match "johnson").
  const re = new RegExp(`^\\s*${escapeRegExp(stem)}\\b`, 'i');
  return re.test(description);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function countPeriods(text: string): number {
  // Count sentence-ending periods (not abbreviations like "Dr." or "Mr.")
  // Simple heuristic: count periods followed by space or end of string
  const matches = text.match(/\.\s|\.$/g);
  return matches ? matches.length : 0;
}

function isGarbageItem(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Check for garbage prefixes
  for (const prefix of GARBAGE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return `starts with "${prefix}"`;
    }
  }

  // Check length (action items have a tighter limit)
  if (text.length > MAX_ACTION_ITEM_LENGTH) {
    return `exceeds ${MAX_ACTION_ITEM_LENGTH} characters (${text.length})`;
  }

  // Check for multiple sentences
  if (countPeriods(text) > 1) {
    return 'contains multiple sentences';
  }

  return null;
}

/**
 * Lighter garbage check for decisions/learnings — skips the 150-char length
 * limit (which is action-item-specific) and multi-sentence check (decisions
 * and learnings can legitimately be longer and more complex).
 */
function isGarbageDecisionOrLearning(text: string): string | null {
  const lower = text.toLowerCase().trim();

  for (const prefix of GARBAGE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return `starts with "${prefix}"`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt Building
// ---------------------------------------------------------------------------

/**
 * Build context section from MeetingContextBundle for enhanced extraction.
 * Includes attendee stances/open items, goals, and unchecked agenda items.
 */
function buildContextSection(context: MeetingContextBundle): string {
  const sections: string[] = [];

  // Attendee context with stances and open items
  if (context.attendees.length > 0) {
    const attendeeLines: string[] = ['### Attendee Context'];
    for (const attendee of context.attendees) {
      const parts = [`- **${attendee.name}** (@${attendee.slug})`];
      if (attendee.category && attendee.category !== 'unknown') {
        parts[0] += ` — ${attendee.category}`;
      }
      attendeeLines.push(parts[0]);
      
      if (attendee.stances.length > 0) {
        attendeeLines.push(`  Known stances: ${attendee.stances.slice(0, 3).join('; ')}`);
      }
      if (attendee.openItems.length > 0) {
        attendeeLines.push(`  Open items: ${attendee.openItems.slice(0, 3).join('; ')}`);
      }
    }
    sections.push(attendeeLines.join('\n'));
  }

  // Related goals
  if (context.relatedContext.goals.length > 0) {
    const goalLines = ['### Related Goals'];
    for (const goal of context.relatedContext.goals.slice(0, 5)) {
      goalLines.push(`- ${goal.title}`);
    }
    sections.push(goalLines.join('\n'));
  }

  // Unchecked agenda items (these should become action items)
  if (context.agenda && context.agenda.unchecked.length > 0) {
    const agendaLines = ['### Unchecked Agenda Items (should become action items)'];
    for (const item of context.agenda.unchecked) {
      agendaLines.push(`- ${item}`);
    }
    sections.push(agendaLines.join('\n'));
  }

  // Area context (domain knowledge for the meeting topic)
  if (context.areaContext) {
    const area = context.areaContext;
    const areaLines: string[] = [`### Area Context (${area.name})`];

    // Focus (truncate to 500 chars)
    if (area.sections?.focus) {
      const truncated = area.sections.focus.length > 500
        ? area.sections.focus.slice(0, 500) + '...'
        : area.sections.focus;
      areaLines.push(`**Focus**: ${truncated}`);
    }

    // Goal (show linked goals)
    if (area.sections?.goal) {
      const goals = area.sections.goal
        .split('\n')
        .filter(line => /^[-*]\s/.test(line.trim()))
        .slice(0, 5);
      if (goals.length > 0) {
        areaLines.push('', '**Area Goals**:');
        areaLines.push(...goals);
      }
    }

    sections.push(areaLines.join('\n'));
  }

  // Existing tasks (from now/week.md and now/tasks.md)
  // Shown so the LLM does not re-extract action items already tracked as tasks.
  if (context.existingTasks && context.existingTasks.length > 0) {
    const taskLines = ['### Existing Tasks (already tracked — do not duplicate as action items)'];
    for (const task of context.existingTasks) {
      taskLines.push(`- ${task}`);
    }
    sections.push(taskLines.join('\n'));
  }

  if (sections.length === 0) return '';

  return `\n\n## Meeting Context (use this for better extraction)
${sections.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Topic Wiki Context Section
// ---------------------------------------------------------------------------

/**
 * Char budget for the rendered topic-wiki context block.
 *
 * Mirrors the `MAX_EXCLUSION_CHARS = 4000` precedent. Roughly 1.5K tokens.
 * When a rendered `topicWikiContext` exceeds this, `truncateTopicWikiContextToBudget`
 * applies a tiered truncation that preserves the highest-scored topic.
 */
export const MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000;

/**
 * Prose preamble for the active-topic-slug bias block injected into extraction
 * prompts. Byte-stable text — when present, the prompt appends a blank line,
 * the rendered slug list (`renderActiveTopicsAsSlugList(getActiveTopics(...))`),
 * and a closing newline.
 *
 * **Exported for skill-drift tests, not for reuse.** Internal callers should
 * use the prompt builders that already embed it; the only legitimate external
 * reader is `packages/core/test/runtime/slack-digest-bias-block.test.ts`,
 * which asserts byte-equality between this constant and the matching block in
 * `packages/runtime/skills/slack-digest/SKILL.md` (between
 * `<!-- BIAS_BLOCK_START -->` and `<!-- BIAS_BLOCK_END -->` markers).
 *
 * **Load-bearing constant — do not edit lightly.** Editing this constant
 * requires a parallel edit to SKILL.md or the drift test will fail. The
 * slack-digest skill uses the SKILL.md copy verbatim to bias its per-thread
 * topic extraction with the same wording the meeting-extraction prompt uses.
 */
export const TOPIC_BIAS_BLOCK_PROMPT = `**Prefer these existing topic slugs when applicable.** Only propose a new slug
when the meeting is substantively about something not covered. Matching an
existing slug keeps knowledge compounding instead of sprawling:`;

/**
 * Shape of the topic-wiki context piped through `MeetingContextBundle.topicWikiContext`.
 *
 * **Array order encodes priority**: `detectedTopics[0]` is the highest-scored topic
 * (per `detectTopicsLexical`'s sort order — score desc, lastRefreshed desc, slug asc),
 * the last element is the lowest-scored. The truncation helper relies on this
 * invariant — never reshuffle the array without updating both helpers.
 */
export type TopicWikiContext = {
  detectedTopics: Array<{
    slug: string;
    sections: string;
    l2Excerpts: string[];
    /**
     * `last_refreshed` from the topic page frontmatter (wiki-repair W5).
     * Rendered under the `### [[slug]]` heading so the extraction LLM —
     * and anyone reading the prompt — sees page age.
     */
    lastRefreshed?: string;
    /** True when the page is >60 days old (or its date is unparseable). */
    stale?: boolean;
  }>;
};

/**
 * Render the topic-wiki context section for the extraction prompt.
 *
 * Each detected topic produces a `### [[<slug>]]` block with its pre-rendered
 * sections (Task 5: emit verbatim — already rendered by `renderForExtractionContext`),
 * followed by a "Prior captured items" bullet list of L2 excerpts when present.
 * The "Prior captured items" line is omitted entirely when `l2Excerpts` is empty.
 *
 * Returns an empty string (no `## Topic Wiki` heading) when:
 *   - `ctx` is undefined
 *   - `ctx.detectedTopics` is empty
 *
 * The caller (`buildMeetingExtractionPrompt`) inserts the result between
 * `enhancedContext` and `exclusionList`. The companion delta-only directive,
 * inserted earlier in the prompt, references this section by name.
 */
export function buildTopicWikiContextSection(ctx?: TopicWikiContext): string {
  if (!ctx || ctx.detectedTopics.length === 0) return '';

  const blocks: string[] = [];
  for (const topic of ctx.detectedTopics) {
    // W5 staleness: show page age right under the heading. `(as of
    // <date> — stale)` past 60 days, matching the brief surfaces.
    const heading =
      topic.lastRefreshed !== undefined && topic.lastRefreshed.length > 0
        ? `### [[${topic.slug}]] (as of ${topic.lastRefreshed}${topic.stale === true ? ' — stale' : ''})`
        : `### [[${topic.slug}]]`;
    const lines: string[] = [heading, '', topic.sections];
    if (topic.l2Excerpts.length > 0) {
      lines.push('', 'Prior captured items for this topic:');
      for (const excerpt of topic.l2Excerpts) {
        lines.push(`- ${excerpt}`);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return `\n\n## Topic Wiki (already known to the reader — DO NOT re-extract)\n\n${blocks.join('\n\n')}`;
}

/**
 * Apply tiered truncation so that `buildTopicWikiContextSection(ctx)` fits in `maxChars`.
 *
 * Truncation tiers (applied in sequence until rendered length ≤ `maxChars`):
 *   1. Drop OLDEST L2 excerpts within each topic, round-robin (preserve newest).
 *      L2 excerpts are pre-formatted `${date}: ${content}` strings produced by
 *      Task 5; we treat them as opaque strings ordered newest-first (excerpts[0]
 *      is newest), so dropping from the END of each excerpt array drops oldest.
 *   2. Halve the LONGEST topic page `sections` string, slicing on a `\n` boundary
 *      at-or-before the half-length mark so the output stays parseable.
 *   3. Drop the LOWEST-SCORED topic (last element of `detectedTopics`).
 *   4. The HIGHEST-SCORED topic (`detectedTopics[0]`) is never dropped.
 *
 * Returns the truncated context plus the rendered char count for telemetry/tests.
 * Never mutates the input.
 */
export function truncateTopicWikiContextToBudget(
  ctx: TopicWikiContext,
  maxChars: number,
): { ctx: TopicWikiContext; totalChars: number } {
  // Deep-clone so we never mutate the caller's bundle.
  let working: TopicWikiContext = {
    detectedTopics: ctx.detectedTopics.map(t => ({
      slug: t.slug,
      sections: t.sections,
      l2Excerpts: [...t.l2Excerpts],
      ...(t.lastRefreshed !== undefined ? { lastRefreshed: t.lastRefreshed } : {}),
      ...(t.stale !== undefined ? { stale: t.stale } : {}),
    })),
  };

  const measure = (c: TopicWikiContext): number => buildTopicWikiContextSection(c).length;

  // Tier 1: drop oldest L2 excerpts round-robin (oldest = end of each array).
  // Loop while still over budget AND any topic has excerpts to drop.
  while (measure(working) > maxChars) {
    let dropped = false;
    for (const topic of working.detectedTopics) {
      if (topic.l2Excerpts.length > 0) {
        topic.l2Excerpts.pop();
        dropped = true;
        if (measure(working) <= maxChars) break;
      }
    }
    if (!dropped) break;
  }

  // Tier 2: halve the longest sections string on a `\n` boundary.
  while (measure(working) > maxChars) {
    let longestIdx = -1;
    let longestLen = -1;
    for (let i = 0; i < working.detectedTopics.length; i++) {
      const len = working.detectedTopics[i].sections.length;
      if (len > longestLen) {
        longestLen = len;
        longestIdx = i;
      }
    }
    if (longestIdx === -1 || longestLen === 0) break;

    const original = working.detectedTopics[longestIdx].sections;
    const halfMark = Math.floor(original.length / 2);
    // Slice at the last \n at-or-before halfMark so we don't cut mid-line.
    const lastNewline = original.lastIndexOf('\n', halfMark);
    const cutAt = lastNewline > 0 ? lastNewline : halfMark;
    const truncated = original.slice(0, cutAt);

    if (truncated.length === original.length) break; // No progress possible.
    working.detectedTopics[longestIdx] = {
      ...working.detectedTopics[longestIdx],
      sections: truncated,
    };
  }

  // Tier 3: drop the lowest-scored topic (last element). Never drop the highest-scored.
  while (measure(working) > maxChars && working.detectedTopics.length > 1) {
    working = {
      detectedTopics: working.detectedTopics.slice(0, -1),
    };
  }

  return { ctx: working, totalChars: measure(working) };
}

/**
 * Merge wiki-detected topic slugs into a pre-rendered active-topics slug list.
 *
 * The active-topics list (built via `renderActiveTopicsAsSlugList`) is one entry
 * per line in the form `<slug> — <status>: <summary>`. Wiki-detected slugs only
 * have a slug (no status, no summary), so they're appended as bare-slug lines.
 * Slugs already present in the active list are skipped — first-line-token compare,
 * trim-tolerant, prevents duplicate entries.
 *
 * Returns the merged string, or `undefined` when both inputs are empty (so the
 * "Prefer these existing topic slugs" block continues to be omitted entirely).
 */
export function mergeDetectedSlugsIntoActiveList(
  activeTopicSlugs: string | undefined,
  detectedSlugs: string[] | undefined,
): string | undefined {
  const baseLines = activeTopicSlugs && activeTopicSlugs.length > 0
    ? activeTopicSlugs.split('\n')
    : [];
  const existing = new Set<string>();
  for (const line of baseLines) {
    const slug = line.trim().split(/\s+/)[0];
    if (slug.length > 0) existing.add(slug);
  }

  const additions: string[] = [];
  if (detectedSlugs) {
    for (const slug of detectedSlugs) {
      if (slug.length === 0) continue;
      if (existing.has(slug)) continue;
      existing.add(slug);
      additions.push(slug);
    }
  }

  if (baseLines.length === 0 && additions.length === 0) return undefined;
  return [...baseLines, ...additions].join('\n');
}

// ---------------------------------------------------------------------------
// Exclusion List Building
// ---------------------------------------------------------------------------

/** Token budget for exclusion list (~1000 tokens ≈ 4000 chars). */
const MAX_EXCLUSION_CHARS = 4000;

/** Maximum items per category in exclusion list. */
const MAX_EXCLUSION_ITEMS_PER_CATEGORY = 10;

/**
 * Build exclusion list section for deduplication.
 * Groups items by type (action items, decisions, learnings) with positive "SKIP" framing.
 * Includes UPDATE exception for changed items.
 *
 * Sources:
 * - priorItems → use item.source if available, else "Prior Meeting"
 * - context.relatedContext.recentDecisions → use "Recent Decision"
 * - context.relatedContext.recentLearnings → use "Recent Learning"
 *
 * @param context - Optional MeetingContextBundle with recentDecisions/recentLearnings
 * @param priorItems - Items already extracted from earlier meetings in a batch
 * @returns Exclusion list section string, empty if no items
 */
export function buildExclusionListSection(
  context?: MeetingContextBundle,
  priorItems?: PriorItem[],
): string {
  const actionItems: Array<{ text: string; source: string }> = [];
  const decisions: Array<{ text: string; source: string }> = [];
  const learnings: Array<{ text: string; source: string }> = [];

  // Collect from priorItems (already extracted from earlier meetings)
  if (priorItems && priorItems.length > 0) {
    for (const item of priorItems) {
      const source = item.source || 'Prior Meeting';
      const entry = { text: item.text, source };

      switch (item.type) {
        case 'action':
          actionItems.push(entry);
          break;
        case 'decision':
          decisions.push(entry);
          break;
        case 'learning':
          learnings.push(entry);
          break;
      }
    }
  }

  // Collect from context.relatedContext (recent memory items)
  if (context?.relatedContext) {
    const { recentDecisions, recentLearnings } = context.relatedContext;

    if (recentDecisions && recentDecisions.length > 0) {
      for (const text of recentDecisions) {
        decisions.push({ text, source: 'Recent Decision' });
      }
    }

    if (recentLearnings && recentLearnings.length > 0) {
      for (const text of recentLearnings) {
        learnings.push({ text, source: 'Recent Learning' });
      }
    }
  }

  // No items to exclude
  if (actionItems.length === 0 && decisions.length === 0 && learnings.length === 0) {
    return '';
  }

  // Build the exclusion list with token budget awareness
  const sections: string[] = [];
  let totalChars = 0;

  // Helper to add items up to limit and track character count
  const addItemsSection = (
    title: string,
    items: Array<{ text: string; source: string }>,
  ): void => {
    if (items.length === 0) return;

    const header = `**${title}:**\n`;
    let sectionContent = header;

    // Limit to MAX_EXCLUSION_ITEMS_PER_CATEGORY, keep most recent (end of array)
    const itemsToShow = items.slice(-MAX_EXCLUSION_ITEMS_PER_CATEGORY);

    for (let i = 0; i < itemsToShow.length; i++) {
      const item = itemsToShow[i];
      const line = `${i + 1}. "${item.text}" — source: ${item.source}\n`;

      // Check if adding this line would exceed budget
      if (totalChars + sectionContent.length + line.length > MAX_EXCLUSION_CHARS) {
        break;
      }
      sectionContent += line;
    }

    if (sectionContent !== header) {
      sections.push(sectionContent.trim());
      totalChars += sectionContent.length;
    }
  };

  // Add sections in order: action items, decisions, learnings
  addItemsSection('Staged Action Items', actionItems);
  addItemsSection('Staged Decisions', decisions);
  addItemsSection('Staged Learnings', learnings);

  if (sections.length === 0) {
    return '';
  }

  return `

## Exclusion List (SKIP these — already captured)

The following items have ALREADY been extracted. SKIP these and any semantic equivalents:

${sections.join('\n\n')}

If the transcript mentions anything semantically equivalent to the above, SKIP IT.
Exception: Extract if the transcript contains an UPDATE to an existing item (e.g., status change, deadline moved, decision reversed).`;
}

// ---------------------------------------------------------------------------
// Single-pass prompt (W2) — known-items section + Layer-1 context + builder
// ---------------------------------------------------------------------------

/**
 * Pre-rendered Layer-1 context blocks for the single-pass prompt. All
 * optional; absent blocks are simply omitted. Assembled by the caller (CLI /
 * winddown path) so this module stays storage-free.
 */
export type SinglePassContextSections = {
  /** "Who John is / how direction works" — enables `direction: none`. */
  identityFrame?: string;
  /**
   * Open commitments filtered to present counterparties — dedup at source:
   * the model marks `continuation_of` instead of re-emitting.
   */
  openCommitments?: string;
  /** Prior same-series meetings' items + open questions (W1.5 resolver). */
  seriesContext?: string;
};

/**
 * Build the single-pass "known items" section (W2 — review finding 1).
 *
 * REPLACES `buildExclusionListSection`'s "SKIP these" framing in single_pass
 * mode with **mark-don't-skip**: prior items are presented as already-known;
 * the model RE-EMITS matching items WITH `continuation_of`/`supersedes`
 * markers and never omits a superseding item. This is what keeps same-day
 * supersession arcs alive for the day-level reconcile (CHR D3/D4/AC3 — the
 * Anthony de_002 → workshop de_004 fixture).
 *
 * Same sources and budgets as the exclusion list (priorItems +
 * recentDecisions/recentLearnings, MAX_EXCLUSION_CHARS, 10/category).
 * Legacy mode keeps `buildExclusionListSection` untouched.
 */
export function buildKnownItemsSection(
  context?: MeetingContextBundle,
  priorItems?: PriorItem[],
): string {
  const actionItems: Array<{ text: string; source: string }> = [];
  const decisions: Array<{ text: string; source: string }> = [];
  const learnings: Array<{ text: string; source: string }> = [];

  if (priorItems && priorItems.length > 0) {
    for (const item of priorItems) {
      const source = item.source || 'Prior Meeting';
      const entry = { text: item.text, source };
      switch (item.type) {
        case 'action': actionItems.push(entry); break;
        case 'decision': decisions.push(entry); break;
        case 'learning': learnings.push(entry); break;
      }
    }
  }

  if (context?.relatedContext) {
    const { recentDecisions, recentLearnings } = context.relatedContext;
    if (recentDecisions) for (const text of recentDecisions) decisions.push({ text, source: 'Recent Decision' });
    if (recentLearnings) for (const text of recentLearnings) learnings.push({ text, source: 'Recent Learning' });
  }

  if (actionItems.length === 0 && decisions.length === 0 && learnings.length === 0) {
    return '';
  }

  const sections: string[] = [];
  let totalChars = 0;
  const addItemsSection = (title: string, items: Array<{ text: string; source: string }>): void => {
    if (items.length === 0) return;
    const header = `**${title}:**\n`;
    let sectionContent = header;
    const itemsToShow = items.slice(-MAX_EXCLUSION_ITEMS_PER_CATEGORY);
    for (let i = 0; i < itemsToShow.length; i++) {
      const item = itemsToShow[i];
      const line = `${i + 1}. "${item.text}" — source: ${item.source}\n`;
      if (totalChars + sectionContent.length + line.length > MAX_EXCLUSION_CHARS) break;
      sectionContent += line;
    }
    if (sectionContent !== header) {
      sections.push(sectionContent.trim());
      totalChars += sectionContent.length;
    }
  };

  addItemsSection('Known Action Items', actionItems);
  addItemsSection('Known Decisions', decisions);
  addItemsSection('Known Learnings', learnings);

  if (sections.length === 0) return '';

  return `

## Already-known items (MARK, don't skip)

The following items are ALREADY tracked from earlier meetings/memory. They are
context, NOT an exclusion list:

${sections.join('\n\n')}

Rules for items that overlap with the list above:
- Same item, no new information → re-emit it WITH \`"continuation_of": "<known item text or id>"\`. Do NOT silently omit it.
- This meeting CHANGES, reverses, narrows, or replaces a known item → emit the NEW version WITH \`"supersedes": "<known item text or id>"\`. **Never omit a superseding item** — a dropped supersession silently leaves the stale version in force.
- Genuinely new item → emit normally, no marker.`;
}

/**
 * Build the single-pass extraction prompt (W2 — judgment-first).
 *
 * Replaces the accreted IS/IS-NOT pattern lists with the benchmark prompt
 * shape that recovered 5/5 audited misses + 17/17 staged items on the
 * compliance transcript: closeability rule, one-utterance-one-type,
 * ⚠-if-unsure, importance tiers with blocker cues, open questions, direction
 * `none`, continuation/supersedes markers, "don't pad". Keeps the parts of
 * the legacy prompt that carry the win: topic-wiki context + delta directive
 * (incl. the open-question-resolution escape hatch), topic-bias block, and
 * the meeting-context bundle (attendee stances / goals / agenda / area).
 *
 * Layer-1 context blocks (identity frame, open commitments, series context)
 * arrive pre-rendered via `sections` — assembled by the caller.
 *
 * Only used when `extraction_mode: single_pass`; the legacy
 * `buildMeetingExtractionPrompt` is untouched.
 */
export function buildSinglePassExtractionPrompt(
  transcript: string,
  opts?: {
    attendees?: string[];
    ownerSlug?: string;
    ownerName?: string;
    context?: MeetingContextBundle;
    priorItems?: PriorItem[];
    activeTopicSlugs?: string;
    sections?: SinglePassContextSections;
  },
): string {
  const attendees = opts?.attendees;
  const ownerSlug = opts?.ownerSlug;
  const ownerName = opts?.ownerName;
  const context = opts?.context;
  const sections = opts?.sections;

  const attendeeContext = attendees?.length
    ? `\n\nMeeting attendees: ${attendees.join(', ')}`
    : '';

  const speakingRatio = ownerName ? calculateSpeakingRatio(transcript, ownerName) : undefined;

  // Identity frame: caller-provided block wins; otherwise a minimal default
  // built from owner info so `direction: none` is always explainable.
  const identityFrame = sections?.identityFrame
    ? `\n\n## Who is reading this\n${sections.identityFrame}`
    : ownerSlug
      ? `\n\n## Who is reading this
The workspace owner is @${ownerSlug}${ownerName ? ` (${ownerName})` : ''}.${speakingRatio !== undefined ? ` Speaking ratio in this meeting: ${(speakingRatio * 100).toFixed(0)}%.` : ''}
Direction on action items is relative to the owner. The owner attends some
meetings as an observer — when neither side of an action item is the owner
and the work is team-internal, the correct direction is "none". Do NOT force
i_owe_them/they_owe_me onto items that are not owner-relative.`
      : '';

  const enhancedContext = context ? buildContextSection(context) : '';

  const rawWikiCtx = context?.topicWikiContext;
  const hasWikiContext = !!rawWikiCtx && rawWikiCtx.detectedTopics.length > 0;
  const wikiContextSection = hasWikiContext
    ? buildTopicWikiContextSection(
        truncateTopicWikiContextToBudget(rawWikiCtx, MAX_TOPIC_WIKI_CONTEXT_CHARS).ctx,
      )
    : '';

  const deltaDirective = hasWikiContext
    ? `
## Delta-only extraction
The "Topic Wiki" section below shows what is ALREADY captured for the topics
this meeting touches. Treat all of it as known by the reader.

Extract a learning, decision, action, or open question ONLY when it is a DELTA:
- NEW decision: a choice made in this meeting that the wiki doesn't already record
- CHANGED plan: this meeting reverses, narrows, or rescopes something the wiki shows
- NEW risk or gap raised
- NEW open question raised (not already in the wiki's Open questions)
- CONFIRMATION ONLY when the wiki shows a prior plan as uncertain and this meeting
  pins it down (record as a new decision; cite what was uncertain)

Do NOT emit restatements of what the wiki already records. When in doubt,
INCLUDE with the ⚠ flag — a flagged borderline item is reviewable; a missed
real delta is invisible and lost.

### Example: CONFIRMATION-of-uncertainty (the load-bearing escape hatch)

Wiki shows under Open questions: "Pricing tier — $99 or $149?"
Meeting transcript: "We're going with $149 — Sara confirmed the margin model works."
→ Emit as a NEW decision: "Pricing tier set to $149 (resolves prior open question
  on margin model)." Cite the wiki's uncertainty.

Counter-example: Wiki shows under Current state: "Pricing tier locked at $149."
Meeting transcript: "Yeah, pricing is $149." → Do NOT emit. Already committed.
`
    : '';

  const openCommitmentsBlock = sections?.openCommitments
    ? `\n\n## Open commitments with people in this meeting (already tracked)\n${sections.openCommitments}\n\nIf the transcript advances, restates, or closes one of these, emit the item WITH \`"continuation_of": "<commitment text or id>"\` rather than as a fresh item.`
    : '';

  const seriesBlock = sections?.seriesContext
    ? `\n\n## Possibly related: prior meetings in this series (advisory — verify before marking continuation)\n${sections.seriesContext}`
    : '';

  const knownItems = buildKnownItemsSection(context, opts?.priorItems);

  return `You are extracting structured intelligence from a meeting transcript for the
workspace owner's knowledge system. Read the FULL transcript before emitting
anything — judgments at minute 50 supersede tentative statements at minute 5.
${attendeeContext}${identityFrame}

Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.

JSON schema:
{
  "summary": "string — 2-3 sentence summary. If the workspace owner participated, include their perspective.",
  "core": "Free-form prose. Lead with the most actionable, decided, or changed thing. Do not restate wiki content.",
  "could_include": ["Up to 8 self-contained one-line headlines for side threads worth knowing about, ordered by importance."],
  "action_items": [
    {
      "owner": "string — full name of the person who owns this action",
      "owner_slug": "string — lowercase-hyphenated (e.g., 'john-smith')",
      "description": "string — concise action WITH ITS COMPLETION CONDITION (what done looks like)",
      "direction": "i_owe_them | they_owe_me | none — relative to the workspace owner; 'none' = team-internal / not owner-relative",
      "counterparty_slug": "string (optional)",
      "due": "string (optional)",
      "confidence": "number (0-1)",
      "importance": "blocker | high | normal",
      "uncertain": "boolean — true if you are unsure this should be recorded (the ⚠ flag)",
      "uncertainty_reason": "string (only when uncertain) — one short clause why",
      "continuation_of": "string (optional) — known item/commitment this continues",
      "supersedes": "string (optional) — known item this replaces or reverses"
    }
  ],
  "next_steps": ["string — each agreed-upon next step"],
  "decisions": [{ "text": "string", "confidence": "number (0-1)", "importance": "blocker | high | normal", "uncertain": "boolean", "uncertainty_reason": "string (optional)", "continuation_of": "string (optional)", "supersedes": "string (optional)" }],
  "learnings": [{ "text": "string", "confidence": "number (0-1)", "importance": "blocker | high | normal", "uncertain": "boolean", "uncertainty_reason": "string (optional)" }],
  "open_questions": ["string — questions raised but NOT resolved in this meeting; things the team still needs to answer"],
  "topics": ["string — 3-6 slugified keywords for what this meeting was substantively about"]
}
${opts?.activeTopicSlugs !== undefined && opts.activeTopicSlugs.length > 0 ? `
${TOPIC_BIAS_BLOCK_PROMPT}

${opts.activeTopicSlugs}
` : ''}${deltaDirective}
## Judgment rules (these replace pattern lists — use your judgment)

1. **Closeability.** An action item must have a completion condition — a
   reader should be able to say unambiguously "this is now done". A standing
   policy or way-of-working ("PRDs will include a UX section from now on") is
   a DECISION, not an action item; if the conversation also names a concrete
   first instance, emit that instance as the action item.

2. **One utterance, one type.** A single statement is ONE item of ONE type —
   the strongest applicable. Do not emit the same utterance as an action AND
   a decision AND a learning. Exception: a decision plus a separate learning
   is fine when the insight outlives the decision (the general principle vs
   the specific call).

3. **⚠ if unsure.** When you are not confident an item belongs — marginal
   relevance, possible duplicate, observational noise, unclear owner — emit
   it WITH "uncertain": true and a short "uncertainty_reason". Do not silently
   drop borderline real items, and do not launder doubt into confident items.

4. **Importance tiers.**
   - "blocker": blocks a launch, a person, or a dependency; legal/compliance
     gates; "X can't happen until Y" — even if mentioned once in passing or in
     closing remarks. Missing a blocker is the worst failure this system has.
   - "high": decisions that change plans, commitments the owner must act on,
     deadlines, escalations.
   - "normal": everything else worth recording.

5. **Direction honesty.** "none" is correct for team-internal work the owner
   merely observed. Never force i_owe_them/they_owe_me onto a third-party
   item, and never emit two mirror copies (same sentence, opposite
   directions, different owners) — one utterance, one item.

6. **Don't pad.** Every item must trace to something actually said in the
   transcript. No filler, no restating context blocks, no inventing owners or
   dates. If the transcript garbles a word, repair it only when the meaning
   is unambiguous from context.

7. **Trust the transcript over any recorder summary.** If a provided summary
   contradicts what was actually said, the transcript wins.

8. **Open questions are first-class.** A real question raised and left
   unresolved goes in "open_questions" — not forced into a decision or
   dropped.
${enhancedContext}${wikiContextSection}${openCommitmentsBlock}${seriesBlock}${knownItems}

Transcript:
${transcript}`;
}

/**
 * Build attendee slug lookup from context for owner resolution.
 * Returns a map of lowercase name -> slug.
 */
function buildAttendeeSlugLookup(context: MeetingContextBundle): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const attendee of context.attendees) {
    // Map both full name and email (without domain) to slug
    lookup.set(attendee.name.toLowerCase(), attendee.slug);
    if (attendee.email) {
      const emailPrefix = attendee.email.split('@')[0].toLowerCase();
      lookup.set(emailPrefix, attendee.slug);
    }
  }
  return lookup;
}

/**
 * Build the LLM prompt for extracting meeting intelligence.
 *
 * @param transcript - Meeting transcript text
 * @param attendees - List of attendee names (optional, for context)
 * @param ownerSlug - Workspace owner's slug (for direction classification)
 * @param context - Optional MeetingContextBundle for enhanced extraction
 * @param priorItems - Items already extracted from earlier meetings in a batch (for deduplication)
 * @param ownerName - Owner's full name for speaking ratio and owner synthesis
 * @param activeTopicSlugs - Pre-rendered slug list (`slug — status: summary` per line)
 *   from `renderActiveTopicsAsSlugList(getActiveTopics(topics))`. When provided,
 *   the extraction prompt instructs the LLM to prefer existing slugs at propose-
 *   time, biasing against topic sprawl. This is the first line of defense against
 *   duplicate topics; Jaccard + LLM alias adjudication at meeting-apply is the
 *   backstop. Bare slugs, no wikilinks — `[[...]]` in the prompt would leak
 *   into the JSON `topics[]` output.
 */
export function buildMeetingExtractionPrompt(
  transcript: string,
  attendees?: string[],
  ownerSlug?: string,
  context?: MeetingContextBundle,
  priorItems?: PriorItem[],
  ownerName?: string,
  activeTopicSlugs?: string,
): string {
  const attendeeContext = attendees?.length
    ? `\n\nMeeting attendees: ${attendees.join(', ')}`
    : '';

  const speakingRatio = ownerName ? calculateSpeakingRatio(transcript, ownerName) : undefined;

  const ownerContext = ownerSlug
    ? `\nWorkspace owner: @${ownerSlug}${ownerName ? ` (${ownerName})` : ''}
${speakingRatio !== undefined ? `Speaking ratio: ${(speakingRatio * 100).toFixed(0)}%
` : ''}In the summary, include a sentence about what this meeting means specifically for the workspace owner.`
    : '';

  // Build enhanced context section if context bundle is provided
  const enhancedContext = context ? buildContextSection(context) : '';

  // Build topic-wiki context section (delta-only extraction support).
  // Truncates to MAX_TOPIC_WIKI_CONTEXT_CHARS via the testable budget helper.
  // The companion delta directive (below) appears earlier in the prompt — it
  // references this section by name, so the two must move together.
  const rawWikiCtx = context?.topicWikiContext;
  const hasWikiContext = !!rawWikiCtx && rawWikiCtx.detectedTopics.length > 0;
  const wikiContextSection = hasWikiContext
    ? buildTopicWikiContextSection(
        truncateTopicWikiContextToBudget(rawWikiCtx, MAX_TOPIC_WIKI_CONTEXT_CHARS).ctx,
      )
    : '';

  // Delta-only directive — only injected when topic-wiki context is present.
  // Without context, the directive's references to "the Topic Wiki section below"
  // would dangle and confuse the LLM. Verbatim text below is load-bearing —
  // tests assert literal substrings to catch drift (R3 mitigation).
  const deltaDirective = hasWikiContext
    ? `
## Delta-only extraction
The "Topic Wiki" section below shows what is ALREADY captured for the topics
this meeting touches. Treat all of it as known by the reader.

Extract a learning, decision, action, or open question ONLY when it is a DELTA:
- NEW decision: a choice made in this meeting that the wiki doesn't already record
- CHANGED plan: this meeting reverses, narrows, or rescopes something the wiki shows
- NEW risk or gap raised
- NEW open question raised (not already in the wiki's Open questions)
- CONFIRMATION ONLY when the wiki shows a prior plan as uncertain and this meeting
  pins it down (record as a new decision; cite what was uncertain)

Do NOT emit:
- Restatements of decisions or learnings already in the wiki
- Confirmations of plans the wiki already shows as committed
- Status updates on items the wiki already records
- The same fact described differently than the wiki's existing phrasing

When in doubt, INCLUDE. A duplicate gets caught downstream by dedup; a
missed real delta is invisible and lost.

### Example: CONFIRMATION-of-uncertainty (the load-bearing escape hatch)

Wiki shows under Open questions: "Pricing tier — $99 or $149?"
Meeting transcript: "We're going with $149 — Sara confirmed the margin model works."
→ Emit as a NEW decision: "Pricing tier set to $149 (resolves prior open question
  on margin model)." Cite the wiki's uncertainty.

Counter-example: Wiki shows under Current state: "Pricing tier locked at $149."
Meeting transcript: "Yeah, pricing is $149." → Do NOT emit. Already committed.
`
    : '';

  // Build exclusion list for deduplication (from prior items and recent memory)
  const exclusionList = buildExclusionListSection(context, priorItems);

  return `You are analyzing a meeting transcript to extract structured intelligence.

**IMPORTANT**: Extract ONLY high-confidence, specific items. Quality over quantity.
- Skip vague intentions ("we should...", "maybe we could...")
- Skip trivial follow-ups ("schedule a meeting", "touch base", "follow up")
- Skip items without a clear owner AND concrete deliverable
- If uncertain whether something is an action item, exclude it

Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.
${attendeeContext}${ownerContext}

JSON schema:
{
  "summary": "string — 2-3 sentence summary. If workspace owner participated, include their perspective.",
  "core": "Free-form prose. Lead with the most actionable, decided, or changed thing. Do not restate wiki content. No bullet caps; use whatever shape fits the substance.",
  "could_include": ["Up to 8 informative one-line headlines for side threads worth knowing about. Order by importance — most worth surfacing first; drop the least important when over budget. Each headline must be self-contained (e.g., 'Risks: Sara flagged churn assumption' — not just 'Risks')."],
  "action_items": [
    {
      "owner": "string — full name of person who owns this action",
      "owner_slug": "string — lowercase-hyphenated owner name (e.g., 'john-smith')",
      "description": "string — concise action description (max 150 chars)",
      "direction": "i_owe_them | they_owe_me — relative to workspace owner",
      "counterparty_slug": "string (optional) — the other party involved",
      "due": "string (optional) — due date if mentioned (e.g., 'Friday', '2026-03-10')",
      "confidence": "number (0-1) — your confidence this is a real action item"
    }
  ],
  "next_steps": ["string — each agreed-upon next step"],
  "decisions": [{ "text": "string — the decision made", "confidence": "number (0-1) — your confidence this is a real decision" }],
  "learnings": [{ "text": "string — key insight or learning", "confidence": "number (0-1) — your confidence this is a genuine insight" }],
  "topics": ["string — 3-6 slugified keywords for what this meeting was substantively about"]
}
${activeTopicSlugs !== undefined && activeTopicSlugs.length > 0 ? `
${TOPIC_BIAS_BLOCK_PROMPT}

${activeTopicSlugs}
` : ''}${deltaDirective}

## What IS an action item (INCLUDE these — high confidence ≥0.8):
✓ "John to send API docs to Sarah by Friday" — specific owner, deliverable, deadline
✓ "Alice will schedule the follow-up meeting for next week" — owner + concrete task
✓ "I'll have the proposal ready by Monday" — clear commitment with deadline
✓ "Bob needs to review the PR before merge" — explicit owner + action

## What is NOT an action item (EXCLUDE these — confidence 0):
✗ "Me: Yeah, I'll look into that..." — transcript artifacts with speaker labels
✗ "So the way the system works is..." — explanations, not actions
✗ "I'm not sure, but maybe we could..." — uncertainty, no commitment
✗ "Them: We should probably consider..." — vague suggestions
✗ "We should schedule a meeting" — trivial, no specific owner
✗ "Let's follow up on this" — vague follow-up
✗ "We can discuss this later" — deferral, not action
✗ "We will touch base next week" — trivial check-in
✗ Long descriptions spanning multiple sentences
✗ "I wonder if we could ask analytics about X" / "Maybe we try Y" — speculation, not commitment (cap confidence at 0.5 if included at all)
✗ Mid-meeting commitments that get RESOLVED or OBVIATED later in the same transcript (e.g., someone agrees to find a test case, then the issue is live-debugged and no test case is needed). Read the full transcript before emitting — if the need goes away, the item goes away.

## Consolidation — emit ONE item per unit of work (CRITICAL):
Before emitting an action item, ask: "If I completed this, would that also complete another item on my list?" If yes, merge them into ONE item owned by whoever actually does the work.

**Pattern 1 — Handoff chain.** Person A identifies a problem, Person B agrees to fix it, Person C picks it up. This is ONE action item owned by whoever ends up doing the work (usually the last person in the chain). Not three items.
  ✗ BAD: ai_001 "Anthony to fix case-sensitivity bug" + ai_002 "Tim to pick up the case-sensitivity fix"
  ✓ GOOD: ai_001 "Tim to fix case-sensitivity bug in state abbreviations" (owner = whoever actually owns it post-handoff)

**Pattern 2 — Collaborative initiative split across contributors.** A single project/pilot/experiment with multiple people contributing different pieces is ONE action item describing the outcome, not one item per contributor's sub-task. Only split if sub-tasks have genuinely independent deliverables that could ship on different timelines.
  ✗ BAD: ai_001 "John to investigate Claude for damage estimation" + ai_002 "Lindsay to test Claude on closed claims" + ai_003 "Crystal to get Claude access for team" + ai_004 "Crystal to send closed claim numbers to John"
  ✓ GOOD: ai_001 "John + team to pilot Claude for damage estimation (review closed claims, validate outputs)" — one initiative, one item, owner = driver.

  **Enabling sub-tasks fold in.** If a sub-task only exists TO UNBLOCK the parent initiative — "get X access", "provision Y", "send the test data", "find a claim to test on" — it is NOT a separate action item. It's a precondition of the parent, and naming the parent implicitly covers it. Only emit it separately if it's a genuinely independent deliverable that would still matter if the parent were cancelled.

**Pattern 3 — Same outcome, different verbs.** "Investigate X", "review X", "validate X", "test X" said by the same or related speakers about the same target are usually ONE item. Pick the strongest verb; don't emit multiple.

**Pattern 4 — Compound sentence with mirror direction (CRITICAL).** A single sentence naming TWO actors with one verb and one object is ONE action item, not two. Do NOT emit a "mirror pair" — two items with identical or near-identical \`description\` but opposite \`direction\` values and different \`owner_slug\` values. The direction is relative to the workspace owner: if the workspace owner is one of the actors, emit \`i_owe_them\` (owner owes the other party). If the workspace owner is neither actor (third-party observation), emit ONE item with the actor as \`owner_slug\` and pick \`they_owe_me\` only if the deliverable lands with the owner.
  ✗ BAD: ai_001 "John to reach out to compliance" (direction: i_owe_them, owner: john-koht) + ai_002 "John to follow up with Anthony" (direction: they_owe_me, owner: anthony-avina) — these are the SAME sentence split into mirror items.
  ✓ GOOD: ONE item: "John to reach out to compliance, then follow up with Anthony" (direction: i_owe_them, owner: john-koht).
  ✗ BAD: ai_001 "Sara to send the data to Mark" (direction: i_owe_them, owner: sara-x) + ai_002 "Mark to receive the data from Sara" (direction: they_owe_me, owner: mark-y).
  ✓ GOOD: ONE item: "Sara to send the data to Mark" (owner: sara-x, direction relative to workspace owner).

After drafting your action_items list, re-read it: if two items would be completed by the same piece of work, merge them before returning. Specifically check for mirror pairs (Pattern 4) — opposite directions + near-identical text + different owners = one of them is wrong, drop it.

## What is NOT a decision (EXCLUDE these):
✗ "We discussed the product roadmap" — discussion summary, not a choice made
✗ "Team reviewed the Q2 metrics" — activity description, not a decision
✗ "Meeting moved to Tuesday" — logistics, not a strategic decision
✗ "A new ops hire is expected to join April 20" — status update, no choice was made
✗ "The goal is to refine the process" — goal statement, not a decision
✗ "High-confidence call links are ready for use" — readiness status, not a decision
✗ "We use Notion for tracking" — existing tool/process, not a new decision
✗ Raw metrics or statistics without a decision attached

## What is NOT a learning (EXCLUDE these):
✗ "Anthony is a runner and fitness enthusiast" — personal trivia
✗ "Reserv named to Forbes Fintech 50" — organizational announcement
✗ "A new ops hire expected April 20" — status update
✗ "We deploy on Tuesdays" — known process, not a novel insight
✗ "TalkDesk contract is ~$1M/year" — raw financial fact without insight
✗ "ISO is used on nearly every claim" — raw statistic without learning
✗ "The team met to discuss priorities" — meeting description, not an insight

## Action Item Confidence Guide:
- 0.9-1.0: Explicit commitment with owner + deadline (e.g., "John will send docs by Friday")
- 0.7-0.8: Clear owner + task but no deadline (e.g., "Sarah to review the PR")
- 0.5-0.6: Implied commitment, owner inferable (e.g., "I'll look into the bug"); speculative framing ("I wonder if...", "Maybe we could...") caps here even if an owner is named
- 0.3-0.4: Vague intention (exclude these)
- 0.0-0.2: Not an action item (exclude these)

## Decision Confidence Guide:
- 0.9-1.0: Explicit choice made with alternatives rejected (e.g., "We decided to use PostgreSQL over MongoDB")
- 0.7-0.8: Clear direction chosen, implied alternatives (e.g., "Going with the phased rollout approach")
- 0.5-0.6: Soft agreement, may not be final (e.g., "Leaning toward option A")
- Below 0.5: Not a decision — exclude

## Learning Confidence Guide:
- 0.9-1.0: Novel insight that changes how work is done (e.g., "Batch processing reduces errors by 40%")
- 0.7-0.8: Useful domain knowledge, non-obvious (e.g., "Enterprise users prefer email over Slack notifications")
- 0.5-0.6: Interesting but may be common knowledge
- Below 0.5: Not a learning — exclude

Rules:
- Return ONLY the JSON object, no other text
- Keep action item descriptions under 150 characters
- Each action item MUST have a clear owner and specific deliverable
- Include confidence (0-1) for EVERY action item
- Direction is relative to workspace owner: "i_owe_them" = owner owes someone, "they_owe_me" = someone owes owner. NEVER emit a mirror-direction pair (two items with near-identical text but opposite \`direction\` and different \`owner_slug\`) from a single source sentence — see Pattern 4.
- Omit sections that have no content (return empty arrays, not null)
- Be HIGHLY selective: extract only items you're confident about (≥0.5)
- When in doubt, exclude rather than include garbage
- Topics: format as lowercase-hyphenated slugs (e.g. 'email-templates', 'q2-planning', 'onboarding-v2'). 3–6 topics max. Exclude generic words: meeting, discussion, update, call, sync, review, followup, follow-up, next-steps.
- Include confidence (0-1) for EVERY decision and learning
- Before finalizing, review your list: remove any decisions that are status updates or meeting logistics, remove any learnings that are personal facts or common knowledge, remove duplicates with different wording
${enhancedContext}${wikiContextSection}${exclusionList}

Transcript:
${transcript}`;
}

/**
 * Build a lightweight LLM prompt for minimal extraction.
 * ~50% shorter than normal prompt, focused on summary + domain learnings.
 *
 * Used for light-importance meetings where full extraction is overhead.
 *
 * @param transcript - Meeting transcript text
 */
export function buildLightExtractionPrompt(transcript: string): string {
  return `Extract minimal intelligence from this meeting transcript.

Return ONLY valid JSON with no markdown formatting:
{
  "summary": "string — 2-3 sentence summary of the meeting",
  "learnings": [{ "text": "string — domain insight", "confidence": "number (0-1)" }]
}

## What TO extract (learnings only):
- Product strategy insights
- User feedback or behavior patterns
- Strategic decisions with long-term impact
- Domain expertise or technical discoveries

## What to SKIP (do NOT extract):
- Action items (not needed for this meeting type)
- Operational decisions (tool choices, meeting logistics)
- Process updates (standups, status changes)
- Configuration details

Examples:
✓ EXTRACT: "Enterprise users prefer batch processing over real-time"
✓ EXTRACT: "React 19 Server Components reduce initial bundle by 40%"
✗ SKIP: "We'll use Notion for tracking" (tool choice)
✗ SKIP: "Meeting moved to Tuesday" (logistics)

Rules:
- Return ONLY the JSON object
- Maximum 2 learnings (most valuable only)
- Empty learnings array is fine if nothing qualifies

Transcript:
${transcript}`;
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into a MeetingExtractionResult.
 * Handles various response formats gracefully — never throws.
 * Returns validation warnings for rejected items.
 *
 * @param response - Raw LLM response text
 * @param limits - Optional category limits (defaults to CATEGORY_LIMITS for normal mode)
 * @param ownerSlug - Optional workspace owner slug; used by the mirror-pair
 *                    dedup pass (Phase 8 followup-6) to break ties between
 *                    candidate canonical items.
 * @param opts.singlePass - single-pass mode (W1/W3): accepts the new schema
 *   (importance tiers, ⚠ fields, direction `none`, open_questions,
 *   continuation/supersedes markers), applies NO category caps, and flips
 *   every mechanical filter (garbage/trivial/mirror-pair/near-dup) to
 *   telemetry-only — items are kept and the detector fires an
 *   `ExtractionTelemetryEvent` instead (D4). Legacy path (default) is
 *   bit-identical to the pre-W1 behavior.
 */
export function parseMeetingExtractionResponse(
  response: string,
  limits: CategoryLimits = CATEGORY_LIMITS,
  ownerSlug?: string,
  opts?: { singlePass?: boolean },
): MeetingExtractionResult {
  const singlePass = opts?.singlePass === true;
  const emptyResult: MeetingExtractionResult = {
    intelligence: {
      summary: '',
      actionItems: [],
      nextSteps: [],
      decisions: [],
      learnings: [],
      topics: [],
    },
    validationWarnings: [],
    rawItems: [],
  };

  const trimmed = response.trim();
  if (!trimmed) return emptyResult;

  let jsonStr = trimmed;

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find a JSON object in the string
  const braceStart = jsonStr.indexOf('{');
  const braceEnd = jsonStr.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
  }

  let raw: RawExtractionResult;
  try {
    raw = JSON.parse(jsonStr) as RawExtractionResult;
  } catch {
    // Malformed JSON — return empty result
    return emptyResult;
  }

  const validationWarnings: ValidationWarning[] = [];
  const actionItems: ActionItem[] = [];
  const rawItems: RawExtractedItem[] = [];
  const telemetryEvents: ExtractionTelemetryEvent[] = [];
  const previewOf = (t: string): string => t.slice(0, 50) + (t.length > 50 ? '...' : '');

  // Parse summary
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  // Parse `core` — optional free-form prose. Sanitize against raw `---` (R7).
  let core: string | undefined;
  if (typeof raw.core === 'string') {
    const trimmedCore = raw.core.trim();
    if (trimmedCore) {
      const { sanitized, stripped } = stripYamlDocSeparator(trimmedCore);
      if (stripped > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[meeting-extraction] stripped ${stripped} YAML doc separator line(s) from core`,
        );
      }
      // Re-trim — sanitizer may leave leading/trailing newlines after a
      // separator line was removed.
      const finalCore = sanitized.replace(/^\n+|\n+$/g, '');
      if (finalCore) core = finalCore;
    }
  }

  // Parse `could_include` — optional list of headlines. Hard-cap at 8.
  // Trim each entry, reject empty-after-trim, reject > 200 chars. Sanitize
  // each entry against raw `---` (R7).
  const COULD_INCLUDE_MAX_COUNT = 8;
  const COULD_INCLUDE_MAX_CHARS = 200;
  let couldInclude: string[] | undefined;
  if (Array.isArray(raw.could_include)) {
    const out: string[] = [];
    for (const entry of raw.could_include) {
      if (out.length >= COULD_INCLUDE_MAX_COUNT) break; // hard-cap; drop excess
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (!trimmed) continue; // reject empty after trim
      if (trimmed.length > COULD_INCLUDE_MAX_CHARS) continue; // reject overly long
      const { sanitized, stripped } = stripYamlDocSeparator(trimmed);
      if (stripped > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[meeting-extraction] stripped ${stripped} YAML doc separator line(s) from could_include`,
        );
      }
      const finalEntry = sanitized.replace(/^\n+|\n+$/g, '').trim();
      if (!finalEntry) continue;
      out.push(finalEntry);
    }
    if (out.length > 0) couldInclude = out;
  }

  // Parse action items with validation
  if (Array.isArray(raw.action_items)) {
    for (const item of raw.action_items) {
      if (!item || typeof item !== 'object') continue;

      const description = typeof item.description === 'string' ? item.description.trim() : '';
      const owner = typeof item.owner === 'string' ? item.owner.trim() : '';
      const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';
      // Parse confidence (default to undefined if not a valid number)
      const confidence = typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1
        ? item.confidence
        : undefined;

      // Skip items missing required fields. This is the one unavoidable drop
      // in single_pass mode (an item with no text/owner cannot be staged) —
      // it fires telemetry instead of vanishing (AC8 enumeration #2).
      if (!description || !owner) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'unparseable_item',
            itemType: 'action',
            item: previewOf(description || JSON.stringify(item).slice(0, 50)),
            detail: !description ? 'missing description' : 'missing owner',
          });
        }
        continue;
      }

      // Store raw item BEFORE validation filtering (for debugging/analysis)
      rawItems.push({
        type: 'action',
        text: description,
        owner,
        direction,
        confidence,
      });

      // Validate against garbage patterns.
      // single_pass (D4): telemetry-only — item is KEPT.
      const garbageReason = isGarbageItem(description);
      if (garbageReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: garbageReason.startsWith('starts with')
              ? 'garbage_prefix'
              : garbageReason.startsWith('exceeds')
                ? 'length_limit'
                : 'multi_sentence',
            itemType: 'action',
            item: previewOf(description),
            detail: garbageReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(description),
            reason: garbageReason,
          });
          continue;
        }
      }

      // Check for trivial patterns. single_pass (D4): telemetry-only.
      const trivialReason = isTrivialItem(description);
      if (trivialReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'trivial_pattern',
            itemType: 'action',
            item: previewOf(description),
            detail: trivialReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(description),
            reason: trivialReason,
          });
          continue;
        }
      }

      // Validate direction. single_pass accepts `none`; an invalid/missing
      // direction defaults to `none` (the safe, commitment-inert value —
      // defaulting to i_owe_them would fabricate commitments) + telemetry.
      let finalDirection = direction;
      if (singlePass) {
        if (!VALID_DIRECTIONS_SINGLE_PASS.has(direction)) {
          telemetryEvents.push({
            detector: 'invalid_direction',
            itemType: 'action',
            item: previewOf(description),
            detail: `invalid direction "${direction}" — defaulted to none`,
          });
          finalDirection = 'none';
        }
      } else if (!VALID_DIRECTIONS.has(direction)) {
        validationWarnings.push({
          item: previewOf(description),
          reason: `invalid direction "${direction}"`,
        });
        continue;
      }

      const ownerSlug = typeof item.owner_slug === 'string'
        ? item.owner_slug.trim()
        : slugify(owner);

      const judgment = singlePass ? parseJudgmentFields(item) : undefined;

      actionItems.push({
        owner,
        ownerSlug,
        description,
        direction: finalDirection as ActionItemDirection,
        counterpartySlug: typeof item.counterparty_slug === 'string'
          ? item.counterparty_slug.trim() || undefined
          : undefined,
        due: typeof item.due === 'string' ? item.due.trim() || undefined : undefined,
        confidence,
        ...(judgment ?? {}),
      });
    }
  }

  // Parse next steps
  const nextSteps: string[] = [];
  if (Array.isArray(raw.next_steps)) {
    for (const step of raw.next_steps) {
      if (typeof step === 'string' && step.trim()) {
        nextSteps.push(step.trim());
      }
    }
  }

  // Parse decisions (supports both string and { text, confidence } objects)
  const decisions: string[] = [];
  const decisionConfidences: (number | undefined)[] = [];
  const decisionMeta: (ItemJudgment | undefined)[] = [];
  if (Array.isArray(raw.decisions)) {
    for (const decision of raw.decisions) {
      let text: string | undefined;
      let confidence: number | undefined;
      let judgment: ItemJudgment | undefined;
      if (typeof decision === 'string') {
        text = decision.trim();
      } else if (decision && typeof decision === 'object') {
        text = typeof decision.text === 'string' ? decision.text.trim() : undefined;
        if (typeof decision.confidence === 'number') {
          confidence = Math.max(0, Math.min(1, decision.confidence));
        }
        if (singlePass) judgment = parseJudgmentFields(decision);
      }
      if (!text) continue;

      // Apply garbage filter (lighter check — no action-item length limit).
      // single_pass (D4): telemetry-only — item is KEPT.
      const garbageReason = isGarbageDecisionOrLearning(text);
      if (garbageReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'garbage_prefix',
            itemType: 'decision',
            item: previewOf(text),
            detail: garbageReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(text),
            reason: `decision: ${garbageReason}`,
          });
          continue;
        }
      }

      // Apply trivial decision filter. single_pass (D4): telemetry-only.
      const trivialReason = isTrivialDecision(text);
      if (trivialReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'trivial_pattern',
            itemType: 'decision',
            item: previewOf(text),
            detail: trivialReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(text),
            reason: trivialReason,
          });
          continue;
        }
      }

      rawItems.push({ type: 'decision', text, confidence });
      decisions.push(text);
      decisionConfidences.push(confidence);
      decisionMeta.push(judgment);
    }
  }

  // Parse learnings (supports both string and { text, confidence } objects)
  const learnings: string[] = [];
  const learningConfidences: (number | undefined)[] = [];
  const learningMeta: (ItemJudgment | undefined)[] = [];
  if (Array.isArray(raw.learnings)) {
    for (const learning of raw.learnings) {
      let text: string | undefined;
      let confidence: number | undefined;
      let judgment: ItemJudgment | undefined;
      if (typeof learning === 'string') {
        text = learning.trim();
      } else if (learning && typeof learning === 'object') {
        text = typeof learning.text === 'string' ? learning.text.trim() : undefined;
        if (typeof learning.confidence === 'number') {
          confidence = Math.max(0, Math.min(1, learning.confidence));
        }
        if (singlePass) judgment = parseJudgmentFields(learning);
      }
      if (!text) continue;

      // Apply garbage filter (lighter check — no action-item length limit).
      // single_pass (D4): telemetry-only — item is KEPT.
      const garbageReason = isGarbageDecisionOrLearning(text);
      if (garbageReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'garbage_prefix',
            itemType: 'learning',
            item: previewOf(text),
            detail: garbageReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(text),
            reason: `learning: ${garbageReason}`,
          });
          continue;
        }
      }

      // Apply trivial learning filter. single_pass (D4): telemetry-only.
      const trivialReason = isTrivialLearning(text);
      if (trivialReason) {
        if (singlePass) {
          telemetryEvents.push({
            detector: 'trivial_pattern',
            itemType: 'learning',
            item: previewOf(text),
            detail: trivialReason,
          });
        } else {
          validationWarnings.push({
            item: previewOf(text),
            reason: trivialReason,
          });
          continue;
        }
      }

      rawItems.push({ type: 'learning', text, confidence });
      learnings.push(text);
      learningConfidences.push(confidence);
      learningMeta.push(judgment);
    }
  }

  // Parse open questions (single_pass D3). Legacy responses never include
  // the field; parsing is mode-independent but inert for legacy.
  const openQuestions: string[] = [];
  if (Array.isArray(raw.open_questions)) {
    for (const q of raw.open_questions) {
      if (typeof q !== 'string') continue;
      const trimmedQ = q.trim();
      if (!trimmedQ) continue;
      if (openQuestions.length >= OPEN_QUESTIONS_MAX) break;
      openQuestions.push(trimmedQ);
    }
  }

  // Parse topics — validate slug format, drop banned words, cap at max
  const topics: string[] = [];
  if (Array.isArray(raw.topics)) {
    for (const t of raw.topics) {
      if (typeof t !== 'string') continue;
      const slug = t.trim(); // validate as-is — drop, never transform
      if (!TOPIC_SLUG_REGEX.test(slug)) continue;
      if (TOPIC_BANNED.has(slug)) continue;
      if (topics.length >= TOPIC_MAX_COUNT) break;
      topics.push(slug);
    }
  }

  // ---------------------------------------------------------------------------
  // Post-processing filters (order: mirror-pair dedup → near-dup → category limits)
  //
  // single_pass mode (W3 / D4): every detector below runs DETECT-ONLY — items
  // are kept, the detector emits an ExtractionTelemetryEvent, and category
  // limits are not applied (there is no cap, so there is no overflow loss).
  // ---------------------------------------------------------------------------

  // 0. Mirror-pair dedup (Phase 8 followup-6): drop "John to X" (i_owe_them,
  //    owner=john) + "Anthony to receive X" (they_owe_me, owner=anthony) pairs
  //    emitted from a single compound sentence. Runs BEFORE same-direction
  //    dedup so the canonical-side selection logic sees the original pair.
  const { kept: postMirrorPairs, dropped: mirrorPairsDropped } = dedupMirrorPairs(actionItems, ownerSlug);
  if (singlePass) {
    for (const { item, canonicalDescription } of mirrorPairsDropped) {
      telemetryEvents.push({
        detector: 'mirror_pair',
        itemType: 'action',
        item: previewOf(item.description),
        detail: `mirror-pair suspect of: "${previewOf(canonicalDescription)}" (kept — flagged for review)`,
      });
    }
  } else {
    for (const { item, reason, canonicalDescription } of mirrorPairsDropped) {
      const droppedPreview = previewOf(item.description);
      const canonicalPreview = previewOf(canonicalDescription);
      validationWarnings.push({
        item: droppedPreview,
        reason: `${reason}: "${canonicalPreview}"`,
      });
    }
  }
  const postMirrorActionItems = singlePass ? actionItems : postMirrorPairs;

  // 1. Near-duplicate deduplication for action items (Jaccard > 0.8)
  const { kept: dedupedActionItems, filtered: dedupedFiltered } = deduplicateItems(postMirrorActionItems);
  for (const { item, reason } of dedupedFiltered) {
    if (singlePass) {
      telemetryEvents.push({
        detector: 'near_duplicate',
        itemType: 'action',
        item: previewOf(item.description),
        detail: `${reason} (kept)`,
      });
    } else {
      validationWarnings.push({
        item: previewOf(item.description),
        reason,
      });
    }
  }
  const finalActionItems = singlePass ? postMirrorActionItems : dedupedActionItems;

  // 2. Near-duplicate deduplication for decisions (carry confidence + meta through)
  const { kept: dedupedDecisions, filtered: dedupedDecisionsFiltered } = deduplicateItems(
    decisions.map((d, i) => ({ text: d, conf: decisionConfidences[i], meta: decisionMeta[i] }))
  );
  for (const { item, reason } of dedupedDecisionsFiltered) {
    if (singlePass) {
      telemetryEvents.push({
        detector: 'near_duplicate',
        itemType: 'decision',
        item: previewOf(item.text),
        detail: `${reason} (kept)`,
      });
    } else {
      validationWarnings.push({
        item: previewOf(item.text),
        reason,
      });
    }
  }
  const keptDecisions = singlePass
    ? decisions.map((d, i) => ({ text: d, conf: decisionConfidences[i], meta: decisionMeta[i] }))
    : dedupedDecisions;
  const finalDecisions = keptDecisions.map(d => d.text);
  const finalDecisionConfidences = keptDecisions.map(d => d.conf);
  const finalDecisionMeta = keptDecisions.map(d => d.meta);

  // 3. Near-duplicate deduplication for learnings (carry confidence + meta through)
  const { kept: dedupedLearnings, filtered: dedupedLearningsFiltered } = deduplicateItems(
    learnings.map((l, i) => ({ text: l, conf: learningConfidences[i], meta: learningMeta[i] }))
  );
  for (const { item, reason } of dedupedLearningsFiltered) {
    if (singlePass) {
      telemetryEvents.push({
        detector: 'near_duplicate',
        itemType: 'learning',
        item: previewOf(item.text),
        detail: `${reason} (kept)`,
      });
    } else {
      validationWarnings.push({
        item: previewOf(item.text),
        reason,
      });
    }
  }
  const keptLearnings = singlePass
    ? learnings.map((l, i) => ({ text: l, conf: learningConfidences[i], meta: learningMeta[i] }))
    : dedupedLearnings;
  const finalLearnings = keptLearnings.map(l => l.text);
  const finalLearningConfidences = keptLearnings.map(l => l.conf);
  const finalLearningMeta = keptLearnings.map(l => l.meta);

  // 4. Apply category limits (keep first N in LLM response order).
  //    single_pass (D1): NO caps — the cap slice is the documented blocker-loss
  //    mechanism (benchmark-evidence failure-mode map, meeting-extraction:1637).
  const limitedActionItems = singlePass ? finalActionItems : finalActionItems.slice(0, limits.actionItems);
  const limitedDecisions = singlePass ? finalDecisions : finalDecisions.slice(0, limits.decisions);
  const limitedDecisionConfidences = singlePass
    ? finalDecisionConfidences
    : finalDecisionConfidences.slice(0, limits.decisions);
  const limitedDecisionMeta = singlePass ? finalDecisionMeta : finalDecisionMeta.slice(0, limits.decisions);
  const limitedLearnings = singlePass ? finalLearnings : finalLearnings.slice(0, limits.learnings);
  const limitedLearningConfidences = singlePass
    ? finalLearningConfidences
    : finalLearningConfidences.slice(0, limits.learnings);
  const limitedLearningMeta = singlePass ? finalLearningMeta : finalLearningMeta.slice(0, limits.learnings);

  // Add warnings for items exceeding limits (legacy only — single_pass has no caps)
  if (!singlePass && finalActionItems.length > limits.actionItems) {
    for (let i = limits.actionItems; i < finalActionItems.length; i++) {
      validationWarnings.push({
        item: previewOf(finalActionItems[i].description),
        reason: `exceeds action item limit (${limits.actionItems})`,
      });
    }
  }
  if (!singlePass && finalDecisions.length > limits.decisions) {
    for (let i = limits.decisions; i < finalDecisions.length; i++) {
      validationWarnings.push({
        item: previewOf(finalDecisions[i]),
        reason: `exceeds decision limit (${limits.decisions})`,
      });
    }
  }
  if (!singlePass && finalLearnings.length > limits.learnings) {
    for (let i = limits.learnings; i < finalLearnings.length; i++) {
      validationWarnings.push({
        item: previewOf(finalLearnings[i]),
        reason: `exceeds learning limit (${limits.learnings})`,
      });
    }
  }

  // Build confidence arrays — only include if at least one value is defined
  const hasDecisionConf = limitedDecisionConfidences.some(c => c !== undefined);
  const hasLearningConf = limitedLearningConfidences.some(c => c !== undefined);
  const hasDecisionMeta = limitedDecisionMeta.some(m => m !== undefined);
  const hasLearningMeta = limitedLearningMeta.some(m => m !== undefined);

  return {
    intelligence: {
      summary,
      actionItems: limitedActionItems,
      nextSteps,
      decisions: limitedDecisions,
      learnings: limitedLearnings,
      ...(hasDecisionConf && { decisionConfidences: limitedDecisionConfidences }),
      ...(hasLearningConf && { learningConfidences: limitedLearningConfidences }),
      ...(hasDecisionMeta && { decisionMeta: limitedDecisionMeta }),
      ...(hasLearningMeta && { learningMeta: limitedLearningMeta }),
      topics,
      ...(core !== undefined && { core }),
      ...(couldInclude !== undefined && { could_include: couldInclude }),
      ...(singlePass && openQuestions.length > 0 && { openQuestions }),
    },
    validationWarnings,
    rawItems,
    ...(singlePass && { telemetryEvents }),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract meeting intelligence from a transcript using an LLM.
 *
 * @param transcript - The meeting transcript text
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @param options - Optional attendees, ownerSlug, context, priorItems, and mode for extraction
 * @returns Extracted intelligence with validation warnings — empty on error
 */
export async function extractMeetingIntelligence(
  transcript: string,
  callLLM: LLMCallFn,
  options?: {
    attendees?: string[];
    ownerSlug?: string;
    context?: MeetingContextBundle;
    priorItems?: PriorItem[];
    /** Extraction mode: 'light' for minimal, 'normal' (default), 'thorough' for comprehensive */
    mode?: ExtractionMode;
    /** Owner's full name for speaking ratio */
    ownerName?: string;
    /**
     * Pre-rendered active-topic slug list (bare slugs, no wikilinks) for
     * biasing the extraction LLM toward reusing existing topic slugs.
     * Build via `renderActiveTopicsAsSlugList(getActiveTopics(topics))`.
     * When present, injected after the JSON schema. See
     * `meeting-extraction.ts:buildMeetingExtractionPrompt` for the
     * full rationale.
     */
    activeTopicSlugs?: string;
    /**
     * single-pass extraction (W1/W2/W3): judgment-first prompt + new schema,
     * no caps, detectors telemetry-only. Driven by `extraction_mode:
     * single_pass` in arete.yaml. Default false = legacy, bit-identical.
     */
    singlePass?: boolean;
    /**
     * Pre-rendered Layer-1 context blocks for the single-pass prompt
     * (identity frame, open commitments, series context, known-items
     * mark-don't-skip). Built by the caller (CLI) via
     * `buildSinglePassContextSections`. Ignored in legacy mode.
     */
    singlePassContext?: SinglePassContextSections;
  },
): Promise<MeetingExtractionResult> {
  if (!transcript || transcript.trim() === '') {
    return {
      intelligence: {
        summary: '',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
      },
      validationWarnings: [],
      rawItems: [],
    };
  }

  const mode = options?.mode ?? 'normal';

  // Merge detected topic-wiki slugs into the active-slugs string so the
  // existing "Prefer these existing topic slugs" prompt block sees both.
  // The contract at `buildMeetingExtractionPrompt` (lines 596–602) is that
  // the builder receives a pre-rendered string — keep this merge at the
  // caller layer, NOT inside the builder.
  const mergedActiveTopicSlugs = mergeDetectedSlugsIntoActiveList(
    options?.activeTopicSlugs,
    options?.context?.topicWikiContext?.detectedTopics.map(t => t.slug),
  );

  // single-pass (W2): judgment-first prompt, no caps, telemetry-only
  // detectors. Light-importance meetings keep the light prompt even in
  // single_pass mode — importance triage is orthogonal to pipeline mode.
  const singlePass = options?.singlePass === true && (options?.mode ?? 'normal') !== 'light';

  // Select prompt and limits based on mode
  let prompt: string;
  let limits: CategoryLimits;

  if (singlePass) {
    prompt = buildSinglePassExtractionPrompt(transcript, {
      attendees: options?.attendees,
      ownerSlug: options?.ownerSlug,
      ownerName: options?.ownerName,
      context: options?.context,
      priorItems: options?.priorItems,
      activeTopicSlugs: mergedActiveTopicSlugs,
      sections: options?.singlePassContext,
    });
    // Limits are unused in single-pass parsing (no caps) — pass the default
    // for signature compatibility.
    try {
      const response = await callLLM(prompt);
      return parseMeetingExtractionResponse(response, CATEGORY_LIMITS, options?.ownerSlug, {
        singlePass: true,
      });
    } catch {
      return {
        intelligence: {
          summary: '',
          actionItems: [],
          nextSteps: [],
          decisions: [],
          learnings: [],
        },
        validationWarnings: [],
        rawItems: [],
        telemetryEvents: [],
      };
    }
  }

  switch (mode) {
    case 'light':
      // Light mode: minimal prompt, only summary + 2 learnings
      prompt = buildLightExtractionPrompt(transcript);
      limits = LIGHT_LIMITS;
      break;
    case 'thorough':
      // Thorough mode: full prompt with higher limits
      prompt = buildMeetingExtractionPrompt(
        transcript,
        options?.attendees,
        options?.ownerSlug,
        options?.context,
        options?.priorItems,
        options?.ownerName,
        mergedActiveTopicSlugs,
      );
      limits = THOROUGH_LIMITS;
      break;
    case 'normal':
    default:
      // Normal mode: full prompt with standard limits
      prompt = buildMeetingExtractionPrompt(
        transcript,
        options?.attendees,
        options?.ownerSlug,
        options?.context,
        options?.priorItems,
        options?.ownerName,
        mergedActiveTopicSlugs,
      );
      limits = CATEGORY_LIMITS;
      break;
  }

  try {
    const response = await callLLM(prompt);
    return parseMeetingExtractionResponse(response, limits, options?.ownerSlug);
  } catch {
    // LLM call failed — return empty result rather than propagating
    return {
      intelligence: {
        summary: '',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
      },
      validationWarnings: [],
      rawItems: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Staging Sections Formatting
// ---------------------------------------------------------------------------

/**
 * Format an action item as a markdown list item.
 * 
 * Format: `- ai_XXX: [@{ownerSlug} {arrow} @{counterpartySlug}] {description}{ (due)}`
 * - Arrow: `→` if direction is `i_owe_them`, `←` if direction is `they_owe_me`
 * - Counterparty: omit `@{counterpartySlug}` if undefined
 * - Due: append ` ({due})` only if defined
 * 
 * @param item - The structured action item
 * @param index - Zero-based index for ID generation (1-indexed in output)
 */
function formatActionItem(item: ActionItem, index: number): string {
  const id = `ai_${String(index + 1).padStart(3, '0')}`;
  // `·` = direction none (team-internal, single-pass D3). The marker is
  // deliberately NOT an arrow so the commitment-creating parsers
  // (meeting-parser.ts, APPROVED_OWNER_PATTERN) never read it as a
  // directional commitment (D7 inertness).
  const arrow = item.direction === 'i_owe_them' ? '→' : item.direction === 'none' ? '·' : '←';
  const counterparty = item.counterpartySlug ? ` @${item.counterpartySlug}` : '';
  const dueStr = item.due ? ` (${item.due})` : '';
  
  return `- ${id}: [@${item.ownerSlug} ${arrow}${counterparty}] ${item.description}${dueStr}`;
}

/**
 * Format extraction result as markdown sections.
 * IDs are zero-padded 3 digits (ai_001, de_001, le_001).
 * Empty sections are omitted entirely.
 * 
 * @param result - The meeting extraction result containing structured intelligence
 * @returns Formatted markdown string with Summary and staged sections
 */
export function formatStagedSections(result: MeetingExtractionResult): string {
  const { intelligence } = result;
  const lines: string[] = [];

  // Lead-prose section: Core takes precedence over Summary when present.
  // Strategy (Task 8, Decision #7): emit ## Core when LLM provided non-empty
  // `core`; otherwise emit ## Summary for backward compat (existing files,
  // existing parsers, existing test fixtures all assume Summary). When both
  // are present, prefer Core (the LLM signaled wiki-aware extraction);
  // `summary` is dropped to avoid double-writing the same lead.
  const core = intelligence.core?.trim();
  if (core) {
    lines.push('## Core');
    lines.push(core);
    lines.push('');
  } else {
    // Existing behavior: emit ## Summary even when summary is the empty
    // string (preserves backward compat with historical fixtures and the
    // pre-Task-8 "always includes Summary" assertion).
    lines.push('## Summary');
    lines.push(intelligence.summary);
    lines.push('');
  }

  // `## Could include` body-block rendering was removed in Phase 1 wiki
  // expansion. The same content (side-thread headlines worth knowing
  // about but not load-bearing enough to commit) is now surfaced under
  // `## FYI` and `## Things mentioned but not actioned` in the summary
  // file at `.arete/memory/summaries/meetings/<date>-<slug>.md`. The
  // `intelligence.could_include` field is still parsed from the LLM
  // response and threaded into the summary writer's prompt context so
  // those items continue to surface — just not duplicated on the source
  // meeting file. `'Could include'` remains in `STAGED_HEADERS` so old
  // files that already have the section get cleaned on next apply.

  // Staged Action Items (only if non-empty)
  if (intelligence.actionItems.length > 0) {
    lines.push('## Staged Action Items');
    intelligence.actionItems.forEach((item, index) => {
      lines.push(formatActionItem(item, index));
    });
    lines.push('');
  }

  // Parser-dropped: mirror-pair duplicates (Phase 8 followup-6, AC for
  // validationWarnings visibility per review-1 C3). Surface mirror-pair
  // drops in the chef-curated meeting view so the user can review what
  // was suppressed at curate-time — pre-mortem R1 mitigation (false-positive
  // recovery requires the user actually seeing the drop). Empty section is
  // omitted entirely (no warnings → no section).
  const mirrorPairWarnings = result.validationWarnings.filter(
    w => w.reason.startsWith('mirror-pair duplicate'),
  );
  if (mirrorPairWarnings.length > 0) {
    lines.push('## Parser-dropped (mirror-pair duplicates)');
    lines.push(
      '_The extractor dropped these items as mirror-pair duplicates of another action ' +
      'item from the same compound transcript sentence. Reinstate if a legitimate ' +
      'bilateral pair was dropped (Jaccard ≥ 0.90 + opposite direction + different owner)._',
    );
    mirrorPairWarnings.forEach(w => {
      lines.push(`- ${w.item} — ${w.reason}`);
    });
    lines.push('');
  }

  // Staged Decisions (only if non-empty)
  if (intelligence.decisions.length > 0) {
    lines.push('## Staged Decisions');
    intelligence.decisions.forEach((item, index) => {
      const id = `de_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${item}`);
    });
    lines.push('');
  }

  // Staged Learnings (only if non-empty)
  if (intelligence.learnings.length > 0) {
    lines.push('## Staged Learnings');
    intelligence.learnings.forEach((item, index) => {
      const id = `le_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${item}`);
    });
    lines.push('');
  }

  // Open Questions (single-pass D3) — persist-don't-render-everywhere interim:
  // questions live on the meeting file; wiki feed wiring is F2. Legacy
  // extractions never populate openQuestions, so legacy output is unchanged.
  if (intelligence.openQuestions && intelligence.openQuestions.length > 0) {
    lines.push('## Open Questions');
    intelligence.openQuestions.forEach((q, index) => {
      const id = `oq_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${q}`);
    });
    lines.push('');
  }

  // Parser-flagged (single-pass W3): the mirror-pair detector's visibility
  // contract survives the telemetry flip — suspects are KEPT in the staged
  // list and flagged here, instead of dropped and listed in Parser-dropped.
  const mirrorPairEvents = (result.telemetryEvents ?? []).filter(e => e.detector === 'mirror_pair');
  if (mirrorPairEvents.length > 0) {
    lines.push('## Parser-flagged (mirror-pair suspects)');
    lines.push(
      '_The mirror-pair detector flagged these staged action items as possible ' +
      'mirror duplicates (Jaccard ≥ 0.90 + opposite direction + different owner). ' +
      'Both items were KEPT — review and skip the wrong one._',
    );
    mirrorPairEvents.forEach(e => {
      lines.push(`- ${e.item} — ${e.detail}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Headers that are part of the staged sections.
 * Used to identify where staged content ends and other content begins.
 */
const STAGED_HEADERS = new Set([
  'Summary',
  'Core',
  'Could include',
  'Staged Action Items',
  'Parser-dropped (mirror-pair duplicates)',
  'Staged Decisions',
  'Staged Learnings',
]);

/**
 * Extractor-written headers that only exist in single_pass mode (W1/W3).
 * Deliberately NOT in the legacy STAGED_HEADERS set: a legacy-mode
 * re-extract must never strip a USER-authored "## Open Questions" section
 * (legacy bit-identical invariant). single_pass callers pass these via
 * `updateMeetingContent`'s `extraStagedHeaders`.
 */
export const SINGLE_PASS_STAGED_HEADERS = [
  'Open Questions',
  'Parser-flagged (mirror-pair suspects)',
] as const;

/**
 * Replace or insert staged sections in meeting content.
 * Preserves content before the lead-prose heading (## Summary or ## Core)
 * and content after staged sections. Accepts either heading as the anchor
 * so files written under the new wiki-aware shape are correctly rewritten
 * on subsequent passes (Task 8 / Decision #7).
 *
 * @param originalContent - The original meeting file content
 * @param stagedSections - The formatted staged sections to insert
 * @param extraStagedHeaders - Additional extractor-owned headers to treat as
 *   staged (single_pass passes SINGLE_PASS_STAGED_HEADERS so its own
 *   `## Open Questions` / `## Parser-flagged` sections are replaced on
 *   re-extract; legacy callers omit this and user sections with those names
 *   are preserved as before)
 * @returns Updated content with staged sections replaced/inserted
 */
export function updateMeetingContent(
  originalContent: string,
  stagedSections: string,
  extraStagedHeaders?: readonly string[],
): string {
  const stagedHeaders = extraStagedHeaders && extraStagedHeaders.length > 0
    ? new Set([...STAGED_HEADERS, ...extraStagedHeaders])
    : STAGED_HEADERS;
  // Find where the lead-prose heading starts. Accept either ## Summary
  // (legacy / backward-compat) or ## Core (new shape). Pick whichever
  // appears first in the file.
  const leadMatch = originalContent.match(/^##\s+(?:Summary|Core)\s*$/m);

  if (!leadMatch) {
    // No existing lead heading — append staged sections at end
    return originalContent.trimEnd() + '\n\n' + stagedSections;
  }

  // Find the position of the lead heading
  const summaryIndex = originalContent.indexOf(leadMatch[0]);

  // Get content before the lead heading
  const beforeSummary = originalContent.substring(0, summaryIndex).trimEnd();

  // Find content after staged sections (look for ## that isn't a staged header)
  const afterSummaryContent = originalContent.substring(summaryIndex);
  const lines = afterSummaryContent.split('\n');
  let pastStagedSections = false;
  const afterLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      const headerName = line.replace(/^## /, '').trim();
      if (stagedHeaders.has(headerName)) {
        // This is a staged section header - skip until next header
        continue;
      } else {
        // This is a different header - keep everything from here
        pastStagedSections = true;
      }
    }

    if (pastStagedSections) {
      afterLines.push(line);
    }
  }

  let afterStagedContent = '';
  if (afterLines.length > 0) {
    afterStagedContent = '\n' + afterLines.join('\n');
  }

  return beforeSummary + '\n\n' + stagedSections + afterStagedContent;
}
