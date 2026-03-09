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
// Types
// ---------------------------------------------------------------------------

/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;

/** Direction of an action item relative to the owner. */
export type ActionItemDirection = 'i_owe_them' | 'they_owe_me';

/** A structured action item extracted from a meeting. */
export type ActionItem = {
  owner: string;
  ownerSlug: string;
  description: string;
  direction: ActionItemDirection;
  counterpartySlug?: string;
  due?: string;
};

/** Full meeting intelligence extracted from a transcript. */
export type MeetingIntelligence = {
  summary: string;
  actionItems: ActionItem[];
  nextSteps: string[];
  decisions: string[];
  learnings: string[];
};

/** Validation warning for rejected items. */
export type ValidationWarning = {
  item: string;
  reason: string;
};

/** Result of parsing extraction response (includes validation warnings). */
export type MeetingExtractionResult = {
  intelligence: MeetingIntelligence;
  validationWarnings: ValidationWarning[];
};

/**
 * Raw JSON shape returned by the LLM (snake_case to match prompt).
 */
type RawExtractionResult = {
  summary?: string;
  action_items?: Array<{
    owner?: string;
    owner_slug?: string;
    description?: string;
    direction?: string;
    counterparty_slug?: string;
    due?: string;
  }>;
  next_steps?: string[];
  decisions?: string[];
  learnings?: string[];
};

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
export function buildMeetingExtractionPrompt(
  transcript: string,
  attendees?: string[],
  ownerSlug?: string,
): string {
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
export function parseMeetingExtractionResponse(response: string): MeetingExtractionResult {
  const emptyResult: MeetingExtractionResult = {
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

  // Parse summary
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  // Parse action items with validation
  if (Array.isArray(raw.action_items)) {
    for (const item of raw.action_items) {
      if (!item || typeof item !== 'object') continue;

      const description = typeof item.description === 'string' ? item.description.trim() : '';
      const owner = typeof item.owner === 'string' ? item.owner.trim() : '';
      const direction = typeof item.direction === 'string' ? item.direction.trim().toLowerCase() : '';

      // Skip items missing required fields
      if (!description || !owner) continue;

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
        direction: direction as ActionItemDirection,
        counterpartySlug: typeof item.counterparty_slug === 'string' 
          ? item.counterparty_slug.trim() || undefined
          : undefined,
        due: typeof item.due === 'string' ? item.due.trim() || undefined : undefined,
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

  // Parse decisions
  const decisions: string[] = [];
  if (Array.isArray(raw.decisions)) {
    for (const decision of raw.decisions) {
      if (typeof decision === 'string' && decision.trim()) {
        decisions.push(decision.trim());
      }
    }
  }

  // Parse learnings
  const learnings: string[] = [];
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
export async function extractMeetingIntelligence(
  transcript: string,
  callLLM: LLMCallFn,
  options?: { attendees?: string[]; ownerSlug?: string },
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
    };
  }

  const prompt = buildMeetingExtractionPrompt(
    transcript,
    options?.attendees,
    options?.ownerSlug,
  );

  try {
    const response = await callLLM(prompt);
    return parseMeetingExtractionResponse(response);
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
  const arrow = item.direction === 'i_owe_them' ? '→' : '←';
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

  // Summary section (always included)
  lines.push('## Summary');
  lines.push(intelligence.summary);
  lines.push('');

  // Staged Action Items (only if non-empty)
  if (intelligence.actionItems.length > 0) {
    lines.push('## Staged Action Items');
    intelligence.actionItems.forEach((item, index) => {
      lines.push(formatActionItem(item, index));
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

  return lines.join('\n');
}

/**
 * Headers that are part of the staged sections.
 * Used to identify where staged content ends and other content begins.
 */
const STAGED_HEADERS = new Set([
  'Summary',
  'Staged Action Items',
  'Staged Decisions',
  'Staged Learnings',
]);

/**
 * Replace or insert staged sections in meeting content.
 * Preserves content before ## Summary and after staged sections.
 * 
 * @param originalContent - The original meeting file content
 * @param stagedSections - The formatted staged sections to insert
 * @returns Updated content with staged sections replaced/inserted
 */
export function updateMeetingContent(originalContent: string, stagedSections: string): string {
  // Find where ## Summary starts (or where to insert)
  const summaryMatch = originalContent.match(/^## Summary\s*$/m);

  if (!summaryMatch) {
    // No existing summary — append staged sections at end
    return originalContent.trimEnd() + '\n\n' + stagedSections;
  }

  // Find the position of ## Summary
  const summaryIndex = originalContent.indexOf(summaryMatch[0]);

  // Get content before ## Summary
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
      if (STAGED_HEADERS.has(headerName)) {
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
