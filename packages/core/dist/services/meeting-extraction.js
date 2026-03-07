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
 */
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
const VALID_DIRECTIONS = new Set(['i_owe_them', 'they_owe_me']);
// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
function countPeriods(text) {
    // Count sentence-ending periods (not abbreviations like "Dr." or "Mr.")
    // Simple heuristic: count periods followed by space or end of string
    const matches = text.match(/\.\s|\.$/g);
    return matches ? matches.length : 0;
}
function isGarbageItem(text) {
    const lower = text.toLowerCase().trim();
    // Check for garbage prefixes
    for (const prefix of GARBAGE_PREFIXES) {
        if (lower.startsWith(prefix)) {
            return `starts with "${prefix}"`;
        }
    }
    // Check length
    if (text.length > MAX_ACTION_ITEM_LENGTH) {
        return `exceeds ${MAX_ACTION_ITEM_LENGTH} characters (${text.length})`;
    }
    // Check for multiple sentences
    if (countPeriods(text) > 1) {
        return 'contains multiple sentences';
    }
    return null;
}
// ---------------------------------------------------------------------------
// Prompt Building
// ---------------------------------------------------------------------------
/**
 * Build the LLM prompt for extracting meeting intelligence.
 *
 * @param transcript - Meeting transcript text
 * @param attendees - List of attendee names (optional, for context)
 * @param ownerSlug - Workspace owner's slug (for direction classification)
 */
export function buildMeetingExtractionPrompt(transcript, attendees, ownerSlug) {
    const attendeeContext = attendees?.length
        ? `\n\nMeeting attendees: ${attendees.join(', ')}`
        : '';
    const ownerContext = ownerSlug
        ? `\nWorkspace owner slug: ${ownerSlug} (use for direction classification)`
        : '';
    return `You are analyzing a meeting transcript to extract structured intelligence.

Extract the following from the meeting below. Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.
${attendeeContext}${ownerContext}

JSON schema:
{
  "summary": "string — 2-3 sentence summary of the meeting",
  "action_items": [
    {
      "owner": "string — full name of person who owns this action",
      "owner_slug": "string — lowercase-hyphenated owner name (e.g., 'john-smith')",
      "description": "string — concise action description (max 150 chars)",
      "direction": "i_owe_them | they_owe_me — relative to workspace owner",
      "counterparty_slug": "string (optional) — the other party involved",
      "due": "string (optional) — due date if mentioned (e.g., 'Friday', '2026-03-10')"
    }
  ],
  "next_steps": ["string — each agreed-upon next step"],
  "decisions": ["string — each decision made"],
  "learnings": ["string — each key insight or learning shared"]
}

## What IS an action item (INCLUDE these):
✓ "John to send API docs to Sarah by Friday"
✓ "Alice will schedule the follow-up meeting"
✓ "I'll have the proposal ready by Monday"
✓ "Bob needs to review the PR before merge"

## What is NOT an action item (EXCLUDE these):
✗ "Me: Yeah, I'll look into that..." — transcript artifacts
✗ "So the way the system works is..." — explanations
✗ "I'm not sure, but maybe we could..." — uncertainty
✗ "Them: We should probably consider..." — vague suggestions
✗ Long descriptions spanning multiple sentences

Rules:
- Return ONLY the JSON object, no other text
- Keep action item descriptions under 150 characters
- Each action item must have a clear owner and specific deliverable
- Direction is relative to workspace owner: "i_owe_them" = owner owes someone, "they_owe_me" = someone owes owner
- Omit sections that have no content (return empty arrays, not null)
- Be conservative: when in doubt, exclude rather than include garbage

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
 */
export function parseMeetingExtractionResponse(response) {
    const emptyResult = {
        intelligence: {
            summary: '',
            actionItems: [],
            nextSteps: [],
            decisions: [],
            learnings: [],
        },
        validationWarnings: [],
    };
    const trimmed = response.trim();
    if (!trimmed)
        return emptyResult;
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
        // Malformed JSON — return empty result
        return emptyResult;
    }
    const validationWarnings = [];
    const actionItems = [];
    // Parse summary
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    // Parse action items with validation
    if (Array.isArray(raw.action_items)) {
        for (const item of raw.action_items) {
            if (!item || typeof item !== 'object')
                continue;
            const description = typeof item.description === 'string' ? item.description.trim() : '';
            const owner = typeof item.owner === 'string' ? item.owner.trim() : '';
            const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';
            // Skip items missing required fields
            if (!description || !owner)
                continue;
            // Validate against garbage patterns
            const garbageReason = isGarbageItem(description);
            if (garbageReason) {
                validationWarnings.push({
                    item: description.slice(0, 50) + (description.length > 50 ? '...' : ''),
                    reason: garbageReason,
                });
                continue;
            }
            // Validate direction
            if (!VALID_DIRECTIONS.has(direction)) {
                validationWarnings.push({
                    item: description.slice(0, 50) + (description.length > 50 ? '...' : ''),
                    reason: `invalid direction "${direction}"`,
                });
                continue;
            }
            const ownerSlug = typeof item.owner_slug === 'string'
                ? item.owner_slug.trim()
                : slugify(owner);
            actionItems.push({
                owner,
                ownerSlug,
                description,
                direction: direction,
                counterpartySlug: typeof item.counterparty_slug === 'string'
                    ? item.counterparty_slug.trim() || undefined
                    : undefined,
                due: typeof item.due === 'string' ? item.due.trim() || undefined : undefined,
            });
        }
    }
    // Parse next steps
    const nextSteps = [];
    if (Array.isArray(raw.next_steps)) {
        for (const step of raw.next_steps) {
            if (typeof step === 'string' && step.trim()) {
                nextSteps.push(step.trim());
            }
        }
    }
    // Parse decisions
    const decisions = [];
    if (Array.isArray(raw.decisions)) {
        for (const decision of raw.decisions) {
            if (typeof decision === 'string' && decision.trim()) {
                decisions.push(decision.trim());
            }
        }
    }
    // Parse learnings
    const learnings = [];
    if (Array.isArray(raw.learnings)) {
        for (const learning of raw.learnings) {
            if (typeof learning === 'string' && learning.trim()) {
                learnings.push(learning.trim());
            }
        }
    }
    return {
        intelligence: {
            summary,
            actionItems,
            nextSteps,
            decisions,
            learnings,
        },
        validationWarnings,
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
 * @param options - Optional attendees and ownerSlug for better context
 * @returns Extracted intelligence with validation warnings — empty on error
 */
export async function extractMeetingIntelligence(transcript, callLLM, options) {
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
        };
    }
    const prompt = buildMeetingExtractionPrompt(transcript, options?.attendees, options?.ownerSlug);
    try {
        const response = await callLLM(prompt);
        return parseMeetingExtractionResponse(response);
    }
    catch {
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
        };
    }
}
//# sourceMappingURL=meeting-extraction.js.map