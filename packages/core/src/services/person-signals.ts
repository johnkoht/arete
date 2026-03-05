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

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a regex that matches a person's name (case-insensitive).
 * Handles full name and first name.
 */
function personPattern(personName: string): RegExp {
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
function mentionsPerson(line: string, personName: string): boolean {
  return personPattern(personName).test(line);
}

/**
 * Check if the actor in a sentence is the owner (i.e., 'i_owe_them').
 */
function isOwnerActor(text: string, ownerName: string | undefined): boolean {
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
function isPersonActor(text: string, personName: string): boolean {
  const pat = personPattern(personName);
  const firstWords = text.trim().split(/\s+/).slice(0, 3).join(' ');
  return pat.test(firstWords);
}

// ---------------------------------------------------------------------------
// Action Item Prompt
// ---------------------------------------------------------------------------

/**
 * Build the LLM prompt for extracting action items / commitments from content
 * for a specific person.
 *
 * @deprecated For meetings, use {@link parseActionItemsFromMeeting} from meeting-parser.ts.
 * This LLM-based extraction path is deprecated. The meeting processing workflow now
 * extracts action items during `arete meeting extract` and saves them to structured
 * `## Action Items` sections, which are parsed by meeting-parser.ts during person
 * memory refresh. This prompt builder is preserved for potential non-meeting sources
 * (conversations, etc.) but should not be used for new meeting workflows.
 */
export function buildActionItemPrompt(content: string, personName: string): string {
  return `You are analyzing a meeting transcript to extract genuine commitments and action items involving a specific person.

Extract action items ONLY involving: ${personName}

A commitment is a promise, action item, or deliverable. NOT a description of how something works, an explanation of architecture, or general discussion.

Rules:
- INCLUDE: explicit promises ("I'll send you...", "Alice will handle...", "I agreed to..."), action items with a clear owner, deliverables with a clear assignee
- EXCLUDE: descriptions of how systems work, architecture walkthroughs, explanations of past decisions, general discussion, questions without commitments
- Return ONLY valid JSON with no markdown formatting, no code fences, no explanation
- Extract items involving ${personName} only — either they made a commitment, or someone made one to them
- For each item, classify direction: "i_owe_them" (the workspace owner owes something to ${personName}) or "they_owe_me" (${personName} owes something to the workspace owner)
- text should be a concise, normalized description of the deliverable — NOT a raw transcript excerpt
- If no genuine commitments are found, return {"action_items": []}

JSON schema:
{
  "action_items": [
    {
      "text": "string — concise description of the deliverable",
      "direction": "i_owe_them | they_owe_me"
    }
  ]
}

Transcript:
${content}`;
}

// ---------------------------------------------------------------------------
// Action Item Response Parsing
// ---------------------------------------------------------------------------

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 */
type RawActionItemResult = {
  action_items?: Array<{
    text?: string;
    direction?: string;
  }>;
};

const VALID_ACTION_ITEM_DIRECTIONS = new Set<string>(['i_owe_them', 'they_owe_me']);

/**
 * Parse the LLM response into an array of raw action item objects.
 * Handles code fences, extra text, malformed JSON — never throws.
 * Returns objects with text + direction only; caller adds source/date/hash/stale.
 *
 * @deprecated For meetings, use {@link parseActionItemsFromMeeting} from meeting-parser.ts.
 * This LLM response parser is deprecated. Action items are now extracted during meeting
 * processing and stored in structured `## Action Items` sections, which are parsed by
 * meeting-parser.ts. This parser is preserved for potential non-meeting sources but
 * should not be used for new meeting workflows.
 */
export function parseActionItemResponse(
  response: string,
): Array<{ text: string; direction: ActionItemDirection }> {
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

  let raw: RawActionItemResult;
  try {
    raw = JSON.parse(jsonStr) as RawActionItemResult;
  } catch {
    return [];
  }

  if (!Array.isArray(raw.action_items)) return [];

  const results: Array<{ text: string; direction: ActionItemDirection }> = [];

  for (const item of raw.action_items) {
    if (!item || typeof item !== 'object') continue;

    const text = typeof item.text === 'string' ? item.text.trim() : '';
    const direction =
      typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';

    // Skip items missing required fields
    if (!text || !direction) continue;
    // Skip items with invalid direction
    if (!VALID_ACTION_ITEM_DIRECTIONS.has(direction)) continue;

    results.push({ text, direction: direction as ActionItemDirection });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

// Patterns for "[Person] will/agreed to/is going to..."
const THEY_OWE_PATTERNS = [
  /^(.+?)\s+will\s+(.+?)(?:[.!]|$)/i,
  /^(.+?)\s+agreed to\s+(.+?)(?:[.!]|$)/i,
  /^(.+?)\s+is going to\s+(.+?)(?:[.!]|$)/i,
  /^(.+?)\s+promised to\s+(.+?)(?:[.!]|$)/i,
];

// Patterns for "I'll/I need to/I agreed to..." (first-person → i_owe_them)
const I_OWE_PATTERNS = [
  /^I[''\u2019]ll\s+(.+?)(?:[.!]|$)/i,
  /^I will\s+(.+?)(?:[.!]|$)/i,
  /^I need to\s+(.+?)(?:[.!]|$)/i,
  /^I agreed to\s+(.+?)(?:[.!]|$)/i,
  /^I have to\s+(.+?)(?:[.!]|$)/i,
  /^I should\s+(.+?)(?:[.!]|$)/i,
  /^I am going to\s+(.+?)(?:[.!]|$)/i,
  /^I promised to\s+(.+?)(?:[.!]|$)/i,
  /^I[''\u2019]m going to\s+(.+?)(?:[.!]|$)/i,
];

// Explicit action item markers
const EXPLICIT_MARKER = /^(?:action item:|todo:|-\s*\[\s*\])\s*(.+)/i;

// "I need to send [person]..."
const I_SEND_PATTERN = /^I need to (?:send|email|message|share|forward)\s+/i;

/**
 * Regex-based action item extraction (private fallback).
 * Contains the original extraction logic.
 */
function extractActionItemsRegex(
  content: string,
  personName: string,
  source: string,
  date: string,
  ownerName?: string,
): PersonActionItem[] {
  const items: PersonActionItem[] = [];
  const lines = content.split('\n');
  const personSlug = slugify(personName);
  const seenHashes = new Set<string>();

  function addItem(text: string, direction: ActionItemDirection): void {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 5) return;
    const hash = computeActionItemHash(cleaned, personSlug, direction);
    if (seenHashes.has(hash)) return;
    seenHashes.add(hash);
    items.push({
      text: cleaned,
      direction,
      source,
      date,
      hash,
      stale: false, // caller can compute staleness later
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lineRefsPerson = mentionsPerson(trimmed, personName);

    // --- Explicit markers: "Action item:", "TODO:", "- [ ]" ---
    const explicitMatch = trimmed.match(EXPLICIT_MARKER);
    if (explicitMatch && lineRefsPerson) {
      const actionText = explicitMatch[1].trim();
      // Classify by actor
      if (isOwnerActor(actionText, ownerName)) {
        addItem(actionText, 'i_owe_them');
      } else if (isPersonActor(actionText, personName)) {
        addItem(actionText, 'they_owe_me');
      } else {
        // Ambiguous: check if person is mentioned as recipient
        addItem(actionText, lineRefsPerson ? 'they_owe_me' : 'i_owe_them');
      }
      continue;
    }

    // --- "I need to send [person]..." ---
    if (I_SEND_PATTERN.test(trimmed) && lineRefsPerson) {
      addItem(trimmed, 'i_owe_them');
      continue;
    }

    // --- First-person patterns near person mention ---
    if (lineRefsPerson) {
      let matched = false;
      for (const pat of I_OWE_PATTERNS) {
        const m = trimmed.match(pat);
        if (m) {
          addItem(trimmed, 'i_owe_them');
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Owner name patterns (owner in actor position → i_owe_them)
      if (ownerName && isOwnerActor(trimmed, ownerName)) {
        // Check for action verb following owner name
        const ownerActionPat = new RegExp(
          `^${ownerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:will|agreed to|is going to|promised to|should|needs to)\\s+(.+?)(?:[.!]|$)`,
          'i',
        );
        const ownerMatch = trimmed.match(ownerActionPat);
        if (ownerMatch) {
          addItem(trimmed, 'i_owe_them');
          continue;
        }
      }
    }

    // --- "[Person] will/agreed to/is going to..." ---
    if (lineRefsPerson) {
      for (const pat of THEY_OWE_PATTERNS) {
        const m = trimmed.match(pat);
        if (m) {
          const actor = m[1].trim();
          if (mentionsPerson(actor, personName)) {
            addItem(trimmed, 'they_owe_me');
            break;
          }
          // If owner is the actor
          if (ownerName && personPattern(ownerName).test(actor)) {
            addItem(trimmed, 'i_owe_them');
            break;
          }
        }
      }
    }
  }

  return items;
}

/**
 * Extract action items for a specific person from meeting content.
 *
 * **LLM Path (deprecated)**: When `callLLM` is provided, uses LLM-based extraction via
 * `buildActionItemPrompt` → `callLLM` → `parseActionItemResponse` to distinguish genuine
 * commitments from descriptions, explanations, and general discussion.
 *
 * **Regex Path (active)**: When `callLLM` is NOT provided, falls back to the existing
 * regex implementation — no silent zero-result regression. This path remains available
 * for non-meeting sources (conversations, etc.).
 *
 * @deprecated The LLM path (when callLLM is provided) is deprecated. For meetings, use
 * {@link parseActionItemsFromMeeting} from meeting-parser.ts. The meeting processing
 * workflow now extracts action items during `arete meeting extract` and saves them to
 * structured `## Action Items` sections. The regex fallback (when callLLM is omitted)
 * remains available for potential non-meeting sources.
 *
 * @param content - Meeting notes/transcript text
 * @param personName - Name of the person to extract items for
 * @param source - Meeting filename
 * @param date - Meeting date (YYYY-MM-DD)
 * @param callLLM - Optional LLM function; when omitted, regex fallback runs (deprecated when provided)
 * @param ownerName - Workspace owner name (from profile.md); enables owner detection (regex path only)
 */
export async function extractActionItemsForPerson(
  content: string,
  personName: string,
  source: string,
  date: string,
  callLLM?: LLMCallFn,
  ownerName?: string,
): Promise<PersonActionItem[]> {
  if (!callLLM) {
    return extractActionItemsRegex(content, personName, source, date, ownerName);
  }

  if (!content || content.trim() === '' || !personName || personName.trim() === '') {
    return [];
  }

  const personSlug = slugify(personName);
  const prompt = buildActionItemPrompt(content, personName);

  let rawItems: Array<{ text: string; direction: ActionItemDirection }>;
  try {
    const response = await callLLM(prompt);
    rawItems = parseActionItemResponse(response);
  } catch {
    // LLM call failed — return empty rather than propagating
    return [];
  }

  return rawItems.map(({ text, direction }) => ({
    text,
    direction,
    source,
    date,
    hash: computeActionItemHash(text, personSlug, direction),
    stale: false,
  }));
}
