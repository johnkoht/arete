/**
 * Person signal extraction: LLM stance extraction and action items with lifecycle.
 *
 * Stance extraction follows the DI pattern from conversations/extract.ts:
 *   buildStancePrompt() → callLLM() → parseStanceResponse()
 *
 * Action item extraction is regex-based with direction classification,
 * staleness detection, capping, and dedup.
 */
import { createHash } from 'node:crypto';
const VALID_DIRECTIONS = new Set(['supports', 'opposes', 'concerned', 'neutral']);
// ---------------------------------------------------------------------------
// Stance Prompt
// ---------------------------------------------------------------------------
/**
 * Build the LLM prompt for extracting stances from content for a specific person.
 */
export function buildStancePrompt(content, personName) {
    return `You are analyzing a meeting transcript to extract stances for a specific person.

Extract stances ONLY for: ${personName}

A stance is a clear position, opinion, or preference expressed by this person — NOT a question or neutral statement. If uncertain whether something is a stance, OMIT it. Precision over recall.

Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.

JSON schema:
{
  "stances": [
    {
      "topic": "string — the topic or subject of the stance",
      "direction": "supports | opposes | concerned | neutral",
      "summary": "string — one sentence summarizing the stance",
      "evidence_quote": "string — exact quote from the transcript"
    }
  ]
}

Rules:
- Return ONLY the JSON object, no other text
- Extract stances ONLY for ${personName}, ignore other participants
- A stance requires a clear position — questions, acknowledgments, or procedural statements are NOT stances
- If uncertain whether something is a stance, OMIT it
- evidence_quote must be an actual quote from the transcript text
- If no stances are found, return {"stances": []}

Transcript:
${content}`;
}
// ---------------------------------------------------------------------------
// Stance Response Parsing
// ---------------------------------------------------------------------------
/**
 * Parse the LLM response into a PersonStance array.
 * Handles various response formats gracefully — never throws.
 */
export function parseStanceResponse(response) {
    const trimmed = response.trim();
    if (!trimmed)
        return [];
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
    let raw;
    try {
        raw = JSON.parse(jsonStr);
    }
    catch {
        return [];
    }
    if (!Array.isArray(raw.stances))
        return [];
    const stances = [];
    for (const item of raw.stances) {
        if (!item || typeof item !== 'object')
            continue;
        const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
        const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';
        const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
        const evidenceQuote = typeof item.evidence_quote === 'string' ? item.evidence_quote.trim() : '';
        // All required fields must be present and direction must be valid
        if (!topic || !direction || !summary || !evidenceQuote)
            continue;
        if (!VALID_DIRECTIONS.has(direction))
            continue;
        stances.push({
            topic,
            direction: direction,
            summary,
            evidenceQuote,
            source: '',
            date: '',
        });
    }
    return stances;
}
// ---------------------------------------------------------------------------
// Stance Extraction (Public API)
// ---------------------------------------------------------------------------
/**
 * Extract stances for a specific person from content using an LLM.
 *
 * @param content - Meeting transcript or conversation text
 * @param personName - Name of the person to extract stances for
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @returns Extracted stances — empty array on any error
 */
export async function extractStancesForPerson(content, personName, callLLM) {
    if (!content || content.trim() === '' || !personName || personName.trim() === '') {
        return [];
    }
    const prompt = buildStancePrompt(content, personName);
    try {
        const response = await callLLM(prompt);
        return parseStanceResponse(response);
    }
    catch {
        // LLM call failed — return empty stances rather than propagating the error
        return [];
    }
}
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STALE_THRESHOLD_DAYS = 30;
const DEFAULT_MAX_PER_DIRECTION = 10;
// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------
/**
 * Content-normalized dedup hash: sha256(lowercase(trim(text)) + personSlug + direction).
 */
export function computeActionItemHash(text, personSlug, direction) {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    return createHash('sha256')
        .update(`${normalized}${personSlug}${direction}`)
        .digest('hex');
}
// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------
/**
 * Returns true if the action item's source date is older than 30 days
 * relative to `referenceDate` (defaults to now).
 */
export function isActionItemStale(item, referenceDate) {
    const ref = referenceDate ?? new Date();
    const itemDate = new Date(item.date);
    if (Number.isNaN(itemDate.getTime()))
        return true;
    const diffMs = ref.getTime() - itemDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > STALE_THRESHOLD_DAYS;
}
// ---------------------------------------------------------------------------
// Capping
// ---------------------------------------------------------------------------
/**
 * Keep most recent N items per direction, sorted by date descending.
 */
export function capActionItems(items, maxPerDirection = DEFAULT_MAX_PER_DIRECTION) {
    const iOwe = items
        .filter((i) => i.direction === 'i_owe_them')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, maxPerDirection);
    const theyOwe = items
        .filter((i) => i.direction === 'they_owe_me')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, maxPerDirection);
    return [...iOwe, ...theyOwe];
}
// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
/**
 * Merge new items into existing, skipping any with a matching hash.
 */
export function deduplicateActionItems(existing, newItems) {
    const seen = new Set(existing.map((i) => i.hash));
    const unique = newItems.filter((i) => !seen.has(i.hash));
    return [...existing, ...unique];
}
// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Build a regex that matches a person's name (case-insensitive).
 * Handles full name and first name.
 */
function personPattern(personName) {
    const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = personName.trim().split(/\s+/);
    if (parts.length > 1) {
        const firstName = parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:${escaped}|${firstName})`, 'i');
    }
    return new RegExp(escaped, 'i');
}
/**
 * Check if a line mentions the person (case-insensitive).
 */
function mentionsPerson(line, personName) {
    return personPattern(personName).test(line);
}
/**
 * Check if the actor in a sentence is the owner (i.e., 'i_owe_them').
 */
function isOwnerActor(text, ownerName) {
    if (ownerName) {
        const ownerPat = personPattern(ownerName);
        // Check if owner name appears at the start of the action text
        const trimmed = text.trim();
        if (ownerPat.test(trimmed.split(/\s+/).slice(0, 3).join(' '))) {
            return true;
        }
    }
    // First-person heuristics
    return /^I[''\u2019](?:ll|m|ve)\b/i.test(text.trim()) ||
        /^I (?:will|need to|agreed to|have to|should|am going to|promised to)\b/i.test(text.trim());
}
/**
 * Check if the person is the actor (i.e., 'they_owe_me').
 */
function isPersonActor(text, personName) {
    const pat = personPattern(personName);
    const firstWords = text.trim().split(/\s+/).slice(0, 3).join(' ');
    return pat.test(firstWords);
}
//# sourceMappingURL=person-signals.js.map