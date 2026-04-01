/**
 * Staged item utilities for meeting triage.
 *
 * Parses and writes staged action items, decisions, and learnings sections
 * in meeting markdown files. All file I/O uses StorageAdapter.
 */

import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  StagedItem,
  StagedItemEdits,
  StagedItemOwner,
  StagedItemOwnerMeta,
  StagedItemStatus,
  StagedSections,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------
export type { StagedItem, StagedItemEdits, StagedItemOwner, StagedItemOwnerMeta, StagedItemStatus, StagedSections };

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

type FrontmatterResult = {
  data: Record<string, unknown>;
  body: string;
};

function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  return {
    data: parseYaml(match[1]) as Record<string, unknown>,
    body: match[2],
  };
}

function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const fm = stringifyYaml(data).trimEnd();
  return `---\n${fm}\n---\n\n${body.replace(/^\n+/, '')}`;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Padded counter → "001", "042", etc. */
function pad(n: number): string {
  return String(n).padStart(3, '0');
}

const PREFIX_MAP: Record<StagedItem['type'], string> = {
  ai: 'ai',
  de: 'de',
  le: 'le',
};

/**
 * Generate a staged item ID.
 *
 * @param type   - Item type: 'ai' | 'de' | 'le'
 * @param index  - 1-based index within its section
 */
export function generateItemId(type: StagedItem['type'], index: number): string {
  return `${PREFIX_MAP[type]}_${pad(index)}`;
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

const SECTION_HEADERS: Record<string, StagedItem['type']> = {
  'staged action items': 'ai',
  'staged decisions': 'de',
  'staged learnings': 'le',
};

const ITEM_PATTERN = /^-\s+((?:ai|de|le)_\d+):\s+(.+)$/;

/**
 * Pattern to extract owner/direction/counterparty from action item text.
 * Matches: [@owner-slug → @counterparty-slug] description
 * Or: [@owner-slug →] description (no counterparty)
 * Direction: → means i_owe_them, ← means they_owe_me
 */
const OWNER_PATTERN = /^\[@([a-z0-9-]+)\s*([→←])\s*(?:@([a-z0-9-]+))?\]\s*(.+)$/i;

/**
 * Parse owner/direction/counterparty from action item text.
 * Returns the extracted fields and the cleaned description.
 */
function parseOwnerFromText(text: string): {
  ownerSlug?: string;
  direction?: 'i_owe_them' | 'they_owe_me';
  counterpartySlug?: string;
  description: string;
} {
  const match = text.match(OWNER_PATTERN);
  if (!match) {
    return { description: text };
  }
  
  const [, ownerSlug, arrow, counterpartySlug, description] = match;
  const direction = arrow === '→' ? 'i_owe_them' : 'they_owe_me';
  
  return {
    ownerSlug,
    direction,
    counterpartySlug: counterpartySlug || undefined,
    description: description.trim(),
  };
}

/**
 * Parse `## Staged Action Items`, `## Staged Decisions`, and
 * `## Staged Learnings` sections from meeting body markdown.
 *
 * - Case-insensitive header matching
 * - Returns empty arrays (never throws) if sections are missing
 * - Skips lines that don't match the `- <id>: <text>` pattern
 */
export function parseStagedSections(body: string): StagedSections {
  const result: StagedSections = {
    actionItems: [],
    decisions: [],
    learnings: [],
  };

  const lines = body.split('\n');
  let currentType: StagedItem['type'] | null = null;

  for (const line of lines) {
    // Check for a section header
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const normalized = headerMatch[1].trim().toLowerCase();
      currentType = SECTION_HEADERS[normalized] ?? null;
      continue;
    }

    // If we encounter a different ## header (not staged), stop current section
    if (line.match(/^##+\s/) && currentType !== null) {
      currentType = null;
      continue;
    }

    if (currentType === null) continue;

    // Parse item line
    const itemMatch = line.match(ITEM_PATTERN);
    if (!itemMatch) continue;

    const id = itemMatch[1];
    const rawText = itemMatch[2].trim();
    
    // For action items, try to parse owner/direction from the text
    if (currentType === 'ai') {
      const { ownerSlug, direction, counterpartySlug, description } = parseOwnerFromText(rawText);
      const item: StagedItem = {
        id,
        text: description,  // Use cleaned description without owner prefix
        type: currentType,
        source: 'ai',
        ownerSlug,
        direction,
        counterpartySlug,
      };
      result.actionItems.push(item);
    } else {
      // Decisions and learnings don't have owner notation
      const item: StagedItem = { id, text: rawText, type: currentType, source: 'ai' };
      if (currentType === 'de') {
        result.decisions.push(item);
      } else {
        result.learnings.push(item);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Frontmatter status accessors
// ---------------------------------------------------------------------------

/**
 * Parse `staged_item_status` from meeting file frontmatter.
 * Returns an empty object if the file has no frontmatter or the field is absent.
 */
export function parseStagedItemStatus(content: string): StagedItemStatus {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_status'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as StagedItemStatus;
}

/**
 * Parse the `staged_item_edits` frontmatter field from raw markdown content.
 * Returns a map of item IDs to edited text strings.
 */
export function parseStagedItemEdits(content: string): StagedItemEdits {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_edits'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as StagedItemEdits;
}

/**
 * Parse the `staged_item_owner` frontmatter field from raw markdown content.
 * Returns a map of item IDs to owner metadata (ownerSlug, direction, counterpartySlug).
 */
export function parseStagedItemOwner(content: string): StagedItemOwner {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_owner'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  
  // Validate and normalize the structure
  const result: StagedItemOwner = {};
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const m = meta as Record<string, unknown>;
    const ownerMeta: StagedItemOwnerMeta = {};
    
    if (typeof m['ownerSlug'] === 'string') {
      ownerMeta.ownerSlug = m['ownerSlug'];
    }
    if (m['direction'] === 'i_owe_them' || m['direction'] === 'they_owe_me') {
      ownerMeta.direction = m['direction'];
    }
    if (typeof m['counterpartySlug'] === 'string') {
      ownerMeta.counterpartySlug = m['counterpartySlug'];
    }
    
    // Only include if we have at least one valid field
    if (ownerMeta.ownerSlug || ownerMeta.direction || ownerMeta.counterpartySlug) {
      result[id] = ownerMeta;
    }
  }
  
  return result;
}

// ---------------------------------------------------------------------------
// writeItemStatusToFile
// ---------------------------------------------------------------------------

export type WriteItemStatusOptions = {
  /** New status to set on the item */
  status: 'approved' | 'skipped' | 'pending';
  /** Optional edited text to store alongside the status */
  editedText?: string;
};

/**
 * Update `staged_item_status` (and optionally `staged_item_edits`) for a
 * single item in a meeting file's frontmatter.
 *
 * Uses read-parse-update-write to avoid corrupting other frontmatter fields.
 */
export async function writeItemStatusToFile(
  storage: StorageAdapter,
  filePath: string,
  itemId: string,
  options: WriteItemStatusOptions
): Promise<void> {
  const raw = await storage.read(filePath);
  if (raw === null) throw new Error(`Meeting file not found: ${filePath}`);

  const { data, body } = parseFrontmatter(raw);

  // Initialize maps if absent
  if (!data['staged_item_status'] || typeof data['staged_item_status'] !== 'object') {
    data['staged_item_status'] = {};
  }
  if (!data['staged_item_edits'] || typeof data['staged_item_edits'] !== 'object') {
    data['staged_item_edits'] = {};
  }

  (data['staged_item_status'] as StagedItemStatus)[itemId] = options.status;

  if (options.editedText !== undefined) {
    (data['staged_item_edits'] as StagedItemEdits)[itemId] = options.editedText;
  }

  await storage.write(filePath, serializeFrontmatter(data, body));
}

// ---------------------------------------------------------------------------
// Action item formatting
// ---------------------------------------------------------------------------

/**
 * Format an action item with owner arrow notation for the approved section.
 * 
 * Output formats:
 * - With owner and counterparty: "Text here (@owner-slug → @counterparty-slug)"
 * - With owner only: "Text here (@owner-slug)"
 * - Without owner info: "Text here"
 */
function formatActionItemWithOwner(item: StagedItem): string {
  if (!item.ownerSlug) {
    return item.text;
  }
  
  if (item.counterpartySlug) {
    return `${item.text} (@${item.ownerSlug} → @${item.counterpartySlug})`;
  }
  
  return `${item.text} (@${item.ownerSlug})`;
}

// ---------------------------------------------------------------------------
// Meeting metadata for memory file entries
// ---------------------------------------------------------------------------

/**
 * Metadata extracted from meeting frontmatter for memory file entries.
 */
export type MeetingMetadata = {
  /** Meeting title */
  title: string;
  /** Meeting date (YYYY-MM-DD) */
  date: string;
  /** Source string: "Meeting Title (Attendee1, Attendee2)" */
  source: string;
};

/**
 * Extract meeting metadata from frontmatter for memory file entries.
 */
function extractMeetingMetadata(data: Record<string, unknown>): MeetingMetadata {
  const title = typeof data['title'] === 'string' ? data['title'] : 'Unknown Meeting';
  
  // Parse date - handle ISO strings and YYYY-MM-DD
  let date = 'Unknown';
  if (typeof data['date'] === 'string') {
    // Extract YYYY-MM-DD from ISO string or use as-is
    const dateMatch = data['date'].match(/^(\d{4}-\d{2}-\d{2})/);
    date = dateMatch ? dateMatch[1] : data['date'].slice(0, 10);
  }
  
  // Build attendee names list
  const attendeeNames: string[] = [];
  const attendees = data['attendees'];
  if (Array.isArray(attendees)) {
    for (const att of attendees) {
      if (typeof att === 'string') {
        attendeeNames.push(att);
      } else if (att && typeof att === 'object' && 'name' in att && typeof att.name === 'string') {
        attendeeNames.push(att.name);
      }
    }
  }
  
  // Build source string: "Meeting Title (Attendee1, Attendee2)"
  const source = attendeeNames.length > 0
    ? `${title} (${attendeeNames.join(', ')})`
    : title;
  
  return { title, date, source };
}

/**
 * Generate a short title from item text (first sentence or truncated).
 */
function generateEntryTitle(text: string): string {
  // Take first sentence or first 80 chars, whichever is shorter
  const firstSentence = text.match(/^[^.!?]+[.!?]?/);
  const candidate = firstSentence ? firstSentence[0].trim() : text;
  
  if (candidate.length <= 80) {
    // Remove trailing punctuation for cleaner headers
    return candidate.replace(/[.!?]+$/, '').trim();
  }
  
  // Truncate at word boundary
  const truncated = candidate.slice(0, 77).replace(/\s+\S*$/, '');
  return truncated + '...';
}

// ---------------------------------------------------------------------------
// commitApprovedItems
// ---------------------------------------------------------------------------

/**
 * Commit all approved staged items:
 *
 * 1. Collect approved item IDs from `staged_item_status`
 * 2. Cross-reference with parsed sections (use `staged_item_edits` text if available)
 * 3. Append approved decisions → `.arete/memory/items/decisions.md`
 *    Append approved learnings  → `.arete/memory/items/learnings.md`
 *    (Action items are NOT written to memory — they are task-tracking only)
 * 4. Strip all `## Staged *` sections (headers + their items) from the body
 * 5. Clear `staged_item_status` and `staged_item_edits` from frontmatter
 * 6. Set `status: 'approved'` and `approved_at: <ISO timestamp>` in frontmatter
 * 7. Write the cleaned meeting file back
 */
export async function commitApprovedItems(
  storage: StorageAdapter,
  filePath: string,
  memoryDir: string
): Promise<void> {
  const raw = await storage.read(filePath);
  if (raw === null) throw new Error(`Meeting file not found: ${filePath}`);

  const { data, body } = parseFrontmatter(raw);
  
  // Extract meeting metadata for memory file entries
  const meetingMeta = extractMeetingMetadata(data);

  // ── 1. Collect approved IDs ──────────────────────────────────────────────
  const statusMap = (data['staged_item_status'] as StagedItemStatus | undefined) ?? {};
  const editsMap = (data['staged_item_edits'] as StagedItemEdits | undefined) ?? {};
  const ownerMap = parseStagedItemOwner(raw);

  const approvedIds = new Set(
    Object.entries(statusMap)
      .filter(([, v]) => v === 'approved')
      .map(([k]) => k)
  );

  // ── 2. Cross-reference with parsed sections ──────────────────────────────
  const sections = parseStagedSections(body);
  const allItems = [
    ...sections.actionItems,
    ...sections.decisions,
    ...sections.learnings,
  ];

  const approvedActionItems: StagedItem[] = [];
  const approvedDecisions: StagedItem[] = [];
  const approvedLearnings: StagedItem[] = [];

  for (const item of allItems) {
    if (!approvedIds.has(item.id)) continue;
    const text = editsMap[item.id] ?? item.text;
    
    // Apply owner metadata from frontmatter (for action items)
    const ownerMeta = ownerMap[item.id];
    const resolvedItem: StagedItem = {
      ...item,
      text,
      // Owner metadata from frontmatter takes precedence over text-parsed values
      ownerSlug: ownerMeta?.ownerSlug ?? item.ownerSlug,
      direction: ownerMeta?.direction ?? item.direction,
      counterpartySlug: ownerMeta?.counterpartySlug ?? item.counterpartySlug,
    };
    
    if (item.type === 'ai') approvedActionItems.push(resolvedItem);
    else if (item.type === 'de') approvedDecisions.push(resolvedItem);
    else if (item.type === 'le') approvedLearnings.push(resolvedItem);
  }

  // ── 3. Append to memory files ────────────────────────────────────────────
  // Action items stay in the meeting file (not in memory)
  await appendToMemoryFile(storage, memoryDir, 'decisions.md', approvedDecisions, meetingMeta);
  await appendToMemoryFile(storage, memoryDir, 'learnings.md', approvedLearnings, meetingMeta);

  // ── 4. Strip staged sections from body ──────────────────────────────────
  let cleanedBody = removeStagedSections(body);

  // ── 4.5 Write approved items to markdown sections ──
  // Build all approved sections (action items, decisions, learnings)
  // Action items include owner arrow notation for commitment tracking
  let approvedSections = '';
  
  if (approvedActionItems.length > 0) {
    approvedSections += '\n## Approved Action Items\n' +
      approvedActionItems.map(item => `- [ ] ${formatActionItemWithOwner(item)}`).join('\n') + '\n';
  }
  
  if (approvedDecisions.length > 0) {
    approvedSections += '\n## Approved Decisions\n' +
      approvedDecisions.map(item => `- ${item.text}`).join('\n') + '\n';
  }
  
  if (approvedLearnings.length > 0) {
    approvedSections += '\n## Approved Learnings\n' +
      approvedLearnings.map(item => `- ${item.text}`).join('\n') + '\n';
  }
  
  // Insert before ## Transcript if it exists, otherwise append
  if (approvedSections) {
    const transcriptIndex = cleanedBody.indexOf('\n## Transcript');
    if (transcriptIndex !== -1) {
      cleanedBody = cleanedBody.slice(0, transcriptIndex) + approvedSections + cleanedBody.slice(transcriptIndex);
    } else {
      cleanedBody = cleanedBody + approvedSections;
    }
  }

  // ── 4.6 Store approved items in frontmatter for UI display ───────────────
  // Action items include owner notation for commitment tracking consistency
  data['approved_items'] = {
    actionItems: approvedActionItems.map(i => formatActionItemWithOwner(i)),
    decisions: approvedDecisions.map(i => i.text),
    learnings: approvedLearnings.map(i => i.text),
  };

  // ── 5-6. Update frontmatter ───────────────────────────────────────────────
  delete data['staged_item_status'];
  delete data['staged_item_edits'];
  delete data['staged_item_owner'];
  delete data['staged_item_source'];
  delete data['staged_item_confidence'];
  data['status'] = 'approved';
  data['approved_at'] = new Date().toISOString();

  // ── 7. Write cleaned file ─────────────────────────────────────────────────
  await storage.write(filePath, serializeFrontmatter(data, cleanedBody));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove all `## Staged *` sections (header line + their item lines) from body.
 * Stops removing lines when the next `##` header or end of file is reached.
 */
function removeStagedSections(body: string): string {
  const lines = body.split('\n');
  const output: string[] = [];
  let inStagedSection = false;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const normalized = headerMatch[1].trim().toLowerCase();
      if (normalized in SECTION_HEADERS) {
        inStagedSection = true;
        continue; // skip this header line
      } else {
        inStagedSection = false;
      }
    }

    if (!inStagedSection) {
      output.push(line);
    }
  }

  // Trim trailing blank lines
  while (output.length > 0 && output[output.length - 1].trim() === '') {
    output.pop();
  }

  return output.join('\n');
}

/**
 * Append a list of approved items to a memory file.
 * Creates the file + directory if they don't exist.
 * 
 * Each item is formatted as a proper entry:
 * ```
 * ## [Title derived from item text]
 * - **Date**: YYYY-MM-DD
 * - **Source**: Meeting Title (Attendees)
 * - Item content
 * ```
 */
async function appendToMemoryFile(
  storage: StorageAdapter,
  memoryDir: string,
  filename: string,
  items: StagedItem[],
  meta: MeetingMetadata
): Promise<void> {
  if (items.length === 0) return;

  const filePath = join(memoryDir, filename);
  await storage.mkdir(memoryDir);

  const existing = (await storage.read(filePath)) ?? '';
  
  // Format each item as a proper memory entry
  const entries = items.map((item) => {
    const entryTitle = generateEntryTitle(item.text);
    return [
      `## ${entryTitle}`,
      `- **Date**: ${meta.date}`,
      `- **Source**: ${meta.source}`,
      `- ${item.text}`,
    ].join('\n');
  }).join('\n\n');
  
  const separator = existing.endsWith('\n') || existing === '' ? '\n' : '\n\n';
  await storage.write(filePath, `${existing}${separator}${entries}\n`);
}
