/**
 * TopicMemoryService — the L3 topic-wiki layer.
 *
 * Responsibilities (split across phased work):
 *  - alias/merge candidate topic slugs from meeting extraction against
 *    existing topic pages (Step 2 — this file's primary concern today)
 *  - integrateSource: read existing topic page + new meeting + filter
 *    L2 items, ask LLM to rewrite only touched sections, merge back
 *    (Step 3 — stubbed)
 *  - listAll / listForArea: read topic pages from storage (needed by
 *    Step 4 area-memory and Step 9 CLAUDE.md regen)
 *
 * See plan: dev/work/plans/topic-wiki-memory/plan.md
 */

import { join } from 'path';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';
import {
  parseTopicPage,
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
 */
export interface TopicIdentity {
  canonical: string;
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without storage)
// ---------------------------------------------------------------------------

/**
 * Tokenize a slug for Jaccard comparison.
 * `cover-whale-templates` → `['cover', 'whale', 'templates']`.
 */
export function tokenizeSlug(slug: string): string[] {
  return normalizeForJaccard(slug.replace(/-/g, ' '));
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

  constructor(storage: StorageAdapter) {
    this.storage = storage;
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
    return topics.map((t) => ({
      canonical: t.frontmatter.topic_slug,
      aliases: t.frontmatter.aliases ?? [],
    }));
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
    // Deduplicate inputs while preserving order — a meeting may repeat a slug.
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
// Reserved for Step 3 (integrateSource) — stub exports
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StubFrontmatterRef = TopicPageFrontmatter; // prevents unused-import warning
