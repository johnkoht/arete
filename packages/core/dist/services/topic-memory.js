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
import { parseTopicPage, selectSectionsForBudget, } from '../models/topic-page.js';
import { jaccardSimilarity, normalizeForJaccard, } from '../utils/similarity.js';
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
// ---------------------------------------------------------------------------
// Pure helpers (testable without storage)
// ---------------------------------------------------------------------------
/**
 * Tokenize a slug for Jaccard comparison.
 * `cover-whale-templates` → `['cover', 'whale', 'templates']`.
 */
export function tokenizeSlug(slug) {
    return normalizeForJaccard(slug.replace(/-/g, ' '));
}
/**
 * Compute the best Jaccard score of a candidate against all identity
 * surfaces of existing topics, returning the winning match.
 *
 * Returns `{ bestScore: 0 }` when there are no existing topics.
 */
export function bestAliasMatch(candidate, existing) {
    const candTokens = tokenizeSlug(candidate);
    if (candTokens.length === 0)
        return { bestScore: 0 };
    let bestScore = 0;
    let matchedCanonical;
    let matchedSurface;
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
export function classifyByJaccard(candidate, existing) {
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
export function buildAdjudicationPrompt(candidates, existing) {
    const existingList = existing
        .map((t) => {
        const aliases = t.aliases.length > 0 ? ` (aliases: ${t.aliases.join(', ')})` : '';
        return `- ${t.canonical}${aliases}`;
    })
        .join('\n');
    const candidatesList = candidates
        .map((c, i) => `${i + 1}. candidate="${c.input}" nearest existing="${c.bestMatch}"`)
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
export function parseAdjudicationResponse(response, validSlugs) {
    const out = new Map();
    // Strip optional code fences / whitespace.
    const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch {
        return out;
    }
    if (parsed === null || typeof parsed !== 'object')
        return out;
    const decisions = parsed.decisions;
    if (!Array.isArray(decisions))
        return out;
    for (const d of decisions) {
        if (d === null || typeof d !== 'object' || Array.isArray(d))
            continue;
        const rec = d;
        const input = rec.input;
        const resolved = rec.resolved;
        if (typeof input !== 'string' || typeof resolved !== 'string')
            continue;
        // Validate against allowed set — rejects LLM hallucinated slugs.
        if (resolved === 'NEW' || validSlugs.has(resolved)) {
            out.set(input, resolved);
        }
    }
    return out;
}
export class TopicMemoryService {
    storage;
    searchProvider;
    constructor(storage, searchProvider) {
        this.storage = storage;
        this.searchProvider = searchProvider;
    }
    /**
     * Read all topic pages from `.arete/memory/topics/*.md`.
     * Returns `{ topics, errors }` — partial-state tolerant per pre-mortem
     * Risk 14. Corrupt pages are logged as errors; valid pages still usable.
     */
    async listAll(paths) {
        const topicsDir = join(paths.memory, 'topics');
        const exists = await this.storage.exists(topicsDir);
        if (!exists)
            return { topics: [], errors: [] };
        const files = await this.storage.list(topicsDir, { extensions: ['.md'] });
        const topics = [];
        const errors = [];
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
    static toIdentities(topics) {
        return topics.map((t) => {
            const identity = {
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
    async aliasAndMerge(candidates, existing, options = {}) {
        // Deduplicate inputs while preserving order — a meeting may repeat a slug.
        const seen = new Set();
        const deduped = [];
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
            return firstPass.map((r) => r.decision === 'ambiguous-new' ? { ...r, decision: 'ambiguous-new' } : r);
        }
        // Tier 2 — LLM adjudication batch.
        const validSlugs = new Set(existing.map((e) => e.canonical));
        validSlugs.add('NEW');
        const prompt = buildAdjudicationPrompt(ambiguous.map((a) => ({
            input: a.input,
            bestMatch: a.matchedAgainst ?? '(none)',
        })), existing);
        let llmDecisions;
        try {
            const response = await options.callLLM(prompt);
            llmDecisions = parseAdjudicationResponse(response, validSlugs);
        }
        catch {
            // LLM failure → fall through; ambiguous candidates stay new.
            llmDecisions = new Map();
        }
        // Apply decisions to the first-pass results.
        return firstPass.map((r) => {
            if (r.decision !== 'ambiguous-new')
                return r;
            const llm = llmDecisions.get(r.input);
            if (llm === undefined || llm === 'NEW') {
                return { ...r, decision: 'ambiguous-new' };
            }
            return {
                ...r,
                resolved: llm,
                decision: 'ambiguous-resolved-existing',
            };
        });
    }
}
// ---------------------------------------------------------------------------
// Step 3 — integrateSource
// ---------------------------------------------------------------------------
import { createHash } from 'crypto';
import { renderTopicPage, SECTION_NAMES } from '../models/topic-page.js';
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
export function parseIntegrateResponse(response) {
    const cleaned = response.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return null;
    const rec = parsed;
    // new_change_log_entry required + non-empty
    const changeLog = rec.new_change_log_entry;
    if (typeof changeLog !== 'string' || changeLog.trim().length === 0)
        return null;
    // updated_sections — narrow to the enum
    const rawSections = rec.updated_sections;
    const updated = {};
    if (rawSections !== null && typeof rawSections === 'object' && !Array.isArray(rawSections)) {
        for (const [key, val] of Object.entries(rawSections)) {
            if (!SECTION_NAMES.includes(key))
                continue;
            if (typeof val !== 'string')
                continue;
            if (val.length > 8000)
                continue; // Risk 4: cap size
            if (val.includes('\n---\n') || val.startsWith('---\n') || val.endsWith('\n---'))
                continue; // no frontmatter injection
            updated[key] = val;
        }
    }
    // Optional arrays
    const pickStringArray = (v) => {
        if (!Array.isArray(v))
            return undefined;
        const out = v.filter((x) => typeof x === 'string' && x.trim().length > 0);
        return out.length > 0 ? out : undefined;
    };
    const result = {
        updated_sections: updated,
        new_change_log_entry: changeLog.trim(),
    };
    const oq = pickStringArray(rec.new_open_questions);
    if (oq !== undefined)
        result.new_open_questions = oq;
    const kg = pickStringArray(rec.new_known_gaps);
    if (kg !== undefined)
        result.new_known_gaps = kg;
    return result;
}
/**
 * Content-hash a string for idempotency. Low-level primitive; callers
 * should prefer `hashMeetingSource` for meeting files so frontmatter
 * edits (attendee adds, status changes, post-processing metadata) don't
 * bust dedup.
 */
export function hashSource(content) {
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
export function hashMeetingSource(content) {
    // Body is everything after the closing `---\n` of the frontmatter block.
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    const body = match !== null ? match[1] : content;
    return hashSource(body);
}
/**
 * Apply an `IntegrateOutput` onto an existing topic page, returning the
 * updated page. Pure: no I/O. Caller does the write.
 */
export function applyIntegrateOutput(page, output, source, today) {
    const sections = { ...page.sections };
    // Overwrite any sections the LLM updated.
    for (const [name, body] of Object.entries(output.updated_sections)) {
        if (body === undefined)
            continue;
        sections[name] = body;
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
        const existingLines = new Set(existing.split('\n').map((l) => l.trim()).filter((l) => l.length > 0));
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
        const existingLines = new Set(existing.split('\n').map((l) => l.trim()).filter((l) => l.length > 0));
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
export function applyFallbackUpdate(page, source, today, reason) {
    const sections = { ...page.sections };
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
export function createTopicStub(slug, today, options = {}) {
    const frontmatter = {
        topic_slug: slug,
        status: 'new',
        first_seen: today,
        last_refreshed: today,
        sources_integrated: [],
    };
    if (options.area !== undefined)
        frontmatter.area = options.area;
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
export function buildIntegratePrompt(topicSlug, existingPage, newSource, relevantL2) {
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
import { join as pathJoin, basename as pathBasename } from 'node:path';
import { parseMeetingFile as parseMeetingFileExternal } from './meeting-context.js';
import { renderTopicPage as renderTopicPageExternal } from '../models/topic-page.js';
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
 */
export const SLACK_DIGEST_FILENAME_RE = /^\d{4}-\d{2}-\d{2}-slack-digest\.md$/;
/**
 * Scan `resources/meetings/` and `resources/notes/{date}-slack-digest.md`
 * and return parseable entries sorted by `date` ascending (ties broken by
 * `path` ascending, for determinism).
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
export async function discoverTopicSources(paths, storage) {
    const entries = [];
    const meetingsDir = pathJoin(paths.resources, 'meetings');
    if (await storage.exists(meetingsDir)) {
        const meetingFiles = await storage.list(meetingsDir, { extensions: ['.md'] });
        for (const filePath of meetingFiles) {
            const fileName = pathBasename(filePath);
            const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
            if (!dateMatch)
                continue;
            const content = await storage.read(filePath);
            if (content === null)
                continue;
            const parsed = parseMeetingFileExternal(content);
            if (!parsed)
                continue;
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
            if (!SLACK_DIGEST_FILENAME_RE.test(fileName))
                continue;
            const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
            if (!dateMatch)
                continue;
            const content = await storage.read(filePath);
            if (content === null)
                continue;
            const parsed = parseMeetingFileExternal(content);
            if (!parsed)
                continue;
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
                console.warn(`[discoverTopicSources] skipping ${filePath}: filename matches slack-digest pattern but frontmatter type is "${fmTypeMatch[1]}"`);
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
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        return a.path.localeCompare(b.path);
    });
    return entries;
}
TopicMemoryService.prototype.refreshAllFromSources = async function (paths, options) {
    // Acquire the seed lock unless the caller already holds it (seed does).
    // Prevents concurrent `arete memory refresh` runs (cron + interactive)
    // from racing on topic-page writes.
    let releaseLock;
    if (!options.skipLock && !options.dryRun) {
        const { acquireSeedLock } = await import('./seed-lock.js');
        const areteDir = options.workspaceRoot !== undefined
            ? pathJoin(options.workspaceRoot, '.arete')
            : pathJoin(paths.memory, '..');
        releaseLock = await acquireSeedLock(areteDir, options.lockLabel ?? 'topic refresh');
    }
    try {
        const { topics: existing } = await this.listAll(paths);
        const existingBySlug = new Map(existing.map((t) => [t.frontmatter.topic_slug, t]));
        const targetSlugs = options.slugs !== undefined
            ? options.slugs
            : existing.map((t) => t.frontmatter.topic_slug);
        // Gather all topic-source files once (meetings + slack-digests) — shared
        // across all targets. `discoverTopicSources` returns entries sorted by
        // date asc, so per-target filtering preserves chronological order
        // without re-sorting.
        // Accessing private storage through `(this as any)` avoids needing a public
        // accessor for this internal batch operation.
        const storage = this.storage;
        const discovered = await discoverTopicSources(paths, storage);
        // `--source <path>` scopes discovery to a single file BEFORE the per-
        // slug filter runs. Mirrors the skill's "integrate just the digest I
        // just wrote" semantics. Two-step matching tolerates absolute vs.
        // workspace-relative path mismatches between the CLI's
        // `path.resolve(cwd, arg)` and the storage adapter's listed paths
        // (some adapters return absolute, some return relative). We accept
        // an entry that matches by exact equality OR by suffix on either
        // side — small enough surface that ambiguity is implausible
        // (entries are unique paths, scoped flag passes one path at a time).
        const allSources = options.sourcePath !== undefined
            ? discovered.filter((src) => {
                if (src.path === options.sourcePath)
                    return true;
                if (src.path.endsWith(options.sourcePath))
                    return true;
                if (options.sourcePath.endsWith(src.path))
                    return true;
                return false;
            })
            : discovered;
        const perTopic = [];
        for (const targetSlug of targetSlugs) {
            let page = existingBySlug.get(targetSlug) ?? null;
            let integrated = 0;
            let fallback = 0;
            let skipped = 0;
            const matching = [];
            for (const src of allSources) {
                if (!src.topics.includes(targetSlug))
                    continue;
                matching.push({ path: src.path, date: src.date, content: src.content });
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
                    if (already)
                        skipped++;
                    else
                        integrated++;
                }
                perTopic.push({ slug: targetSlug, integrated, fallback, skipped, status: 'ok' });
                continue;
            }
            for (const src of matching) {
                const result = await this.integrateSource(targetSlug, page, src, { today: options.today, callLLM: options.callLLM });
                if (result.decision === 'integrated')
                    integrated++;
                else if (result.decision === 'fallback')
                    fallback++;
                else if (result.decision === 'skipped-already-integrated')
                    skipped++;
                page = result.page;
            }
            // Write the final page
            if (page !== null) {
                const outPath = pathJoin(paths.memory, 'topics', `${targetSlug}.md`);
                await storage.mkdir(pathJoin(paths.memory, 'topics'));
                if (storage.writeIfChanged !== undefined) {
                    await storage.writeIfChanged(outPath, renderTopicPageExternal(page));
                }
                else {
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
    }
    finally {
        if (releaseLock !== undefined) {
            await releaseLock();
        }
    }
};
/**
 * Cost estimate helper — rough Haiku cost per (topic, meeting) integration.
 * Used by CLI for `--dry-run` and `--confirm` prompts.
 */
export const ESTIMATED_USD_PER_INTEGRATION = 0.015;
TopicMemoryService.prototype.listTopicMemoryStatus = async function (paths, options = {}) {
    const staleDays = options.staleDays ?? 60;
    const today = options.today ?? new Date();
    const { topics } = await this.listAll(paths);
    // Inbound ref count map
    const inboundRefs = new Map();
    const refRe = /\[\[([a-z0-9-]+)\]\]/g;
    for (const t of topics) {
        const body = Object.values(t.sections).join('\n');
        const ownSlug = t.frontmatter.topic_slug;
        let m;
        while ((m = refRe.exec(body)) !== null) {
            if (m[1] === ownSlug)
                continue; // self-refs don't count for orphan detection
            inboundRefs.set(m[1], (inboundRefs.get(m[1]) ?? 0) + 1);
        }
    }
    const out = [];
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
export function estimateRefreshCostUsd(totalIntegrations) {
    return totalIntegrations * ESTIMATED_USD_PER_INTEGRATION;
}
TopicMemoryService.prototype.integrateSource = async function (topicSlug, existingPage, newSource, options) {
    const today = options.today;
    const sourceHash = hashMeetingSource(newSource.content);
    const sourceRef = {
        path: newSource.path,
        date: newSource.date,
        hash: sourceHash,
    };
    // Idempotency: if source already integrated, no-op.
    if (existingPage !== null) {
        const already = existingPage.frontmatter.sources_integrated.some((s) => s.hash === sourceHash);
        if (already) {
            return {
                page: existingPage,
                decision: 'skipped-already-integrated',
            };
        }
    }
    // Start from existing or create stub.
    const startPage = existingPage ??
        createTopicStub(topicSlug, today);
    if (options.callLLM === undefined) {
        return {
            page: applyFallbackUpdate(startPage, sourceRef, today, 'callLLM not provided'),
            decision: 'fallback',
            reason: 'no-llm',
        };
    }
    const prompt = buildIntegratePrompt(topicSlug, existingPage, newSource, options.relevantL2 ?? '');
    let response;
    try {
        response = await options.callLLM(prompt);
    }
    catch (err) {
        return {
            page: applyFallbackUpdate(startPage, sourceRef, today, `LLM threw: ${err instanceof Error ? err.message : 'unknown'}`),
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
function daysBetween(a, b) {
    const d = new Date(a);
    if (Number.isNaN(d.getTime()))
        return Infinity;
    return Math.floor((b.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
/**
 * Classify a provider name as one of the three known backends.
 * Unknown provider names bucket as 'fallback' (conservative — they at
 * least implement the SearchProvider interface).
 */
function classifyBackend(name) {
    return name === 'qmd' ? 'qmd' : 'fallback';
}
TopicMemoryService.prototype.retrieveRelevant = async function (query, options = {}) {
    const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
    const budgetWords = options.budgetWords ?? DEFAULT_BUDGET_WORDS;
    const self = this;
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
        return (normalized.includes('/.arete/memory/topics/') ||
            normalized.startsWith('.arete/memory/topics/') ||
            normalized.startsWith(TOPIC_PATH_PREFIX));
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
    const ranked = [];
    for (const c of candidatePaths) {
        const content = await self.storage.read(c.path);
        if (content === null)
            continue;
        const page = parseTopicPage(content);
        if (page === null)
            continue;
        let score = c.score * QMD_SCORE_WEIGHT;
        const daysOld = daysBetween(page.frontmatter.last_refreshed, now);
        if (daysOld <= 30)
            score += RECENCY_BONUS_30D;
        else if (daysOld <= 90)
            score += RECENCY_BONUS_90D;
        if (options.area !== undefined &&
            page.frontmatter.area === options.area) {
            score += AREA_MATCH_BONUS;
        }
        ranked.push({ page, score });
    }
    ranked.sort((a, b) => {
        if (a.score !== b.score)
            return b.score - a.score;
        // Tiebreak for equal scores: prefer fresher `last_refreshed` so
        // "when relevance is indistinguishable, prefer more recent" —
        // better skill UX than alphabetical. Slug-asc tiebreak of tiebreak
        // keeps output fully deterministic.
        const aDate = a.page.frontmatter.last_refreshed;
        const bDate = b.page.frontmatter.last_refreshed;
        if (aDate !== bDate)
            return aDate < bDate ? 1 : -1;
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
//# sourceMappingURL=topic-memory.js.map