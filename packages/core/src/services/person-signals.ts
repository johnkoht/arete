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

// ---------------------------------------------------------------------------
// LLM Stance Types
// ---------------------------------------------------------------------------

/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;

/** Direction of a person's stance on a topic. */
export type StanceDirection = 'supports' | 'opposes' | 'concerned' | 'neutral';

const VALID_DIRECTIONS = new Set<string>(['supports', 'opposes', 'concerned', 'neutral']);

/** A stance extracted from meeting content for a specific person. */
export type PersonStance = {
  topic: string;
  direction: StanceDirection;
  summary: string;
  evidenceQuote: string;
  source: string;
  date: string;
};

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 */
type RawStanceResult = {
  stances?: Array<{
    topic?: string;
    direction?: string;
    summary?: string;
    evidence_quote?: string;
  }>;
};

// ---------------------------------------------------------------------------
// Stance Prompt
// ---------------------------------------------------------------------------

/**
 * Build the LLM prompt for extracting stances from content for a specific person.
 */
export function buildStancePrompt(content: string, personName: string): string {
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
export function parseStanceResponse(response: string): PersonStance[] {
  const trimmed = response.trim();
  if (!trimmed) return [];

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

  let raw: RawStanceResult;
  try {
    raw = JSON.parse(jsonStr) as RawStanceResult;
  } catch {
    return [];
  }

  if (!Array.isArray(raw.stances)) return [];

  const stances: PersonStance[] = [];

  for (const item of raw.stances) {
    if (!item || typeof item !== 'object') continue;

    const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
    const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';
    const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
    const evidenceQuote = typeof item.evidence_quote === 'string' ? item.evidence_quote.trim() : '';

    // All required fields must be present and direction must be valid
    if (!topic || !direction || !summary || !evidenceQuote) continue;
    if (!VALID_DIRECTIONS.has(direction)) continue;

    stances.push({
      topic,
      direction: direction as StanceDirection,
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
export async function extractStancesForPerson(
  content: string,
  personName: string,
  callLLM: LLMCallFn,
): Promise<PersonStance[]> {
  if (!content || content.trim() === '' || !personName || personName.trim() === '') {
    return [];
  }

  const prompt = buildStancePrompt(content, personName);
  try {
    const response = await callLLM(prompt);
    return parseStanceResponse(response);
  } catch {
    // LLM call failed — return empty stances rather than propagating the error
    return [];
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionItemDirection = 'i_owe_them' | 'they_owe_me';

export type PersonActionItem = {
  text: string;
  direction: ActionItemDirection;
  source: string;
  date: string;
  hash: string;
  stale: boolean;
  /** Optional goal association — links action item to a quarterly goal */
  goalSlug?: string;
  /** Optional area association — domain scoping. Metadata only, NOT part of dedup hash. */
  area?: string;
};

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
export function computeActionItemHash(
  text: string,
  personSlug: string,
  direction: ActionItemDirection,
): string {
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
export function isActionItemStale(
  item: PersonActionItem,
  referenceDate?: Date,
): boolean {
  const ref = referenceDate ?? new Date();
  const itemDate = new Date(item.date);
  if (Number.isNaN(itemDate.getTime())) return true;
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
export function capActionItems(
  items: PersonActionItem[],
  maxPerDirection: number = DEFAULT_MAX_PER_DIRECTION,
): PersonActionItem[] {
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
export function deduplicateActionItems(
  existing: PersonActionItem[],
  newItems: PersonActionItem[],
): PersonActionItem[] {
  const seen = new Set(existing.map((i) => i.hash));
  const unique = newItems.filter((i) => !seen.has(i.hash));
  return [...existing, ...unique];
}
