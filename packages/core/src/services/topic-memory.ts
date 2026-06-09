/**
 * TopicMemoryService — the L3 topic-wiki layer.
 *
 * Responsibilities (split across phased work):
 *  - alias/merge candidate topic slugs from source extraction against
 *    existing topic pages (Step 2 — primary concern of this file today)
 *  - integrateSource: read existing topic page + new source (meeting or
 *    slack-digest) + filter L2 items, ask LLM to rewrite only touched
 *    sections, merge back (Step 3)
 *  - discoverTopicSources / refreshAllFromSources: scan
 *    `resources/meetings/*.md` and `resources/notes/{date}-slack-digest.md`
 *    and integrate each source into every topic page that references it
 *    via frontmatter `topics:`. Both source classes share `parseMeetingFile`
 *    (the parser tolerates the slack-digest frontmatter shape; see
 *    plan `slack-digest-topic-wiki/plan.md` Step 2 and pre-mortem Risk 2).
 *  - listAll / listForArea: read topic pages from storage (needed by
 *    area-memory and CLAUDE.md regen)
 *
 * See plans:
 *  - dev/work/plans/topic-wiki-memory/plan.md (parent build)
 *  - dev/work/plans/slack-digest-topic-wiki/plan.md (slack-digest source class)
 */

import { join } from 'path';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';
import {
  parseTopicPage,
  selectSectionsForBudget,
  type TopicPage,
  type TopicPageFrontmatter,
} from '../models/topic-page.js';
import {
  jaccardSimilarity,
  normalizeForJaccard,
} from '../utils/similarity.js';

// ---------------------------------------------------------------------------
// Alias / merge types
// ---------------------------------------------------------------------------

/**
 * Candidate topic as produced by meeting extraction
 * (`meeting-extraction.ts:651` emits `topics: string[]`).
 */
export interface TopicCandidate {
  slug: string;
}

export type AliasDecision = 'coerced' | 'new' | 'ambiguous-resolved-existing' | 'ambiguous-new';

export interface AliasResult {
  input: string;           // the candidate slug from extraction
  resolved: string;        // the canonical slug after alias pass
  decision: AliasDecision; // how we got there (for logging / tests)
  jaccardScore?: number;   // best score vs any existing (undefined when no existing topics)
  matchedAgainst?: string; // which existing slug/alias it matched (when coerced)
}

/**
 * Jaccard thresholds for alias decisions.
 *
 * score >= COERCE_THRESHOLD       → auto-coerce to existing slug
 * AMBIGUOUS_LOW <= score < COERCE → LLM adjudication batch
 * score < AMBIGUOUS_LOW           → new topic
 *
 * Thresholds based on pre-mortem Risk 6 guidance:
 * - 0.6 was too loose for 1-4 token slugs (`leap-templates` vs
 *   `leap-email-templates` scored 0.67 and would falsely coerce)
 * - Current default COERCE is 0.67; AMBIGUOUS_LOW 0.4. Band is wide
 *   so LLM adjudication catches asymmetric failure cases. Tuning
 *   data will come from `arete topic seed --dry-run` on real
 *   workspaces.
 */
export const COERCE_THRESHOLD = 0.67;
export const AMBIGUOUS_LOW_THRESHOLD = 0.4;

/**
 * An existing topic's identity surface for alias matching: its canonical
 * slug + any declared aliases.
 *
 * `lastRefreshed` (YYYY-MM-DD) is sourced from the topic page's
 * frontmatter `last_refreshed` and used by the lexical detector
 * (`detectTopicsLexical`) as a recency tiebreaker on equal scores.
 * Optional — pages without `last_refreshed` continue to work; they
 * just lose the tiebreaker and fall through to the canonical-asc
 * fallback.
 */
export interface TopicIdentity {
  canonical: string;
  aliases: string[];
  lastRefreshed?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without storage)
// ---------------------------------------------------------------------------

/**
 * Stop-word / connector tokens filtered before Jaccard tokenization
 * (AC3, phase-3-5-followup-5). Stems like `belongings-vs-property-claims`
 * shouldn't include `vs` in the token set — it's a connector, not a
 * meaningful slug component.
 */
const TOKENIZE_STOP_WORDS: ReadonlySet<string> = new Set(['vs', 'and', 'or']);

/**
 * Singularize a single token (AC3, phase-3-5-followup-5).
 *
 * Rule: strip trailing `s` if and only if
 *   - token length ≥ 4 AND
 *   - second-to-last char is NOT `s` (preserves `-ss` endings like
 *     `process`, `address`, `business`, `class`).
 *
 * Known accepted edge cases (documented per pre-mortem R1):
 *   - `status` → `statu` (ends `-us`; benign — unlikely real slug clash)
 *   - `news` → `new` (ends `-ws`; benign — unlikely real slug clash)
 *
 * The rule deliberately stops at "drop trailing `s`": no Porter-style
 * suffix stripping. The goal is to collapse `templates`/`template`,
 * `decisions`/`decision`, `learnings`/`learning`, `meetings`/`meeting` —
 * the four high-traffic plural/singular pairs in observed slug drift.
 */
export function singularizeToken(token: string): string {
  if (token.length < 4) return token;
  if (!token.endsWith('s')) return token;
  // Preserve -ss endings (process, address, business, class).
  if (token.charAt(token.length - 2) === 's') return token;
  return token.slice(0, -1);
}

/**
 * Singularize a list of tokens using {@link singularizeToken}.
 *
 * Exported so the lexical topic detector can singularize the
 * **transcript** token set symmetrically with how `tokenizeSlug`
 * singularizes the **slug** side. Without this, `templates` (transcript)
 * and `template` (slug) live in different token spaces and never
 * intersect — silently breaking plural/alias topic detection
 * (phase-3-5-followup-5 regression).
 */
export function singularizeTokens(tokens: string[]): string[] {
  return tokens.map(singularizeToken);
}

/**
 * Tokenize a slug for Jaccard comparison.
 * `cover-whale-templates` → `['cover', 'whale', 'template']`.
 *
 * Post-AC3 (phase-3-5-followup-5):
 *   - Stop-word filter: drops `vs`, `and`, `or` before tokenization
 *     (so `belongings-vs-property-claims` tokenizes without `vs`).
 *   - Singularize-or-stem: strips trailing `s` on tokens of length ≥4
 *     when the second-to-last char isn't `s`. Closes the
 *     `templates`/`template`, `decisions`/`decision`,
 *     `learnings`/`learning`, `meetings`/`meeting` clash in tokenizeSlug.
 *
 * Edge cases preserved: `process`, `address`, `business`, `class` (all
 * `-ss` endings). Accepted edge cases: `status` → `statu`, `news` →
 * `new` (benign; see `singularizeToken` doc).
 */
export function tokenizeSlug(slug: string): string[] {
  const rawTokens = normalizeForJaccard(slug.replace(/-/g, ' '));
  const out: string[] = [];
  for (const t of rawTokens) {
    if (TOKENIZE_STOP_WORDS.has(t)) continue;
    out.push(singularizeToken(t));
  }
  return out;
}

/**
 * Compute the best Jaccard score of a candidate against all identity
 * surfaces of existing topics, returning the winning match.
 *
 * Returns `{ bestScore: 0 }` when there are no existing topics.
 */
export function bestAliasMatch(
  candidate: string,
  existing: TopicIdentity[],
): { bestScore: number; matchedCanonical?: string; matchedSurface?: string } {
  const candTokens = tokenizeSlug(candidate);
  if (candTokens.length === 0) return { bestScore: 0 };

  let bestScore = 0;
  let matchedCanonical: string | undefined;
  let matchedSurface: string | undefined;

  for (const topic of existing) {
    const surfaces = [topic.canonical, ...topic.aliases];
    for (const surface of surfaces) {
      // Exact string match is always a 1.0 hit (handles case where
      // candidate already is an existing slug or alias verbatim).
      if (surface === candidate) {
        return { bestScore: 1, matchedCanonical: topic.canonical, matchedSurface: surface };
      }
      const score = jaccardSimilarity(candTokens, tokenizeSlug(surface));
      if (score > bestScore) {
        bestScore = score;
        matchedCanonical = topic.canonical;
        matchedSurface = surface;
      }
    }
  }

  return { bestScore, matchedCanonical, matchedSurface };
}

/**
 * Classify a candidate against existing topics using Jaccard thresholds only.
 * Produces an AliasResult for the deterministic band; callers handle the
 * ambiguous band via LLM adjudication.
 */
export function classifyByJaccard(
  candidate: string,
  existing: TopicIdentity[],
): AliasResult {
  const match = bestAliasMatch(candidate, existing);

  if (match.bestScore >= COERCE_THRESHOLD && match.matchedCanonical !== undefined) {
    return {
      input: candidate,
      resolved: match.matchedCanonical,
      decision: 'coerced',
      jaccardScore: match.bestScore,
      matchedAgainst: match.matchedSurface,
    };
  }

  if (match.bestScore < AMBIGUOUS_LOW_THRESHOLD) {
    return {
      input: candidate,
      resolved: candidate,
      decision: 'new',
      jaccardScore: match.bestScore,
    };
  }

  // Ambiguous band — caller must run LLM adjudication. Returned "resolved"
  // is a placeholder; the caller overwrites it after adjudication.
  return {
    input: candidate,
    resolved: candidate,
    decision: 'ambiguous-new',
    jaccardScore: match.bestScore,
    matchedAgainst: match.matchedSurface,
  };
}

/**
 * Build the adjudication prompt for the LLM.
 * One prompt per batch of ambiguous candidates; returns JSON.
 *
 * See pre-mortem Risk 4: LLM output validation is load-bearing. The
 * parser below enforces enum keys (existing slug OR literal "NEW") to
 * prevent silent corruption of topic slugs.
 */
export function buildAdjudicationPrompt(
  candidates: Array<{ input: string; bestMatch: string }>,
  existing: TopicIdentity[],
): string {
  const existingList = existing
    .map((t) => {
      const aliases = t.aliases.length > 0 ? ` (aliases: ${t.aliases.join(', ')})` : '';
      return `- ${t.canonical}${aliases}`;
    })
    .join('\n');

  const candidatesList = candidates
    .map(
      (c, i) =>
        `${i + 1}. candidate="${c.input}" nearest existing="${c.bestMatch}"`,
    )
    .join('\n');

  return `You are deciding whether newly-proposed topic slugs refer to the same topic as any existing topic in a knowledge base.

EXISTING TOPICS:
${existingList}

AMBIGUOUS CANDIDATES:
${candidatesList}

For each candidate, decide:
- If it refers to the same topic as an existing slug, return that existing slug verbatim.
- If it is substantively about something new, return exactly "NEW".

Return ONLY a JSON object with shape:
{
  "decisions": [
    { "input": "<candidate slug>", "resolved": "<existing-slug-or-NEW>" },
    ...
  ]
}

Do not wrap the JSON in markdown fences or add commentary.`;
}

/**
 * Parse the LLM adjudication response and validate against the allowed
 * slug enum (existing canonicals + "NEW"). Returns a map from input →
 * resolved slug. Inputs the LLM failed to classify stay unresolved
 * (caller falls back to treating them as new).
 */
export function parseAdjudicationResponse(
  response: string,
  validSlugs: Set<string>,
): Map<string, string> {
  const out = new Map<string, string>();

  // Strip optional code fences / whitespace.
  const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return out;
  }

  if (parsed === null || typeof parsed !== 'object') return out;
  const decisions = (parsed as Record<string, unknown>).decisions;
  if (!Array.isArray(decisions)) return out;

  for (const d of decisions) {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) continue;
    const rec = d as Record<string, unknown>;
    const input = rec.input;
    const resolved = rec.resolved;
    if (typeof input !== 'string' || typeof resolved !== 'string') continue;

    // Validate against allowed set — rejects LLM hallucinated slugs.
    if (resolved === 'NEW' || validSlugs.has(resolved)) {
      out.set(input, resolved);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export interface AliasAndMergeOptions {
  /**
   * LLM function for adjudicating the 0.4-0.67 ambiguous band. When
   * undefined, ambiguous candidates are treated as new topics
   * (conservative — won't collapse distinct topics, but may allow
   * minor sprawl; lint catches it).
   */
  callLLM?: LLMCallFn;
}

export class TopicMemoryService {
  private readonly storage: StorageAdapter;
  private readonly searchProvider?: SearchProvider;

  constructor(storage: StorageAdapter, searchProvider?: SearchProvider) {
    this.storage = storage;
    this.searchProvider = searchProvider;
  }

  /**
   * Read all topic pages from `.arete/memory/topics/*.md`.
   * Returns `{ topics, errors }` — partial-state tolerant per pre-mortem
   * Risk 14. Corrupt pages are logged as errors; valid pages still usable.
   */
  async listAll(
    paths: WorkspacePaths,
  ): Promise<{ topics: TopicPage[]; errors: Array<{ path: string; reason: string }> }> {
    const topicsDir = join(paths.memory, 'topics');
    const exists = await this.storage.exists(topicsDir);
    if (!exists) return { topics: [], errors: [] };

    const files = await this.storage.list(topicsDir, { extensions: ['.md'] });
    const topics: TopicPage[] = [];
    const errors: Array<{ path: string; reason: string }> = [];

    for (const file of files) {
      const content = await this.storage.read(file);
      if (content === null) {
        errors.push({ path: file, reason: 'read returned null' });
        continue;
      }
      const parsed = parseTopicPage(content);
      if (parsed === null) {
        errors.push({ path: file, reason: 'parseTopicPage returned null (invalid frontmatter or schema)' });
        continue;
      }
      topics.push(parsed);
    }

    return { topics, errors };
  }

  /**
   * Derive the identity surface (canonical slug + aliases) from existing
   * topic pages.
   */
  static toIdentities(topics: TopicPage[]): TopicIdentity[] {
    return topics.map((t) => {
      const identity: TopicIdentity = {
        canonical: t.frontmatter.topic_slug,
        aliases: t.frontmatter.aliases ?? [],
      };
      // Populate the recency tiebreaker for `detectTopicsLexical`. Kept
      // optional so pages without a `last_refreshed` continue to work.
      if (typeof t.frontmatter.last_refreshed === 'string' && t.frontmatter.last_refreshed.length > 0) {
        identity.lastRefreshed = t.frontmatter.last_refreshed;
      }
      return identity;
    });
  }

  /**
   * Alias/merge a batch of candidate slugs against existing topics.
   *
   * Pipeline (per plan Step 2):
   *   1. Jaccard classify each candidate → coerced / new / ambiguous
   *   2. Batch all ambiguous candidates into one LLM call (if callLLM)
   *   3. Apply LLM decisions; unclassified ambiguous → new (conservative)
   *
   * Idempotent for identical inputs: returns identical results.
   */
  async aliasAndMerge(
    candidates: string[],
    existing: TopicIdentity[],
    options: AliasAndMergeOptions = {},
  ): Promise<AliasResult[]> {
    // Deduplicate inputs while preserving order — a source may repeat a slug.
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const c of candidates) {
      if (!seen.has(c)) {
        seen.add(c);
        deduped.push(c);
      }
    }

    // Tier 1 — deterministic Jaccard classification.
    const firstPass = deduped.map((c) => classifyByJaccard(c, existing));

    const ambiguous = firstPass.filter((r) => r.decision === 'ambiguous-new');
    if (ambiguous.length === 0 || options.callLLM === undefined) {
      // No ambiguous (or no LLM) → ambiguous candidates stay "new" conservatively.
      return firstPass.map((r) =>
        r.decision === 'ambiguous-new' ? { ...r, decision: 'ambiguous-new' as const } : r,
      );
    }

    // Tier 2 — LLM adjudication batch.
    const validSlugs = new Set(existing.map((e) => e.canonical));
    validSlugs.add('NEW');

    const prompt = buildAdjudicationPrompt(
      ambiguous.map((a) => ({
        input: a.input,
        bestMatch: a.matchedAgainst ?? '(none)',
      })),
      existing,
    );

    let llmDecisions: Map<string, string>;
    try {
      const response = await options.callLLM(prompt);
      llmDecisions = parseAdjudicationResponse(response, validSlugs);
    } catch {
      // LLM failure → fall through; ambiguous candidates stay new.
      llmDecisions = new Map();
    }

    // Apply decisions to the first-pass results.
    return firstPass.map((r) => {
      if (r.decision !== 'ambiguous-new') return r;
      const llm = llmDecisions.get(r.input);
      if (llm === undefined || llm === 'NEW') {
        return { ...r, decision: 'ambiguous-new' as const };
      }
      return {
        ...r,
        resolved: llm,
        decision: 'ambiguous-resolved-existing' as const,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Step 3 — integrateSource
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { renderTopicPage, SECTION_NAMES, type SectionName, type TopicSourceRef } from '../models/topic-page.js';

/**
 * Shape the LLM must return from the integrate-source prompt.
 *
 * Per pre-mortem Risk 4: key-validation is enum-restricted (only
 * known section names accepted; unknown keys dropped silently).
 * `new_change_log_entry` is REQUIRED — an integration that produces
 * no log entry is a malformed response and should fall back.
 */
export interface IntegrateOutput {
  updated_sections: Partial<Record<SectionName, string>>;
  new_change_log_entry: string;
  new_open_questions?: string[];
  new_known_gaps?: string[];
}

/**
 * Parse + validate the LLM's integrate-source JSON response.
 * Returns null when malformed (caller falls back to minimal update path).
 *
 * Invariants enforced (Risk 4 mitigations):
 *  - Section keys restricted to SECTION_NAMES enum
 *  - Section bodies cannot contain raw `---` (would break frontmatter
 *    on next parse)
 *  - Section bodies capped at 8000 chars (prevents LLM echoing the
 *    whole page into one section)
 *  - `new_change_log_entry` required and non-empty
 */
export function parseIntegrateResponse(response: string): IntegrateOutput | null {
  const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const rec = parsed as Record<string, unknown>;

  // new_change_log_entry required + non-empty
  const changeLog = rec.new_change_log_entry;
  if (typeof changeLog !== 'string' || changeLog.trim().length === 0) return null;

  // updated_sections — narrow to the enum
  const rawSections = rec.updated_sections;
  const updated: Partial<Record<SectionName, string>> = {};
  if (rawSections !== null && typeof rawSections === 'object' && !Array.isArray(rawSections)) {
    for (const [key, val] of Object.entries(rawSections as Record<string, unknown>)) {
      if (!(SECTION_NAMES as readonly string[]).includes(key)) continue;
      if (typeof val !== 'string') continue;
      if (val.length > 8000) continue;      // Risk 4: cap size
      if (val.includes('\n---\n') || val.startsWith('---\n') || val.endsWith('\n---')) continue; // no frontmatter injection
      updated[key as SectionName] = val;
    }
  }

  // Optional arrays
  const pickStringArray = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    return out.length > 0 ? out : undefined;
  };

  const result: IntegrateOutput = {
    updated_sections: updated,
    new_change_log_entry: changeLog.trim(),
  };
  const oq = pickStringArray(rec.new_open_questions);
  if (oq !== undefined) result.new_open_questions = oq;
  const kg = pickStringArray(rec.new_known_gaps);
  if (kg !== undefined) result.new_known_gaps = kg;
  return result;
}

/**
 * Content-hash a string for idempotency. Low-level primitive; callers
 * should prefer `hashMeetingSource` for any frontmatter-framed source
 * file (meetings AND slack-digests) so frontmatter edits (attendee
 * adds, status changes, post-processing metadata, dedup markers) don't
 * bust dedup.
 */
export function hashSource(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Hash a topic-source file's body only — excludes frontmatter. Used in
 * `sources_integrated[].hash` so that editing source-file frontmatter
 * does NOT bust topic-page idempotency.
 *
 * Applies to both source classes:
 *  - meetings (`resources/meetings/*.md`): adding an attendee, fixing a
 *    title typo, rewriting the `intelligence` block from re-extraction
 *    leaves the body hash unchanged.
 *  - slack-digests (`resources/notes/{date}-slack-digest.md`): adding
 *    `topics:`, `items_approved`, or sibling-plan dedup metadata to
 *    frontmatter (e.g., `dedup_processed_at`) leaves the body hash
 *    unchanged.
 *
 * Only substantive body changes — the actual transcript, notes, or
 * digest summary — trigger re-integration.
 *
 * For content that isn't a frontmatter-framed file (no `^---\n...\n---`),
 * the raw string is hashed as-is. The function name retains
 * `MeetingSource` for back-compat; consider rename to `hashSourceBody`
 * in a follow-up.
 */
export function hashMeetingSource(content: string): string {
  // Body is everything after the closing `---\n` of the frontmatter block.
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  const body = match !== null ? match[1] : content;
  return hashSource(body);
}

/**
 * Apply an `IntegrateOutput` onto an existing topic page, returning the
 * updated page. Pure: no I/O. Caller does the write.
 */
export function applyIntegrateOutput(
  page: TopicPage,
  output: IntegrateOutput,
  source: TopicSourceRef,
  today: string,
): TopicPage {
  const sections: TopicPage['sections'] = { ...page.sections };

  // Overwrite any sections the LLM updated.
  for (const [name, body] of Object.entries(output.updated_sections)) {
    if (body === undefined) continue;
    sections[name as SectionName] = body;
  }

  // Append change log entry (newest at top for easy scanning).
  const existingLog = sections['Change log'] ?? '';
  const newLogLine = `- ${today}: ${output.new_change_log_entry}`;
  sections['Change log'] = existingLog.length > 0
    ? `${newLogLine}\n${existingLog}`
    : newLogLine;

  // Append open questions / known gaps (dedup against existing lines).
  if (output.new_open_questions !== undefined) {
    const existing = sections['Open questions'] ?? '';
    const existingLines = new Set(
      existing.split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
    );
    const additions = output.new_open_questions
      .map((q) => `- [ ] ${q.replace(/^-\s*\[\s*\]\s*/, '').trim()}`)
      .filter((line) => !existingLines.has(line));
    if (additions.length > 0) {
      sections['Open questions'] = existing.length > 0
        ? `${existing}\n${additions.join('\n')}`
        : additions.join('\n');
    }
  }

  if (output.new_known_gaps !== undefined) {
    const existing = sections['Known gaps'] ?? '';
    const existingLines = new Set(
      existing.split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
    );
    const additions = output.new_known_gaps
      .map((g) => `- ${g.replace(/^-\s*/, '').trim()}`)
      .filter((line) => !existingLines.has(line));
    if (additions.length > 0) {
      sections['Known gaps'] = existing.length > 0
        ? `${existing}\n${additions.join('\n')}`
        : additions.join('\n');
    }
  }

  // Update frontmatter — append source (if not already integrated), bump refresh date.
  const existingHashes = new Set(page.frontmatter.sources_integrated.map((s) => s.hash));
  const sources = existingHashes.has(source.hash)
    ? page.frontmatter.sources_integrated
    : [...page.frontmatter.sources_integrated, source];

  return {
    frontmatter: {
      ...page.frontmatter,
      last_refreshed: today,
      sources_integrated: sources,
    },
    sections,
  };
}

/**
 * Build a fallback page update for the no-LLM / malformed-output case.
 * Records the source in `sources_integrated` and appends a minimal
 * Change log + Source trail entry, but does not synthesize narrative.
 * Keeps the topic page retrievable; next refresh can upgrade it.
 */
export function applyFallbackUpdate(
  page: TopicPage,
  source: TopicSourceRef,
  today: string,
  reason: string,
): TopicPage {
  const sections: TopicPage['sections'] = { ...page.sections };

  const existingLog = sections['Change log'] ?? '';
  const newLogLine = `- ${today}: Source appended (no narrative: ${reason}).`;
  sections['Change log'] = existingLog.length > 0
    ? `${newLogLine}\n${existingLog}`
    : newLogLine;

  const existingTrail = sections['Source trail'] ?? '';
  const trailLine = `- [[${source.path.replace(/^.*\//, '').replace(/\.md$/, '')}]] (${source.date})`;
  if (!existingTrail.includes(trailLine)) {
    sections['Source trail'] = existingTrail.length > 0
      ? `${existingTrail}\n${trailLine}`
      : trailLine;
  }

  const existingHashes = new Set(page.frontmatter.sources_integrated.map((s) => s.hash));
  const sources = existingHashes.has(source.hash)
    ? page.frontmatter.sources_integrated
    : [...page.frontmatter.sources_integrated, source];

  return {
    frontmatter: {
      ...page.frontmatter,
      last_refreshed: today,
      sources_integrated: sources,
    },
    sections,
  };
}

/**
 * Create a stub TopicPage for a freshly-proposed new topic. Empty
 * sections; status=new. Step 3 will populate on first integrateSource.
 */
export function createTopicStub(
  slug: string,
  today: string,
  options: { area?: string; aliases?: string[] } = {},
): TopicPage {
  const frontmatter: TopicPageFrontmatter = {
    topic_slug: slug,
    status: 'new',
    first_seen: today,
    last_refreshed: today,
    sources_integrated: [],
  };
  if (options.area !== undefined) frontmatter.area = options.area;
  if (options.aliases !== undefined && options.aliases.length > 0) {
    frontmatter.aliases = options.aliases;
  }
  return { frontmatter, sections: {} };
}

/**
 * Build the LLM prompt for incremental source integration.
 *
 * Layout:
 *  - Existing page (if any) so the LLM can revise rather than regen
 *  - New source (meeting OR slack-digest content)
 *  - Relevant L2 items (decisions, learnings) — filtered by caller
 *  - Response schema + constraints
 */
export function buildIntegratePrompt(
  topicSlug: string,
  existingPage: TopicPage | null,
  newSource: { path: string; date: string; content: string },
  relevantL2: string,
): string {
  const existingBody = existingPage === null
    ? '(no existing page — this is the first source for this topic)'
    : renderTopicPage(existingPage);

  return `You are maintaining a compiled wiki page for the topic "${topicSlug}". A new source has arrived. Integrate it into the existing page by updating ONLY the sections the new source substantively changes.

EXISTING TOPIC PAGE:
${existingBody}

NEW SOURCE (${newSource.path}, ${newSource.date}):
${newSource.content}

RELEVANT L2 MEMORY (prior decisions and learnings):
${relevantL2 || '(none)'}

Return ONLY a JSON object with this exact shape (no markdown fences, no prose):

{
  "updated_sections": {
    "Current state"?: "string — rewrite only if status changed",
    "Why/background"?: "string — rewrite only if the rationale evolved",
    "Scope and behavior"?: "string — rewrite only if scope changed",
    "Rollout/timeline"?: "string — rewrite only if timeline shifted",
    "Relationships"?: "string — rewrite only if new cross-references"
  },
  "new_change_log_entry": "string — one-line summary of what this source contributed (REQUIRED)",
  "new_open_questions"?: ["string — new questions raised by this source (if any)"],
  "new_known_gaps"?: ["string — new gaps identified (if any)"]
}

Constraints:
- Omit section keys that don't change. Do not re-emit unchanged content.
- Never include '---' inside a section body — it would break the frontmatter.
- Each section body must be under 8000 characters.
- Prefer terse synthesis over copying source text verbatim.
- Use Obsidian-style wikilinks [[slug]] to reference related topics or people.`;
}

/**
 * LLM call signature for the integration path (wiki-repair T5, added
 * after two live wedges where a single stuck HTTP call froze a
 * `topic refresh --all` run for 15+ minutes with no timeout).
 *
 * Extends the plain `LLMCallFn` with an optional AbortSignal so the
 * per-call timeout can actually cancel the underlying HTTP request —
 * `AIService.call` forwards `options.signal` to pi-ai's
 * `completeSimple`. Plain `(prompt) => Promise<string>` implementations
 * remain assignable; for those the timeout still fails the call forward,
 * it just can't cancel the in-flight socket.
 */
export type IntegrationLLMCallFn = (
  prompt: string,
  options?: { signal?: AbortSignal },
) => Promise<string>;

/**
 * Default per-call LLM timeout for the integration path. Deliberately
 * generous — integration synthesis calls are legitimately slow (long
 * topic pages + transcripts); the timeout exists to catch WEDGED
 * sockets (ESTABLISHED, no data), not slow-but-live calls. Override
 * via `llmTimeoutMs` or the `ARETE_LLM_TIMEOUT_MS` env var.
 */
export const DEFAULT_INTEGRATION_LLM_TIMEOUT_MS = 120_000;

/** Resolve the effective integration LLM timeout (explicit > env > default). */
export function resolveIntegrationLlmTimeoutMs(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const env = process.env.ARETE_LLM_TIMEOUT_MS;
  if (env !== undefined && env.trim().length > 0) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_INTEGRATION_LLM_TIMEOUT_MS;
}

/**
 * Run one integration LLM call with a per-call timeout and ONE retry
 * (timeout-only — non-timeout errors propagate immediately so the
 * caller's existing fallback handling stays in charge).
 *
 * On timeout the AbortController is aborted (cancels the HTTP request
 * for signal-aware callers) and a warn is emitted (W5 pattern: visible,
 * never vanishes). A second timeout throws, which `integrateSource`
 * converts into a fallback update — the run FAILS FORWARD instead of
 * freezing.
 */
async function callLLMWithTimeout(
  callLLM: IntegrationLLMCallFn,
  prompt: string,
  timeoutMs: number,
  onWarn: (msg: string) => void = (m) => console.warn(m),
): Promise<string> {
  const attempts = 2; // initial call + ONE retry
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await new Promise<string>((resolvePromise, rejectPromise) => {
        timer = setTimeout(() => {
          // Reject FIRST (deterministic winner of the race), then abort
          // so a signal-aware transport tears down the wedged socket.
          rejectPromise(
            new Error(
              `LLM call timed out after ${timeoutMs}ms (attempt ${attempt}/${attempts})`,
            ),
          );
          controller.abort();
        }, timeoutMs);
        callLLM(prompt, { signal: controller.signal }).then(resolvePromise, rejectPromise);
      });
    } catch (err) {
      const timedOut = controller.signal.aborted;
      if (timedOut && attempt < attempts) {
        onWarn(
          `[topic-memory] integration LLM call timed out after ${timeoutMs}ms — retrying once`,
        );
        continue;
      }
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error('callLLMWithTimeout: exhausted attempts');
}

export interface IntegrateSourceOptions {
  callLLM?: IntegrationLLMCallFn;
  relevantL2?: string;
  /**
   * Per-call LLM timeout override (ms) for this integration. Defaults
   * to `ARETE_LLM_TIMEOUT_MS` env or
   * `DEFAULT_INTEGRATION_LLM_TIMEOUT_MS`.
   */
  llmTimeoutMs?: number;
  today: string;           // YYYY-MM-DD — injected for determinism
  /**
   * Optional override of the content fed to the LLM prompt. When set,
   * the LLM sees this string instead of `newSource.content`.
   *
   * Used by Phase 1 §c (wiki expansion): when a per-meeting summary
   * exists at `.arete/memory/summaries/meetings/<date>-<slug>.md`,
   * the caller passes the summary body here so the LLM synthesizes
   * against curated input instead of the raw transcript.
   *
   * The idempotency hash is STILL computed against `newSource.content`
   * (the source body) so summary-vs-transcript swap doesn't bust dedup
   * on the topic page's `sources_integrated[].hash`. This keeps the
   * "did we already integrate this source?" check stable across the
   * Phase 1 backfill window where some meetings have summaries and
   * others don't.
   */
  llmContent?: string;
}

export interface IntegrateResult {
  page: TopicPage;
  decision: 'integrated' | 'fallback' | 'skipped-already-integrated';
  reason?: string;          // when fallback, why
}

// Extend the service class with integrateSource.
// NOTE: TypeScript doesn't support "reopening" a class literally like this;
// we attach the method via declaration merging below. See service file.
declare module './topic-memory.js' {
  interface TopicMemoryService {
    integrateSource(
      topicSlug: string,
      existingPage: TopicPage | null,
      newSource: { path: string; date: string; content: string },
      options: IntegrateSourceOptions,
    ): Promise<IntegrateResult>;
  }
}

// ---------------------------------------------------------------------------
// Step 6 review — batch refresh used by BOTH `arete topic refresh --all` and
// `arete memory refresh`. Single path avoids duplicate source-discovery
// loops (meetings + slack-digests) and silent-staleness gap where
// `memory refresh` didn't touch topics.
// ---------------------------------------------------------------------------

export interface RefreshBatchOptions {
  callLLM?: IntegrationLLMCallFn;
  /**
   * Per-call LLM timeout override (ms), threaded into each
   * `integrateSource` call. See `IntegrateSourceOptions.llmTimeoutMs`.
   */
  llmTimeoutMs?: number;
  dryRun?: boolean;
  today: string;
  /** Only refresh these slugs; omit for all existing topics. */
  slugs?: string[];
  /**
   * When set, scope source discovery to a single file. The
   * `discoverTopicSources` output is filtered to entries where
   * `entry.path === sourcePath` (exact equality, after both sides are
   * resolved to absolute paths) BEFORE the per-slug source filter
   * runs. Used by the slack-digest skill (Hook 2) to integrate ONLY
   * the just-written digest, not every prior digest tagged with the
   * same slugs.
   *
   * **Must be an absolute path.** If a relative path is passed,
   * `refreshAllFromSources` resolves it against `paths.root` before
   * matching. Path normalization is the caller's responsibility — the
   * service rejects ambiguous suffix matches by design (cost-correct).
   *
   * Pre-mortem Risk 4 / memory bullet 5: this is a behavioral filter,
   * NOT a label-only logging hint. Without it, a workspace with N
   * prior digests tagged `cover-whale-templates` runs N× the user's
   * expected cost.
   */
  sourcePath?: string;
  /**
   * When true, skip acquiring the `.arete/.seed.lock`. Use only when
   * the caller already holds the lock (e.g., `arete topic seed`
   * acquires at the CLI boundary and threads `skipLock: true` so
   * it doesn't double-acquire and EEXIST against itself).
   *
   * Default false — `arete memory refresh` and `arete topic refresh`
   * acquire the lock so concurrent runs (cron + interactive shell)
   * cannot race on topic-page writes.
   */
  skipLock?: boolean;
  /**
   * Workspace root — used to locate `.arete/` for the lock file when
   * `skipLock !== true`. Required unless `skipLock: true`.
   */
  workspaceRoot?: string;
  /**
   * Short label written into the lock file for user-facing diagnosis.
   * Default 'topic refresh'.
   */
  lockLabel?: string;
  /**
   * Per-topic progress callback (wiki-repair W5). Called once per target
   * slug BEFORE that topic's sources are processed, with 1-based `index`
   * and the total target count. `arete topic refresh --all` uses this to
   * print "page N/M <slug>" as the batch walks — 18 silent minutes is
   * indistinguishable from a hang otherwise. Errors thrown by the
   * callback are swallowed.
   */
  onProgress?: (info: { index: number; total: number; slug: string }) => void;
}

export interface RefreshBatchTopicResult {
  slug: string;
  integrated: number;
  fallback: number;
  skipped: number;
  status: 'ok' | 'no-sources';
}

export interface RefreshBatchResult {
  topics: RefreshBatchTopicResult[];
  totalIntegrated: number;
  totalFallback: number;
  totalSkipped: number;
}

declare module './topic-memory.js' {
  interface TopicMemoryService {
    refreshAllFromSources(
      paths: import('../models/workspace.js').WorkspacePaths,
      options: RefreshBatchOptions,
    ): Promise<RefreshBatchResult>;
  }
}

import { join as pathJoin, basename as pathBasename, isAbsolute as pathIsAbsolute, resolve as pathResolve } from 'node:path';
import { parseMeetingFile as parseMeetingFileExternal } from './meeting-context.js';
import { renderTopicPage as renderTopicPageExternal } from '../models/topic-page.js';
import { summaryPathForMeeting } from './summary-writer.js';
import { parseSourceSummary, MEETING_SECTION_NAMES } from '../models/source-summary.js';

/**
 * Load the body of a per-meeting summary file (Phase 1 §c). Returns
 * null when no summary exists, parsing fails, or the parsed file is
 * not a meeting summary. Used by `refreshAllFromSources` to swap
 * curated summary content for raw transcript at LLM time, while
 * keeping the source-body hash stable for idempotency.
 *
 * The body returned is a concatenation of recognized sections in
 * canonical order — the same shape `renderSourceSummary` produces but
 * without the frontmatter and outer title.
 */
async function loadMeetingSummaryBody(
  workspaceRoot: string,
  storage: StorageAdapter,
  meetingPath: string,
  date: string,
): Promise<string | null> {
  // Build summary path. The meetingPath we get here is workspace-
  // relative or absolute; summaryPathForMeeting handles both.
  const summaryPath = summaryPathForMeeting(workspaceRoot, {
    sourcePath: meetingPath,
    date,
  });
  const content = await storage.read(summaryPath);
  if (content === null) return null;
  const parsed = parseSourceSummary(content);
  if (parsed === null || parsed.frontmatter.source_type !== 'meeting') return null;

  const lines: string[] = [];
  for (const name of MEETING_SECTION_NAMES) {
    const body = (parsed.sections as Record<string, string | undefined>)[name];
    if (body === undefined || body.trim().length === 0) continue;
    lines.push(`## ${name}`);
    lines.push('');
    lines.push(body.trim());
    lines.push('');
  }
  const out = lines.join('\n').trim();
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Step 2 (slack-digest-topic-wiki) — source discovery
//
// `discoverTopicSources` widens the source-discovery loop that previously
// only scanned `resources/meetings/`. It now also picks up
// `resources/notes/{date}-slack-digest.md` files, parses both shapes via
// the existing `parseMeetingFile` (pre-mortem Risk 2 verified empirically:
// `parseMeetingFile` tolerates missing `attendees` and reads `topics`
// directly, so a slack-digest parses cleanly without a second parser).
//
// `type` on `SourceDiscoveryEntry` is set by the discovery function based
// on which directory the file came from — NOT by parsing — so the parser
// stays shape-agnostic.
// ---------------------------------------------------------------------------

/**
 * Source-of-truth filter for slack-digest files in `resources/notes/`.
 * Filename pattern: `YYYY-MM-DD-slack-digest.md`. Files not matching this
 * pattern are ignored (they may be other kinds of notes — capture-conversation
 * outputs, manual notes, etc., none of which contribute to topic narratives).
 *
 * Example matches:
 *  - `2026-04-28-slack-digest.md` → MATCH
 *  - `2026-04-28-capture-acme-call.md` → no match (not a digest)
 *  - `slack-digest-2026-04-28.md` → no match (date prefix is required)
 */
export const SLACK_DIGEST_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-slack-digest\.md$/;

/**
 * Internal type produced by `discoverTopicSources`. Both source classes
 * (meetings + slack-digests) flatten into this shape so
 * `refreshAllFromSources`'s integration loop is source-agnostic.
 */
export interface SourceDiscoveryEntry {
  /** Absolute or workspace-relative path the storage adapter understands. */
  path: string;
  /** YYYY-MM-DD parsed from the filename's `^(\d{4}-\d{2}-\d{2})` prefix. */
  date: string;
  /** Full file content (read once during discovery). */
  content: string;
  /**
   * The source class. Set by which directory the file lives in (NOT by
   * frontmatter parsing): `'meeting'` for files under `resources/meetings/`,
   * `'slack-digest'` for files under `resources/notes/` whose filename
   * matches `SLACK_DIGEST_FILENAME_RE`. The downstream integration path
   * does NOT branch on this field today (both classes share the same
   * `integrateSource` LLM prompt and `hashMeetingSource` content hash) —
   * it exists for telemetry, logging, and any future class-specific
   * routing (e.g., per-class cost accounting).
   */
  type: 'meeting' | 'slack-digest';
  /** Slugs read from frontmatter `topics:` via `parseMeetingFile`. */
  topics: string[];
}

/**
 * Scan both topic-source classes and return parseable entries sorted by
 * `date` ascending (ties broken by `path` ascending, for determinism).
 * The two classes are:
 *  - **meetings**: every `*.md` under `resources/meetings/` whose filename
 *    starts with a `YYYY-MM-DD` prefix.
 *  - **slack-digests**: every `*.md` under `resources/notes/` whose filename
 *    matches `SLACK_DIGEST_FILENAME_RE` (`YYYY-MM-DD-slack-digest.md`).
 *
 * Both classes flatten into the same `SourceDiscoveryEntry` shape so
 * `refreshAllFromSources` can iterate them uniformly. Single-pass discovery
 * is shared by `arete topic refresh --all` and `arete memory refresh` to
 * avoid duplicate FS walks.
 *
 * Tolerant by design:
 *  - Missing `meetings/` dir → no meeting entries (no throw).
 *  - Missing `notes/` dir → no slack-digest entries (no throw).
 *  - Files that fail filename pattern, parse, or read → skipped silently
 *    (warn-and-continue is reserved for the belt-and-suspenders frontmatter
 *    `type:` check below; parser failures are common-enough that warning
 *    spam isn't useful).
 *  - A file in `notes/` whose frontmatter `type:` is set but is NOT
 *    `slack-digest` emits one warn line and is skipped (sanity check;
 *    primary filter remains the filename regex).
 */
export async function discoverTopicSources(
  paths: WorkspacePaths,
  storage: StorageAdapter,
): Promise<SourceDiscoveryEntry[]> {
  const entries: SourceDiscoveryEntry[] = [];

  const meetingsDir = pathJoin(paths.resources, 'meetings');
  if (await storage.exists(meetingsDir)) {
    const meetingFiles = await storage.list(meetingsDir, { extensions: ['.md'] });
    for (const filePath of meetingFiles) {
      const fileName = pathBasename(filePath);
      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const content = await storage.read(filePath);
      if (content === null) continue;
      const parsed = parseMeetingFileExternal(content);
      if (!parsed) continue;
      entries.push({
        path: filePath,
        date: dateMatch[1],
        content,
        type: 'meeting',
        topics: Array.isArray(parsed.frontmatter.topics) ? parsed.frontmatter.topics : [],
      });
    }
  }

  const notesDir = pathJoin(paths.resources, 'notes');
  if (await storage.exists(notesDir)) {
    const noteFiles = await storage.list(notesDir, { extensions: ['.md'] });
    for (const filePath of noteFiles) {
      const fileName = pathBasename(filePath);
      // Filename pattern is the source-of-truth filter; non-matching notes
      // are ignored (capture-conversation outputs, manual notes, etc.).
      if (!SLACK_DIGEST_FILENAME_RE.test(fileName)) continue;
      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const content = await storage.read(filePath);
      if (content === null) continue;
      const parsed = parseMeetingFileExternal(content);
      if (!parsed) continue;
      // Belt-and-suspenders: if frontmatter declares a `type:` field that
      // is not `slack-digest`, warn and skip. We only check when the field
      // is present — older digests pre-date the convention and may omit it.
      // `parseMeetingFile` does not surface `type` on its typed result, so
      // re-read it from the raw content via a simple frontmatter scan.
      const fmTypeMatch = content.match(/^---[\s\S]*?\n\s*type:\s*([^\s\n#]+)/);
      if (fmTypeMatch && fmTypeMatch[1].trim().replace(/^["']|["']$/g, '') !== 'slack-digest') {
        // Use console.warn directly — discovery has no logger DI surface
        // and adding one for this single warning is overkill. Tests can
        // capture stderr via process.stderr if they need to assert this.
        // eslint-disable-next-line no-console
        console.warn(
          `[discoverTopicSources] skipping ${filePath}: filename matches slack-digest pattern but frontmatter type is "${fmTypeMatch[1]}"`,
        );
        continue;
      }
      entries.push({
        path: filePath,
        date: dateMatch[1],
        content,
        type: 'slack-digest',
        topics: Array.isArray(parsed.frontmatter.topics) ? parsed.frontmatter.topics : [],
      });
    }
  }

  // Deterministic order: by date asc, then path asc.
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.path.localeCompare(b.path);
  });
  return entries;
}

TopicMemoryService.prototype.refreshAllFromSources = async function (
  this: TopicMemoryService,
  paths,
  options,
): Promise<RefreshBatchResult> {
  // Acquire the seed lock unless the caller already holds it (seed does).
  // Prevents concurrent `arete memory refresh` runs (cron + interactive)
  // from racing on topic-page writes.
  let releaseLock: (() => Promise<void>) | undefined;
  if (!options.skipLock && !options.dryRun) {
    const { acquireSeedLock } = await import('./seed-lock.js');
    const areteDir = options.workspaceRoot !== undefined
      ? pathJoin(options.workspaceRoot, '.arete')
      : pathJoin(paths.memory, '..');
    releaseLock = await acquireSeedLock(areteDir, options.lockLabel ?? 'topic refresh');
  }

  try {

  const { topics: existing } = await this.listAll(paths);
  const existingBySlug = new Map<string, TopicPage>(
    existing.map((t) => [t.frontmatter.topic_slug, t]),
  );

  const targetSlugs =
    options.slugs !== undefined
      ? options.slugs
      : existing.map((t) => t.frontmatter.topic_slug);

  // Gather all topic-source files once (meetings + slack-digests) — shared
  // across all targets. `discoverTopicSources` returns entries sorted by
  // date asc, so per-target filtering preserves chronological order
  // without re-sorting.
  // Accessing private storage through `(this as any)` avoids needing a public
  // accessor for this internal batch operation.
  const storage = (this as unknown as { storage: StorageAdapter }).storage;
  const discovered = await discoverTopicSources(paths, storage);
  // `--source <path>` scopes discovery to a single file BEFORE the per-
  // slug filter runs. Mirrors the skill's "integrate just the digest I
  // just wrote" semantics. Match is **exact-equality only** on absolute
  // paths — fuzzy `endsWith` matching was a footgun for programmatic
  // callers (a bare filename like `slack-digest.md` would match every
  // digest in the workspace, defeating cost-correctness). The CLI
  // already passes absolute paths via `path.resolve(cwd, arg)`; if a
  // caller passes a relative `sourcePath`, we resolve it here against
  // `paths.root` so the equality check is well-defined.
  let resolvedSourcePath: string | undefined;
  if (options.sourcePath !== undefined) {
    resolvedSourcePath = pathIsAbsolute(options.sourcePath)
      ? options.sourcePath
      : pathResolve(paths.root, options.sourcePath);
  }
  const allSources =
    resolvedSourcePath !== undefined
      ? discovered.filter((src) => src.path === resolvedSourcePath)
      : discovered;

  const perTopic: RefreshBatchTopicResult[] = [];

  // Single writer-of-record for `ingest` log events (wiki-repair W5).
  // Constructed lazily-cheap here; append failures warn, never vanish.
  const { MemoryLogService } = await import('./memory-log.js');
  const memoryLog = new MemoryLogService(storage);

  let progressIndex = 0;
  for (const targetSlug of targetSlugs) {
    progressIndex += 1;
    try {
      options.onProgress?.({ index: progressIndex, total: targetSlugs.length, slug: targetSlug });
    } catch {
      // Progress reporting never blocks the batch.
    }
    let page: TopicPage | null = existingBySlug.get(targetSlug) ?? null;
    let integrated = 0;
    let fallback = 0;
    let skipped = 0;

    const matching: Array<{
      path: string;
      date: string;
      content: string;
      type: 'meeting' | 'slack-digest';
    }> = [];
    // AC2 (phase-3-5-followup-5) — alias-aware integration filter.
    //
    // Pre-AC2: only sources tagged with the canonical `targetSlug`
    // integrated; sources tagged with an alias (e.g.,
    // `default-email-template` while canonical is `email-templates`)
    // were orphaned forever, even after a user added `aliases:` to the
    // topic page.
    //
    // Post-AC2: a source integrates when ANY of its `topics:` matches
    // the canonical slug OR one of the topic page's declared aliases.
    // `page` is undefined when the target slug is a newly-discovered
    // slug-only target (no page yet) — in that case `aliases ?? []` is
    // empty, so the filter degrades to the canonical-only check (the
    // exact pre-AC2 behavior). Nil-safe by construction.
    const aliasSet = new Set<string>([
      targetSlug,
      ...(page?.frontmatter.aliases ?? []),
    ]);
    for (const src of allSources) {
      if (!src.topics.some((t) => aliasSet.has(t))) continue;
      matching.push({ path: src.path, date: src.date, content: src.content, type: src.type });
    }
    // `allSources` is already sorted by date asc; the filter preserves
    // that order, so no re-sort needed.

    if (matching.length === 0) {
      perTopic.push({ slug: targetSlug, integrated: 0, fallback: 0, skipped: 0, status: 'no-sources' });
      continue;
    }

    if (options.dryRun) {
      for (const src of matching) {
        const srcHash = hashMeetingSource(src.content);
        const already = page?.frontmatter.sources_integrated.some((s) => s.hash === srcHash) ?? false;
        if (already) skipped++;
        else integrated++;
      }
      perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
      continue;
    }

    for (const src of matching) {
      // Phase 1 §c: when the source is a meeting AND a per-meeting
      // summary exists at `.arete/memory/summaries/meetings/<date>-
      // <slug>.md`, feed the summary body to the integration LLM
      // instead of the raw transcript. Curated input → better synthesis,
      // ≥30% input-token reduction on a typical day (see AC1.4).
      //
      // Idempotency hash STILL uses the source body (transcript) — that
      // way reprocessing-with-summary doesn't bust dedup, and the
      // backfill window (some meetings have summaries, some don't)
      // works without thrashing the topic page's
      // `sources_integrated[].hash` field.
      let llmContent: string | undefined;
      if (src.type === 'meeting') {
        try {
          const summaryBody = await loadMeetingSummaryBody(
            paths.root,
            storage,
            src.path,
            src.date,
          );
          if (summaryBody !== null) llmContent = summaryBody;
        } catch {
          // Defensive: any read/parse failure → silent fall back to
          // transcript. Logging here would spam during the backfill
          // window where many meetings legitimately don't have
          // summaries yet.
        }
      }

      const result = await this.integrateSource(
        targetSlug,
        page,
        src,
        {
          today: options.today,
          callLLM: options.callLLM,
          llmTimeoutMs: options.llmTimeoutMs,
          llmContent,
        },
      );
      if (result.decision === 'integrated') integrated++;
      else if (result.decision === 'fallback') fallback++;
      else if (result.decision === 'skipped-already-integrated') skipped++;
      page = result.page;

      // wiki-repair W5 / AC2: one `ingest` log event per integrated
      // source, carrying what was actually fed to the LLM —
      // `input_kind: summary | transcript` + input char count. Makes
      // the summary-first token reduction measurable instead of
      // asserted. Skips emit nothing (no input was consumed).
      if (result.decision === 'integrated' || result.decision === 'fallback') {
        const inputBody = llmContent ?? src.content;
        try {
          await memoryLog.append(paths, {
            event: 'ingest',
            fields: {
              topic: targetSlug,
              source: pathBasename(src.path),
              source_type: src.type,
              input_kind: llmContent !== undefined ? 'summary' : 'transcript',
              input_chars: String(inputBody.length),
              result: result.decision,
            },
          });
        } catch (err) {
          // W5 lossy-logger rule: log-append failures warn, never vanish.
          console.warn(
            `[topic-memory] ingest log event failed for ${targetSlug} ← ${pathBasename(src.path)}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    // Write the final page
    if (page !== null) {
      const outPath = pathJoin(paths.memory, 'topics', `${targetSlug}.md`);
      await storage.mkdir(pathJoin(paths.memory, 'topics'));
      if (storage.writeIfChanged !== undefined) {
        await storage.writeIfChanged(outPath, renderTopicPageExternal(page));
      } else {
        await storage.write(outPath, renderTopicPageExternal(page));
      }
    }

    perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
  }

  return {
    topics: perTopic,
    totalIntegrated: perTopic.reduce((s, t) => s + t.integrated, 0),
    totalFallback: perTopic.reduce((s, t) => s + t.fallback, 0),
    totalSkipped: perTopic.reduce((s, t) => s + t.skipped, 0),
  };
  } finally {
    if (releaseLock !== undefined) {
      await releaseLock();
    }
  }
};

/**
 * Cost estimate helper — rough Haiku cost per (topic, source) integration,
 * where `source` is a meeting or slack-digest. Used by CLI for `--dry-run`
 * and `--confirm` prompts.
 */
export const ESTIMATED_USD_PER_INTEGRATION = 0.015;

/**
 * Per-topic health signal surfaced by `arete status`. Mirrors the
 * `AreaMemoryService.listAreaMemoryStatus` shape so the CLI can apply
 * uniform formatting across areas and topics.
 *
 * - `stale`: `last_refreshed` older than staleDays (default 60)
 * - `stub`: Current state section missing or empty (topic page exists
 *   but narrative was never populated)
 * - `orphan`: zero inbound `[[slug]]` references from any other topic
 */
export interface TopicMemoryStatus {
  slug: string;
  lastRefreshed: string;
  daysOld: number;
  stale: boolean;
  stub: boolean;
  orphan: boolean;
}

export interface ListTopicMemoryStatusOptions {
  /** Days since last_refreshed that marks a topic stale. Default 60. */
  staleDays?: number;
  /** Reference date for staleness calc. Default `new Date()`. */
  today?: Date;
}

declare module './topic-memory.js' {
  interface TopicMemoryService {
    listTopicMemoryStatus(
      paths: import('../models/workspace.js').WorkspacePaths,
      options?: ListTopicMemoryStatusOptions,
    ): Promise<TopicMemoryStatus[]>;
  }
}

TopicMemoryService.prototype.listTopicMemoryStatus = async function (
  this: TopicMemoryService,
  paths,
  options = {},
): Promise<TopicMemoryStatus[]> {
  const staleDays = options.staleDays ?? 60;
  const today = options.today ?? new Date();

  const { topics } = await this.listAll(paths);

  // Inbound ref count map
  const inboundRefs = new Map<string, number>();
  const refRe = /\[\[([a-z0-9-]+)\]\]/g;
  for (const t of topics) {
    const body = Object.values(t.sections).join('\n');
    const ownSlug = t.frontmatter.topic_slug;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(body)) !== null) {
      if (m[1] === ownSlug) continue; // self-refs don't count for orphan detection
      inboundRefs.set(m[1], (inboundRefs.get(m[1]) ?? 0) + 1);
    }
  }

  const out: TopicMemoryStatus[] = [];
  for (const t of topics) {
    const slug = t.frontmatter.topic_slug;
    const lastRefreshed = t.frontmatter.last_refreshed;
    const refreshedDate = new Date(lastRefreshed);
    const daysOld = Number.isNaN(refreshedDate.getTime())
      ? Infinity
      : Math.floor((today.getTime() - refreshedDate.getTime()) / (1000 * 60 * 60 * 24));
    const stale = daysOld > staleDays;
    const current = t.sections['Current state'];
    const stub = current === undefined || current.trim().length === 0;
    const orphan = (inboundRefs.get(slug) ?? 0) === 0;
    out.push({ slug, lastRefreshed, daysOld, stale, stub, orphan });
  }
  return out;
};

export function estimateRefreshCostUsd(totalIntegrations: number): number {
  return totalIntegrations * ESTIMATED_USD_PER_INTEGRATION;
}

TopicMemoryService.prototype.integrateSource = async function (
  this: TopicMemoryService,
  topicSlug: string,
  existingPage: TopicPage | null,
  newSource: { path: string; date: string; content: string },
  options: IntegrateSourceOptions,
): Promise<IntegrateResult> {
  const today = options.today;
  const sourceHash = hashMeetingSource(newSource.content);
  const sourceRef: TopicSourceRef = {
    path: newSource.path,
    date: newSource.date,
    hash: sourceHash,
  };

  // Idempotency: if source already integrated, no-op.
  if (existingPage !== null) {
    const already = existingPage.frontmatter.sources_integrated.some(
      (s) => s.hash === sourceHash,
    );
    if (already) {
      return {
        page: existingPage,
        decision: 'skipped-already-integrated',
      };
    }
  }

  // Start from existing or create stub.
  const startPage =
    existingPage ??
    createTopicStub(topicSlug, today);

  if (options.callLLM === undefined) {
    return {
      page: applyFallbackUpdate(startPage, sourceRef, today, 'callLLM not provided'),
      decision: 'fallback',
      reason: 'no-llm',
    };
  }

  // Phase 1 §c: when llmContent is provided (summary body), feed that
  // to the LLM instead of newSource.content (transcript). Hash above
  // STILL uses newSource.content so idempotency stays anchored on the
  // source body, not the summary body — this prevents thrash during
  // the backfill window and lets a summary-rewrite trigger
  // re-integration only when the underlying transcript actually
  // changes.
  const llmSource = options.llmContent !== undefined
    ? { ...newSource, content: options.llmContent }
    : newSource;
  const prompt = buildIntegratePrompt(
    topicSlug,
    existingPage,
    llmSource,
    options.relevantL2 ?? '',
  );

  // Per-call timeout + ONE retry (wiki-repair T5): a wedged HTTP call
  // fails forward into the fallback path below instead of freezing the
  // whole refresh run (two live wedges: 6/08 — which created the stale
  // seed lock — and 6/09, an 18-minute silent hang).
  let response: string;
  try {
    response = await callLLMWithTimeout(
      options.callLLM,
      prompt,
      resolveIntegrationLlmTimeoutMs(options.llmTimeoutMs),
    );
  } catch (err) {
    return {
      page: applyFallbackUpdate(
        startPage,
        sourceRef,
        today,
        `LLM threw: ${err instanceof Error ? err.message : 'unknown'}`,
      ),
      decision: 'fallback',
      reason: 'llm-error',
    };
  }

  const output = parseIntegrateResponse(response);
  if (output === null) {
    return {
      page: applyFallbackUpdate(startPage, sourceRef, today, 'malformed LLM response'),
      decision: 'fallback',
      reason: 'malformed-output',
    };
  }

  return {
    page: applyIntegrateOutput(startPage, output, sourceRef, today),
    decision: 'integrated',
  };
};


// ---------------------------------------------------------------------------
// Step 7 — retrieveRelevant (topic_page_retrieval pattern)
// ---------------------------------------------------------------------------

export interface RetrieveRelevantOptions {
  /** Limit top-k results returned after re-ranking. Default 3. */
  limit?: number;
  /** Optional area bias — matching topics get +0.1 rank bonus. */
  area?: string;
  /** Word budget for `bodyForContext` per topic. Default 1000. */
  budgetWords?: number;
}

export interface TopicPageContext {
  slug: string;
  frontmatter: TopicPageFrontmatter;
  bodyForContext: string;
  score: number;
}

/**
 * Result envelope for `retrieveRelevant`. Distinguishes genuine empty
 * results from degraded capability (no search provider available), so
 * callers can decide whether to fall back to atomic L2 search or warn.
 */
export interface RetrieveRelevantResult {
  results: TopicPageContext[];
  /**
   * Which search backend produced these results:
   *  - 'qmd'      — semantic search via qmd CLI
   *  - 'fallback' — token-based search (no embeddings)
   *  - 'none'     — no search provider configured; results is always []
   */
  searchBackend: 'qmd' | 'fallback' | 'none';
}

const TOPIC_PATH_PREFIX = '.arete/memory/topics/';
const DEFAULT_RETRIEVAL_LIMIT = 3;
const DEFAULT_BUDGET_WORDS = 1000;

// qmd ignores the `paths` option in SearchOptions and returns candidates
// from the entire indexed workspace. To compensate we over-fetch by this
// multiplier and post-filter by path prefix. Fallback DOES honor paths so
// the over-fetch is only wasteful (not needed), but cheap.
const QMD_OVERFETCH_MULTIPLIER = 10;
const FALLBACK_OVERFETCH_MULTIPLIER = 3;

const RECENCY_BONUS_30D = 0.2;
const RECENCY_BONUS_90D = 0.1;
const AREA_MATCH_BONUS = 0.1;
const QMD_SCORE_WEIGHT = 0.6;

function daysBetween(a: string, b: Date): number {
  const d = new Date(a);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((b.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Classify a provider name as one of the three known backends.
 * Unknown provider names bucket as 'fallback' (conservative — they at
 * least implement the SearchProvider interface).
 */
function classifyBackend(name: string): 'qmd' | 'fallback' {
  return name === 'qmd' ? 'qmd' : 'fallback';
}

declare module './topic-memory.js' {
  interface TopicMemoryService {
    retrieveRelevant(
      query: string,
      options?: RetrieveRelevantOptions,
    ): Promise<RetrieveRelevantResult>;
  }
}

TopicMemoryService.prototype.retrieveRelevant = async function (
  this: TopicMemoryService,
  query: string,
  options: RetrieveRelevantOptions = {},
): Promise<RetrieveRelevantResult> {
  const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const budgetWords = options.budgetWords ?? DEFAULT_BUDGET_WORDS;

  const self = this as unknown as {
    searchProvider?: SearchProvider;
    storage: StorageAdapter;
  };
  const searchProvider = self.searchProvider;
  if (searchProvider === undefined) {
    return { results: [], searchBackend: 'none' };
  }

  const backend = classifyBackend(searchProvider.name);
  const overfetchMult = backend === 'qmd' ? QMD_OVERFETCH_MULTIPLIER : FALLBACK_OVERFETCH_MULTIPLIER;

  const rawCandidates = await searchProvider.semanticSearch(query, {
    paths: [TOPIC_PATH_PREFIX],
    limit: limit * overfetchMult,
  });

  if (rawCandidates.length === 0) {
    return { results: [], searchBackend: backend };
  }

  // Post-filter by path prefix — qmd ignores `paths` (see qmd.ts),
  // so we must filter here. Paths from qmd are workspace-relative; we
  // accept both `.arete/memory/topics/foo.md` and an absolute-path
  // variant for safety.
  const candidatePaths = rawCandidates
    .filter((c) => {
      const normalized = c.path.replace(/\\/g, '/');
      return (
        normalized.includes('/.arete/memory/topics/') ||
        normalized.startsWith('.arete/memory/topics/') ||
        normalized.startsWith(TOPIC_PATH_PREFIX)
      );
    })
    .map((c) => ({ path: c.path, score: c.score }));

  if (candidatePaths.length === 0) {
    return { results: [], searchBackend: backend };
  }

  // Re-read full file content from disk — `c.content` from qmd is a
  // snippet (excerpt with line markers), not the full document, so
  // `parseTopicPage` fails on it. Reading from storage guarantees we
  // parse the whole frontmatter + sections.
  const now = new Date();
  const ranked: Array<{ page: TopicPage; score: number }> = [];

  for (const c of candidatePaths) {
    const content = await self.storage.read(c.path);
    if (content === null) continue;
    const page = parseTopicPage(content);
    if (page === null) continue;

    let score = c.score * QMD_SCORE_WEIGHT;

    const daysOld = daysBetween(page.frontmatter.last_refreshed, now);
    if (daysOld <= 30) score += RECENCY_BONUS_30D;
    else if (daysOld <= 90) score += RECENCY_BONUS_90D;

    if (
      options.area !== undefined &&
      page.frontmatter.area === options.area
    ) {
      score += AREA_MATCH_BONUS;
    }

    ranked.push({ page, score });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // Tiebreak for equal scores: prefer fresher `last_refreshed` so
    // "when relevance is indistinguishable, prefer more recent" —
    // better skill UX than alphabetical. Slug-asc tiebreak of tiebreak
    // keeps output fully deterministic.
    const aDate = a.page.frontmatter.last_refreshed;
    const bDate = b.page.frontmatter.last_refreshed;
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    const aSlug = a.page.frontmatter.topic_slug;
    const bSlug = b.page.frontmatter.topic_slug;
    return aSlug < bSlug ? -1 : aSlug > bSlug ? 1 : 0;
  });

  const topK = ranked.slice(0, limit);

  return {
    results: topK.map(({ page, score }) => ({
      slug: page.frontmatter.topic_slug,
      frontmatter: page.frontmatter,
      bodyForContext: selectSectionsForBudget(page, budgetWords),
      score,
    })),
    searchBackend: backend,
  };
};

// ---------------------------------------------------------------------------
// addAliases (I-5) — no-LLM frontmatter writer for topic-page aliases
// ---------------------------------------------------------------------------

export interface AddAliasesResult {
  /** The canonical topic slug whose page was edited. */
  slug: string;
  /** The full, deduped+sorted alias set after the write. */
  aliases: string[];
  /** Aliases that were newly added by this call (already-present ones excluded). */
  added: string[];
  /** True if the on-disk page changed (false on a pure no-op re-add). */
  changed: boolean;
}

declare module './topic-memory.js' {
  interface TopicMemoryService {
    /**
     * Append `aliases` to an existing topic page's `aliases:` frontmatter
     * (no LLM). Union + dedup; the canonical slug itself is never recorded
     * as its own alias. Idempotent: re-adding existing aliases is a no-op.
     *
     * Pairs with the AC2 alias-aware re-integration filter
     * (`refreshAllFromSources`): once a canonical page declares an alias,
     * `arete topic refresh <slug>` rescues orphaned sources tagged with
     * that alias. The optional `refresh` chaining is left to the CLI verb.
     *
     * Throws if the topic page does not exist.
     */
    addAliases(
      paths: import('../models/workspace.js').WorkspacePaths,
      canonicalSlug: string,
      aliases: readonly string[],
    ): Promise<AddAliasesResult>;
  }
}

TopicMemoryService.prototype.addAliases = async function (
  this: TopicMemoryService,
  paths,
  canonicalSlug,
  aliases,
): Promise<AddAliasesResult> {
  const storage = (this as unknown as { storage: StorageAdapter }).storage;
  const pagePath = pathJoin(paths.memory, 'topics', `${canonicalSlug}.md`);

  const content = await storage.read(pagePath);
  if (content === null) {
    throw new Error(`Topic page not found: ${canonicalSlug} (expected at ${pagePath})`);
  }
  const page = parseTopicPage(content);
  if (page === null) {
    throw new Error(`Topic page is malformed and cannot be parsed: ${canonicalSlug} (${pagePath})`);
  }

  const existing = new Set<string>(page.frontmatter.aliases ?? []);
  const added: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim();
    // Never record the canonical slug as its own alias; skip empties; dedup.
    if (alias.length === 0 || alias === canonicalSlug || existing.has(alias)) continue;
    existing.add(alias);
    added.push(alias);
  }

  // Sort to match the render-time normalization (topic-page.ts:148-149),
  // so the stored value and the returned value agree byte-for-byte.
  const merged = [...existing].sort();

  const updated: TopicPage = {
    ...page,
    frontmatter: {
      ...page.frontmatter,
      aliases: merged,
    },
  };

  const rendered = renderTopicPageExternal(updated);
  let changed = rendered !== content;
  if (changed) {
    if (storage.writeIfChanged !== undefined) {
      await storage.writeIfChanged(pagePath, rendered);
    } else {
      await storage.write(pagePath, rendered);
    }
  }

  return { slug: canonicalSlug, aliases: merged, added, changed };
};
