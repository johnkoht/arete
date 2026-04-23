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
 * Content-hash a source (meeting file content) for idempotency.
 * Used in `sources_integrated[].hash` to detect already-applied sources.
 */
export function hashSource(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
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
 *  - New source (meeting content)
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

export interface IntegrateSourceOptions {
  callLLM?: LLMCallFn;
  relevantL2?: string;
  today: string;           // YYYY-MM-DD — injected for determinism
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
// `arete memory refresh`. Single path avoids duplicate meeting-discovery
// loops and silent-staleness gap where `memory refresh` didn't touch topics.
// ---------------------------------------------------------------------------

export interface RefreshBatchOptions {
  callLLM?: LLMCallFn;
  dryRun?: boolean;
  today: string;
  /** Only refresh these slugs; omit for all existing topics. */
  slugs?: string[];
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
    refreshAllFromMeetings(
      paths: import('../models/workspace.js').WorkspacePaths,
      options: RefreshBatchOptions,
    ): Promise<RefreshBatchResult>;
  }
}

import { join as pathJoin, basename as pathBasename } from 'node:path';
import { parseMeetingFile as parseMeetingFileExternal } from './meeting-context.js';
import { renderTopicPage as renderTopicPageExternal } from '../models/topic-page.js';

TopicMemoryService.prototype.refreshAllFromMeetings = async function (
  this: TopicMemoryService,
  paths,
  options,
): Promise<RefreshBatchResult> {
  const { topics: existing } = await this.listAll(paths);
  const existingBySlug = new Map<string, TopicPage>(
    existing.map((t) => [t.frontmatter.topic_slug, t]),
  );

  const targetSlugs =
    options.slugs !== undefined
      ? options.slugs
      : existing.map((t) => t.frontmatter.topic_slug);

  // Gather meeting files once — shared across all targets.
  // Accessing private storage through `(this as any)` avoids needing a public
  // accessor for this internal batch operation.
  const storage = (this as unknown as { storage: StorageAdapter }).storage;
  const meetingsDir = pathJoin(paths.resources, 'meetings');
  const meetingFiles = (await storage.exists(meetingsDir))
    ? await storage.list(meetingsDir, { extensions: ['.md'] })
    : [];

  const perTopic: RefreshBatchTopicResult[] = [];

  for (const targetSlug of targetSlugs) {
    let page: TopicPage | null = existingBySlug.get(targetSlug) ?? null;
    let integrated = 0;
    let fallback = 0;
    let skipped = 0;

    const matching: Array<{ path: string; date: string; content: string }> = [];
    for (const meetingPath of meetingFiles) {
      const fileName = pathBasename(meetingPath);
      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const content = await storage.read(meetingPath);
      if (content === null) continue;
      const parsed = parseMeetingFileExternal(content);
      if (!parsed) continue;
      const meetingTopics = parsed.frontmatter.topics;
      if (!Array.isArray(meetingTopics) || !meetingTopics.includes(targetSlug)) continue;
      matching.push({ path: meetingPath, date: dateMatch[1], content });
    }

    matching.sort((a, b) => a.date.localeCompare(b.date));

    if (matching.length === 0) {
      perTopic.push({ slug: targetSlug, integrated: 0, fallback: 0, skipped: 0, status: 'no-sources' });
      continue;
    }

    if (options.dryRun) {
      for (const src of matching) {
        const srcHash = hashSource(src.content);
        const already = page?.frontmatter.sources_integrated.some((s) => s.hash === srcHash) ?? false;
        if (already) skipped++;
        else integrated++;
      }
      perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
      continue;
    }

    for (const src of matching) {
      const result = await this.integrateSource(
        targetSlug,
        page,
        src,
        { today: options.today, callLLM: options.callLLM },
      );
      if (result.decision === 'integrated') integrated++;
      else if (result.decision === 'fallback') fallback++;
      else if (result.decision === 'skipped-already-integrated') skipped++;
      page = result.page;
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
};

/**
 * Cost estimate helper — rough Haiku cost per (topic, meeting) integration.
 * Used by CLI for `--dry-run` and `--confirm` prompts.
 */
export const ESTIMATED_USD_PER_INTEGRATION = 0.015;

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
  const sourceHash = hashSource(newSource.content);
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

  const prompt = buildIntegratePrompt(
    topicSlug,
    existingPage,
    newSource,
    options.relevantL2 ?? '',
  );

  let response: string;
  try {
    response = await options.callLLM(prompt);
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

const TOPIC_PATH_PREFIX = '.arete/memory/topics/';
const DEFAULT_RETRIEVAL_LIMIT = 3;
const DEFAULT_BUDGET_WORDS = 1000;

const RECENCY_BONUS_30D = 0.2;
const RECENCY_BONUS_90D = 0.1;
const AREA_MATCH_BONUS = 0.1;
const QMD_SCORE_WEIGHT = 0.6;

function daysBetween(a: string, b: Date): number {
  const d = new Date(a);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((b.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

declare module './topic-memory.js' {
  interface TopicMemoryService {
    retrieveRelevant(
      query: string,
      options?: RetrieveRelevantOptions,
    ): Promise<TopicPageContext[]>;
  }
}

TopicMemoryService.prototype.retrieveRelevant = async function (
  this: TopicMemoryService,
  query: string,
  options: RetrieveRelevantOptions = {},
): Promise<TopicPageContext[]> {
  const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const budgetWords = options.budgetWords ?? DEFAULT_BUDGET_WORDS;

  const searchProvider = (this as unknown as { searchProvider?: SearchProvider }).searchProvider;
  if (searchProvider === undefined) {
    return [];
  }

  // Broader candidate set (limit * 3) so re-ranking with recency + area
  // bonuses can promote near-misses over exact-text matches.
  const candidates = await searchProvider.semanticSearch(query, {
    paths: [TOPIC_PATH_PREFIX],
    limit: limit * 3,
  });

  if (candidates.length === 0) return [];

  const now = new Date();
  const ranked: Array<{ page: TopicPage; score: number }> = [];

  for (const c of candidates) {
    const page = parseTopicPage(c.content);
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
    // Deterministic tiebreak on slug to keep output stable across identical scores.
    const aSlug = a.page.frontmatter.topic_slug;
    const bSlug = b.page.frontmatter.topic_slug;
    return aSlug < bSlug ? -1 : aSlug > bSlug ? 1 : 0;
  });

  const topK = ranked.slice(0, limit);

  return topK.map(({ page, score }) => ({
    slug: page.frontmatter.topic_slug,
    frontmatter: page.frontmatter,
    bodyForContext: selectSectionsForBudget(page, budgetWords),
    score,
  }));
};
