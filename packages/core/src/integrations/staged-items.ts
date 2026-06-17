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
  StagedItemSkipReason,
  StagedItemSkipReasonMeta,
  StagedItemStatus,
  StagedSections,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------
export type {
  StagedItem,
  StagedItemEdits,
  StagedItemOwner,
  StagedItemOwnerMeta,
  StagedItemSkipReason,
  StagedItemSkipReasonMeta,
  StagedItemStatus,
  StagedSections,
};

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
 * Direction: → means i_owe_them, ← means they_owe_me,
 * · means none (team-internal, single-pass D3 — never a commitment, D7)
 */
const OWNER_PATTERN = /^\[@([a-z0-9-]+)\s*([→←·])\s*(?:@([a-z0-9-]+))?\]\s*(.+)$/i;

/**
 * Parse owner/direction/counterparty from action item text.
 * Returns the extracted fields and the cleaned description.
 */
function parseOwnerFromText(text: string): {
  ownerSlug?: string;
  direction?: 'i_owe_them' | 'they_owe_me' | 'none';
  counterpartySlug?: string;
  description: string;
} {
  const match = text.match(OWNER_PATTERN);
  if (!match) {
    return { description: text };
  }

  const [, ownerSlug, arrow, counterpartySlug, description] = match;
  const direction = arrow === '→' ? 'i_owe_them' : arrow === '·' ? 'none' : 'they_owe_me';

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
    if (m['direction'] === 'i_owe_them' || m['direction'] === 'they_owe_me' || m['direction'] === 'none') {
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

/**
 * Parse the `staged_item_skip_reason` frontmatter field from raw markdown content.
 * Returns a map of item IDs to skip-reason metadata.
 *
 * Phase 10 followup-2: chef may write a skip reason as a STRUCTURAL marker
 * that `commitApprovedItems` honors (via the `'skipped'` status filter on
 * the sibling `staged_item_status` field). The setBy union discriminates
 * provenance — see `StagedItemSkipReasonMeta` JSDoc.
 *
 * Backward compat: returns `{}` for meeting files with no
 * `staged_item_skip_reason` field (M3 first-ship — every pre-existing
 * meeting has no skip_reason).
 *
 * Malformed entries (missing required fields, wrong setBy union value)
 * drop silently. The `commitApprovedItems` consumer is shape-tolerant.
 */
export function parseStagedItemSkipReason(content: string): StagedItemSkipReason {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_skip_reason'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  // Validate and normalize the structure
  const result: StagedItemSkipReason = {};
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const m = meta as Record<string, unknown>;

    // Required fields: reason (string), evidence (string), setBy (union), setAt (string)
    if (typeof m['reason'] !== 'string') continue;
    if (typeof m['evidence'] !== 'string') continue;
    if (typeof m['setAt'] !== 'string') continue;
    if (
      m['setBy'] !== 'chef' &&
      m['setBy'] !== 'chef-proposed' &&
      m['setBy'] !== 'user'
    ) continue;

    result[id] = {
      reason: m['reason'],
      evidence: m['evidence'],
      setBy: m['setBy'],
      setAt: m['setAt'],
      // Issue C: optional linkable dedup target. Non-string entries drop
      // (the rest of the entry is still valid).
      ...(typeof m['matchedRef'] === 'string' && m['matchedRef'].trim() !== ''
        ? { matchedRef: m['matchedRef'] }
        : {}),
    };
  }

  return result;
}

/**
 * Parse the `staged_item_importance` frontmatter field (single_pass D3).
 * Map of item id → importance tier. Entries with an unrecognized value drop.
 */
export function parseStagedItemImportance(
  content: string,
): Record<string, 'blocker' | 'high' | 'normal'> {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_importance'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, 'blocker' | 'high' | 'normal'> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === 'blocker' || v === 'high' || v === 'normal') result[id] = v;
  }
  return result;
}

/**
 * Parse the `staged_item_uncertain` frontmatter field (single_pass D3, the ⚠
 * channel). Map of item id → uncertainty reason string. PRESENCE of an entry
 * (even an empty string) means the item is uncertain. Non-string entries drop.
 */
export function parseStagedItemUncertain(content: string): Record<string, string> {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_uncertain'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') result[id] = v;
  }
  return result;
}

/**
 * Parse the `staged_item_links` frontmatter field (single_pass D3).
 * Map of item id → `{ continuationOf?, supersedes? }`. Entries with no valid
 * string field drop.
 */
export function parseStagedItemLinks(
  content: string,
): Record<string, { continuationOf?: string; supersedes?: string }> {
  const { data } = parseFrontmatter(content);
  const raw = data['staged_item_links'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, { continuationOf?: string; supersedes?: string }> = {};
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const m = meta as Record<string, unknown>;
    const link: { continuationOf?: string; supersedes?: string } = {};
    if (typeof m['continuationOf'] === 'string') link.continuationOf = m['continuationOf'];
    if (typeof m['supersedes'] === 'string') link.supersedes = m['supersedes'];
    if (link.continuationOf || link.supersedes) result[id] = link;
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

  // Initialize the status map if absent.
  if (!data['staged_item_status'] || typeof data['staged_item_status'] !== 'object') {
    data['staged_item_status'] = {};
  }

  (data['staged_item_status'] as StagedItemStatus)[itemId] = options.status;

  // N2: only touch `staged_item_edits` when there is edited text to record —
  // a status-only write (e.g. a skip with no amendment) must not leave an
  // empty `staged_item_edits: {}` map in the frontmatter. The reader
  // (`parseStagedItemEdits`) already treats an absent map as `{}`, so this is
  // safe and keeps the serialized frontmatter clean.
  if (options.editedText !== undefined) {
    if (!data['staged_item_edits'] || typeof data['staged_item_edits'] !== 'object') {
      data['staged_item_edits'] = {};
    }
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
 * Arrow encodes direction relative to workspace owner:
 * - `→` = i_owe_them (workspace owner owes counterparty)
 * - `←` = they_owe_me (counterparty owes workspace owner)
 *
 * Output formats:
 * - With owner and counterparty: "Text here (@owner-slug → @counterparty-slug)"
 * - With owner only: "Text here (@owner-slug →)"
 * - Without owner info: "Text here"
 */
function formatActionItemWithOwner(item: StagedItem): string {
  if (!item.ownerSlug) {
    return item.text;
  }

  // `·` = direction none (single-pass D3): deliberately NOT an arrow so the
  // commitment-creating parsers (meeting-parser.ts ARROW_PATTERN /
  // APPROVED_OWNER_PATTERN) never read an approved none-item as a
  // directional commitment (D7 inertness).
  const arrow = item.direction === 'they_owe_me' ? '←' : item.direction === 'none' ? '·' : '→';

  if (item.counterpartySlug) {
    return `${item.text} (@${item.ownerSlug} ${arrow} @${item.counterpartySlug})`;
  }

  return `${item.text} (@${item.ownerSlug} ${arrow})`;
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
  /** Topic slugs associated with the meeting (defaults to []) */
  topics: string[];
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

  // Topic slugs from frontmatter (set by meeting-apply.ts after alias/merge).
  // Defaults to [] when missing or malformed — never undefined.
  const topics: string[] = [];
  const rawTopics = data['topics'];
  if (Array.isArray(rawTopics)) {
    for (const t of rawTopics) {
      if (typeof t === 'string' && t.trim() !== '') {
        topics.push(t);
      }
    }
  }

  return { title, date, source, topics };
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
 * Per-item callback invoked once per approved item AFTER the meeting file
 * is written. Phase 0 instrumentation hook — callers plumb item-fate event
 * writes here without `commitApprovedItems` itself owning a storage-level
 * dependency on `MemoryLogService`.
 *
 * Errors thrown from the callback are caught internally by
 * `commitApprovedItems` and logged to stderr; the commit always completes
 * normally even if instrumentation fails. Callers may still wrap their
 * observers in try/catch as defense in depth, but it is no longer a
 * correctness requirement.
 */
export type ApprovedItemObserver = (item: ApprovedItemRecord) => Promise<void>;

export interface ApprovedItemRecord {
  /** Frontmatter id (e.g. `ai_001`, `de_002`, `le_003`). */
  id: string;
  /** Mapped to memory-log fate kinds: action_item / decision / learning. */
  kind: 'action_item' | 'decision' | 'learning';
  /** Final committed text (post-edits when `staged_item_edits` overrode). */
  text: string;
  /** Recorded confidence at extraction time, when known. */
  confidence: number | null;
}

/**
 * Per-skipped-item callback invoked once per skipped item AFTER the meeting
 * file is written. Phase 10 followup-2 AC9 / PM C3 instrumentation hook —
 * callers wire this to `appendChefSkipLog(..., { action: 'APPLY-SKIP', ... })`
 * to record the apply-time honoring of chef's skip signal.
 *
 * Errors thrown from the callback are caught internally; the commit always
 * completes normally even if instrumentation fails.
 */
export type SkippedItemObserver = (item: SkippedItemRecord) => Promise<void>;

export interface SkippedItemRecord {
  /** Frontmatter id (e.g. `ai_001`). */
  id: string;
  /** Skip reason text, if `staged_item_skip_reason[id]` was populated. */
  reason: string | null;
  /** Evidence reference, if `staged_item_skip_reason[id]` was populated. */
  evidence: string | null;
  /** Provenance, if `staged_item_skip_reason[id]` was populated. */
  setBy: 'chef' | 'chef-proposed' | 'user' | null;
}

export interface CommitApprovedItemsOptions {
  /** Phase 0 instrumentation. */
  onApproved?: ApprovedItemObserver;
  /**
   * Phase 10 followup-2 AC9: per-skipped-item callback. Receives one
   * SkippedItemRecord per `'skipped'`-status item dropped by the apply
   * filter. Callers typically wire this to `appendChefSkipLog` with
   * `action: 'APPLY-SKIP'`.
   */
  onSkipped?: SkippedItemObserver;
}

const STAGED_TYPE_TO_FATE_KIND: Record<StagedItem['type'], ApprovedItemRecord['kind']> = {
  ai: 'action_item',
  de: 'decision',
  le: 'learning',
};

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
 * 8. (Phase 0) Fire `options.onApproved` once per committed item.
 *    Observer failures are caught internally and logged to stderr — the
 *    commit always succeeds even if instrumentation throws.
 */
export async function commitApprovedItems(
  storage: StorageAdapter,
  filePath: string,
  memoryDir: string,
  options: CommitApprovedItemsOptions = {}
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
  // Snapshot confidence map BEFORE the frontmatter cleanup deletes it; the
  // observer needs it for the fate event.
  const confidenceMap = (data['staged_item_confidence'] as Record<string, number> | undefined) ?? {};
  // Phase 10 followup-2 — snapshot skip_reason BEFORE the v3/F5 cleanup
  // filters it; we need full payloads to render the "## Skipped on Apply"
  // section + emit APPLY-SKIP audit events.
  const skipReasonMap = parseStagedItemSkipReason(raw);

  const approvedIds = new Set(
    Object.entries(statusMap)
      .filter(([, v]) => v === 'approved')
      .map(([k]) => k)
  );
  // Phase 10 followup-2 — IDs whose status is explicitly `'skipped'` get
  // their skip-reason metadata surfaced in the "## Skipped on Apply"
  // section + an APPLY-SKIP audit line (AC3, AC9, PM C3). Pending items
  // are NOT in this set even when they have a `chef-proposed` skip_reason
  // — those lapse through to the normal staging flow (week-1 gate).
  const skippedIds = new Set(
    Object.entries(statusMap)
      .filter(([, v]) => v === 'skipped')
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

  // Phase 10 followup-2 — Skipped on Apply audit section.
  // Lists every staged item dropped because `staged_item_status === 'skipped'`,
  // along with its skip reason if `staged_item_skip_reason` was populated.
  // This puts the audit trail in the meeting body permanently AFTER the
  // sibling-field cleanup below (Step 4a) clears the frontmatter.
  if (skippedIds.size > 0) {
    const skippedLines: string[] = [];
    for (const item of allItems) {
      if (!skippedIds.has(item.id)) continue;
      const reasonMeta = skipReasonMap[item.id];
      // Use edited text if user override is present; else the original text.
      const text = editsMap[item.id] ?? item.text;
      if (reasonMeta) {
        const ts = reasonMeta.setAt.replace(/T/, ' ').replace(/:\d{2}(?:\.\d+)?Z?$/, '');
        skippedLines.push(
          `- [${item.id}] ${text}  ↪ skipped: ${reasonMeta.reason} (${reasonMeta.setBy}, ${ts})`,
        );
      } else {
        // Extract-time skip (no skip_reason) — surface without reason.
        skippedLines.push(`- [${item.id}] ${text}  ↪ skipped (extract-time, no reason recorded)`);
      }
    }
    if (skippedLines.length > 0) {
      approvedSections += '\n## Skipped on Apply\n' + skippedLines.join('\n') + '\n';
    }
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

  // ── 4.6 Approved items live in the body (## Approved sections) ───────────
  // Phase 2 (Areté v2): the `frontmatter.approved_items` duplicate is gone.
  // Body sections written above (## Approved Action Items / Decisions /
  // Learnings) are the single source of truth. Web review UI + CLI
  // reconciliation parse from the body.
  //
  // Old shape (removed): `data['approved_items'] = {...}` — third-copy
  // duplicate that existed only because the web UI used to read it.

  // Defensive cleanup: remove any pre-Phase-2 `approved_items` field on
  // re-approval. Idempotent — no-op when the field doesn't exist.
  delete data['approved_items'];

  // ── 5-6. Update frontmatter (Step 4a, v3 F5 fix) ──────────────────────────
  //
  // BEFORE (pre-followup-2 bug):
  //   delete data['staged_item_status']; delete data['staged_item_edits']; ...
  // wholesale-deleted ALL sibling fields regardless of which IDs were
  // committed. That clobbered chef-proposed skip_reason entries on
  // pending items + lost the user's `[[unskip]]` work because the
  // unsked-back-to-pending item disappeared from frontmatter on next
  // apply.
  //
  // AFTER (v3 F5): filter each map by approvedIds. Pending items
  // (chef-proposed OR bare-extract) + skipped items the user [[unskip]]'d
  // back to pending retain their sibling fields for the next round.
  // Only committed items lose their bookkeeping. Closes F5 + enables
  // AC11 (week-1 unskip survival).
  //
  // single_pass + finding #12: the single_pass judgment maps
  // (`staged_item_importance` / `_uncertain` / `_links`) MUST be filtered
  // alongside the originals. Pre-fix they were absent from this list, so a
  // full approve stripped `staged_item_owner` (an approved-ID entry) while
  // LEAVING the judgment maps behind — an inconsistency that left orphan
  // tier/⚠ bookkeeping for committed items and made a post-approve render
  // show tiers without owner (the asymmetry diagnosed in finding #12). All
  // staged sibling maps are now filtered the same way, so a committed item
  // loses ALL its bookkeeping and the surviving (pending/skipped) items keep
  // every map consistently.
  for (const key of [
    'staged_item_status',
    'staged_item_edits',
    'staged_item_owner',
    'staged_item_source',
    'staged_item_confidence',
    'staged_item_skip_reason',
    'staged_item_importance',
    'staged_item_uncertain',
    'staged_item_links',
  ] as const) {
    const map = data[key] as Record<string, unknown> | undefined;
    if (map === undefined) continue;
    const filtered = Object.fromEntries(
      Object.entries(map).filter(([id]) => !approvedIds.has(id)),
    );
    if (Object.keys(filtered).length === 0) {
      // All entries were for approved IDs OR the map was already empty —
      // preserve the legacy post-apply shape (drop the key entirely).
      delete data[key];
    } else {
      data[key] = filtered;
    }
  }
  data['status'] = 'approved';
  data['approved_at'] = new Date().toISOString();

  // ── 7. Write cleaned file ─────────────────────────────────────────────────
  await storage.write(filePath, serializeFrontmatter(data, cleanedBody));

  // ── 8. Phase 0 instrumentation — fire onApproved per committed item ──────
  if (options.onApproved !== undefined) {
    const approvedRecords: ApprovedItemRecord[] = [];
    for (const item of approvedActionItems) {
      approvedRecords.push({
        id: item.id,
        kind: STAGED_TYPE_TO_FATE_KIND[item.type],
        text: item.text,
        confidence: confidenceMap[item.id] ?? null,
      });
    }
    for (const item of approvedDecisions) {
      approvedRecords.push({
        id: item.id,
        kind: STAGED_TYPE_TO_FATE_KIND[item.type],
        text: item.text,
        confidence: confidenceMap[item.id] ?? null,
      });
    }
    for (const item of approvedLearnings) {
      approvedRecords.push({
        id: item.id,
        kind: STAGED_TYPE_TO_FATE_KIND[item.type],
        text: item.text,
        confidence: confidenceMap[item.id] ?? null,
      });
    }
    for (const record of approvedRecords) {
      try {
        await options.onApproved(record);
      } catch (err) {
        // Phase 0 instrumentation must never break the commit. A future
        // caller may forget to wrap the observer, so we trap here.
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[commitApprovedItems] onApproved observer failed for ${record.kind} ${record.id}: ${msg}\n`);
      }
    }
  }

  // ── 9. Phase 10 followup-2 — fire onSkipped per skipped item (AC9) ──────
  if (options.onSkipped !== undefined) {
    for (const id of skippedIds) {
      const meta = skipReasonMap[id];
      const record: SkippedItemRecord = {
        id,
        reason: meta?.reason ?? null,
        evidence: meta?.evidence ?? null,
        setBy: meta?.setBy ?? null,
      };
      try {
        await options.onSkipped(record);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[commitApprovedItems] onSkipped observer failed for ${id}: ${msg}\n`,
        );
      }
    }
  }
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
 * - **Topics**: slug-a, slug-b   (omitted entirely when meta.topics is empty)
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
    const lines: string[] = [
      `## ${entryTitle}`,
      `- **Date**: ${meta.date}`,
      `- **Source**: ${meta.source}`,
    ];
    if (meta.topics.length > 0) {
      lines.push(`- **Topics**: ${meta.topics.join(', ')}`);
    }
    lines.push(`- ${item.text}`);
    return lines.join('\n');
  }).join('\n\n');

  const separator = existing.endsWith('\n') || existing === '' ? '\n' : '\n\n';
  await storage.write(filePath, `${existing}${separator}${entries}\n`);
}
