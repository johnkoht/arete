/**
 * Meeting parser — extracts action items from structured `## Action Items` sections.
 *
 * This module provides a pure function parser for action items written by the
 * meeting extraction skill. It parses arrow notation for direction and handles
 * YAML frontmatter for date extraction.
 *
 * Example input format (produced by arete meeting extract + user review):
 * ```markdown
 * ---
 * title: "Weekly Sync"
 * date: "2026-03-04"
 * ---
 *
 * ## Action Items
 *
 * - [ ] John to send API docs to Sarah by Friday (@john-smith → @sarah-chen)
 * - [x] Sarah to review the proposal (@sarah-chen → @mike-jones)
 * ```
 */

import { createHash } from 'node:crypto';
import type { ActionItemDirection } from './person-signals.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedActionItem = {
  text: string;
  direction: ActionItemDirection;
  source: string;
  date: string;
  hash: string;
  stale: boolean;
  completed: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * All arrow notation variations we accept.
 * Order matters for regex construction (longer patterns first).
 */
const ARROW_VARIANTS = ['-->', '=>', '->', '→'] as const;

/**
 * Regex to match the ## Action Items section header.
 * Case-insensitive, allows for variations like "## action items" or "## Action items"
 */
const ACTION_ITEMS_HEADER = /^##\s*Action\s+Items\s*$/im;

/**
 * Regex to detect the next section header (## Something Else).
 */
const NEXT_SECTION_HEADER = /^##\s+/m;

// ---------------------------------------------------------------------------
// Hash computation (mirrors computeActionItemHash in person-signals.ts)
// ---------------------------------------------------------------------------

/**
 * Content-normalized dedup hash: sha256(lowercase(trim(text)) + personSlug + direction).
 *
 * This is intentionally a local replica of computeActionItemHash() to avoid
 * tight coupling — both use the same algorithm.
 */
function computeHash(
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
// YAML frontmatter parsing
// ---------------------------------------------------------------------------

/**
 * Extract date from YAML frontmatter.
 * Returns null if no frontmatter or no date field found.
 */
function extractDateFromFrontmatter(content: string): string | null {
  // Match YAML frontmatter block: starts with ---, ends with ---
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  // Match date field: date: "YYYY-MM-DD" or date: YYYY-MM-DD
  const dateMatch = frontmatter.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m);
  if (!dateMatch) return null;

  return dateMatch[1];
}

// ---------------------------------------------------------------------------
// Action item line parsing
// ---------------------------------------------------------------------------

/**
 * Build regex pattern for arrow notation detection.
 * Handles all variations: →, ->, -->, =>
 * Handles with or without @ prefix on slugs.
 *
 * Pattern: (optional-@)(slug) (arrow) (optional-@)(slug)
 */
function buildArrowPattern(): RegExp {
  // Escape special regex chars in arrows and build alternation
  const arrowAlt = ARROW_VARIANTS.map((a) => a.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
  // Match: (@?slug) (whitespace?) (arrow) (whitespace?) (@?slug)
  // The notation is typically in parentheses at the end
  return new RegExp(
    `\\(\\s*@?([a-z0-9-]+)\\s*(?:${arrowAlt})\\s*@?([a-z0-9-]+)\\s*\\)`,
    'i',
  );
}

const ARROW_PATTERN = buildArrowPattern();

/**
 * Parse a single action item line.
 *
 * Expected format:
 * - [ ] Text here (@owner-slug → @counterparty-slug)
 * - [x] Text here (@owner-slug → @counterparty-slug)
 * - [ ] Text here (no notation — fallback)
 */
type ParsedLine = {
  text: string;
  ownerSlug: string | null;
  counterpartySlug: string | null;
  completed: boolean;
} | null;

function parseActionItemLine(line: string): ParsedLine {
  const trimmed = line.trim();

  // Match checkbox: - [ ] or - [x] or - [X]
  const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s+(.+)$/);
  if (!checkboxMatch) return null;

  const completed = checkboxMatch[1].toLowerCase() === 'x';
  let itemText = checkboxMatch[2].trim();

  // Try to extract arrow notation
  const arrowMatch = itemText.match(ARROW_PATTERN);

  let ownerSlug: string | null = null;
  let counterpartySlug: string | null = null;

  if (arrowMatch) {
    ownerSlug = arrowMatch[1].toLowerCase();
    counterpartySlug = arrowMatch[2].toLowerCase();
    // Strip the notation from text for cleaner display
    itemText = itemText.replace(ARROW_PATTERN, '').trim();
    // Clean up any trailing/leading punctuation artifacts
    itemText = itemText.replace(/\s*,?\s*$/, '').trim();
  }

  if (!itemText) return null;

  return {
    text: itemText,
    ownerSlug,
    counterpartySlug,
    completed,
  };
}

// ---------------------------------------------------------------------------
// Owner name heuristics (fallback when no arrow notation)
// ---------------------------------------------------------------------------

/**
 * Simple slugify for name matching.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Try to infer direction from the text itself when no arrow notation.
 *
 * Uses the owner-name heuristic: if the owner's name appears as the actor
 * at the start of the text, it's i_owe_them.
 *
 * @param text - The action item text
 * @param personSlug - The person we're filtering for
 * @param ownerSlug - The meeting owner's slug (from caller)
 * @returns Direction and whether the item is relevant to personSlug
 */
function inferDirectionFromText(
  text: string,
  personSlug: string,
  ownerSlug: string,
): { direction: ActionItemDirection; relevant: boolean } | null {
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/).slice(0, 4).join(' ');

  // Check if owner appears as actor (start of text)
  const ownerIsActor =
    words.includes(ownerSlug.replace(/-/g, ' ')) ||
    words.includes(ownerSlug.split('-')[0]) ||
    /^i[''\u2019](?:ll|m|ve)\b/i.test(text) ||
    /^i (?:will|need to|agreed to|have to|should)\b/i.test(text);

  // Check if person appears in text at all
  const personInText =
    textLower.includes(personSlug.replace(/-/g, ' ')) ||
    textLower.includes(personSlug.split('-')[0]);

  // Check if person appears as actor
  const personIsActor =
    words.includes(personSlug.replace(/-/g, ' ')) ||
    words.includes(personSlug.split('-')[0]);

  // Case 1: Owner is person, owner is actor → i_owe_them
  if (ownerSlug === personSlug && ownerIsActor) {
    return { direction: 'i_owe_them', relevant: true };
  }

  // Case 2: Owner is person, someone else is actor → they_owe_me (but not relevant unless other person mentioned)
  if (ownerSlug === personSlug && personInText && !ownerIsActor) {
    return { direction: 'they_owe_me', relevant: true };
  }

  // Case 3: Person is NOT owner, but person is the actor → they_owe_me (person owes owner)
  if (ownerSlug !== personSlug && personIsActor) {
    return { direction: 'they_owe_me', relevant: true };
  }

  // Case 4: Person is NOT owner, owner is actor, person is mentioned → i_owe_them (owner owes person)
  if (ownerSlug !== personSlug && ownerIsActor && personInText) {
    return { direction: 'i_owe_them', relevant: true };
  }

  // Item doesn't appear to involve this person
  return null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Extract the ## Action Items section content from meeting markdown.
 * Returns null if no section found.
 */
function extractActionItemsSection(content: string): string | null {
  const headerMatch = content.match(ACTION_ITEMS_HEADER);
  if (!headerMatch || headerMatch.index === undefined) return null;

  // Start after the header
  const startIdx = headerMatch.index + headerMatch[0].length;
  const remaining = content.slice(startIdx);

  // Find the next section header (if any)
  const nextSectionMatch = remaining.match(NEXT_SECTION_HEADER);
  const endIdx = nextSectionMatch?.index ?? remaining.length;

  return remaining.slice(0, endIdx).trim();
}

/**
 * Parse action items from a meeting file's ## Action Items section.
 *
 * This is the main export — a pure function with no I/O.
 *
 * @param content - Full meeting markdown content (including frontmatter)
 * @param personSlug - Filter to items where this person is owner OR counterparty
 * @param ownerSlug - The meeting owner's slug (used for direction inference in fallback)
 * @param source - Meeting filename (passed through to result)
 * @returns Array of parsed action items for this person, or empty array if no section
 */
export function parseActionItemsFromMeeting(
  content: string,
  personSlug: string,
  ownerSlug: string,
  source: string,
): ParsedActionItem[] {
  // Extract date from frontmatter
  const date = extractDateFromFrontmatter(content);
  if (!date) {
    // No date in frontmatter — can't create valid items
    return [];
  }

  // Extract the ## Action Items section
  const section = extractActionItemsSection(content);
  if (!section) {
    // No section found — return empty (not error)
    return [];
  }

  const items: ParsedActionItem[] = [];
  const lines = section.split('\n');

  for (const line of lines) {
    const parsed = parseActionItemLine(line);
    if (!parsed) continue;

    let direction: ActionItemDirection | null = null;
    let relevant = false;

    if (parsed.ownerSlug && parsed.counterpartySlug) {
      // Arrow notation present — use it
      const isOwner = parsed.ownerSlug === personSlug;
      const isCounterparty = parsed.counterpartySlug === personSlug;

      if (isOwner) {
        // Person is the owner (actor) → they owe the counterparty
        // From person's perspective: i_owe_them
        direction = 'i_owe_them';
        relevant = true;
      } else if (isCounterparty) {
        // Person is the counterparty (recipient) → owner owes them
        // From person's perspective: they_owe_me
        direction = 'they_owe_me';
        relevant = true;
      }
    } else {
      // No arrow notation — use owner-name heuristics
      const inferred = inferDirectionFromText(parsed.text, personSlug, ownerSlug);
      if (inferred) {
        direction = inferred.direction;
        relevant = inferred.relevant;
      }
    }

    if (!relevant || !direction) continue;

    const hash = computeHash(parsed.text, personSlug, direction);

    items.push({
      text: parsed.text,
      direction,
      source,
      date,
      hash,
      stale: false, // Caller computes via isActionItemStale()
      completed: parsed.completed,
    });
  }

  return items;
}
