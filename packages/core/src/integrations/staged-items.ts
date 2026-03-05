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
  StagedItemStatus,
  StagedSections,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------
export type { StagedItem, StagedItemEdits, StagedItemStatus, StagedSections };

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
    const text = itemMatch[2].trim();
    const item: StagedItem = { id, text, type: currentType };

    if (currentType === 'ai') {
      result.actionItems.push(item);
    } else if (currentType === 'de') {
      result.decisions.push(item);
    } else {
      result.learnings.push(item);
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

  // ── 1. Collect approved IDs ──────────────────────────────────────────────
  const statusMap = (data['staged_item_status'] as StagedItemStatus | undefined) ?? {};
  const editsMap = (data['staged_item_edits'] as StagedItemEdits | undefined) ?? {};

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

  const approvedDecisions: StagedItem[] = [];
  const approvedLearnings: StagedItem[] = [];

  for (const item of allItems) {
    if (!approvedIds.has(item.id)) continue;
    const text = editsMap[item.id] ?? item.text;
    const resolvedItem: StagedItem = { ...item, text };
    if (item.type === 'de') approvedDecisions.push(resolvedItem);
    else if (item.type === 'le') approvedLearnings.push(resolvedItem);
    // 'ai' (action items) → intentionally NOT written to memory
  }

  // ── 3. Append to memory files ────────────────────────────────────────────
  await appendToMemoryFile(storage, memoryDir, 'decisions.md', approvedDecisions);
  await appendToMemoryFile(storage, memoryDir, 'learnings.md', approvedLearnings);

  // ── 4. Strip staged sections from body ──────────────────────────────────
  const cleanedBody = removeStagedSections(body);

  // ── 5-6. Update frontmatter ───────────────────────────────────────────────
  delete data['staged_item_status'];
  delete data['staged_item_edits'];
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
 */
async function appendToMemoryFile(
  storage: StorageAdapter,
  memoryDir: string,
  filename: string,
  items: StagedItem[]
): Promise<void> {
  if (items.length === 0) return;

  const filePath = join(memoryDir, filename);
  await storage.mkdir(memoryDir);

  const existing = (await storage.read(filePath)) ?? '';
  const lines = items.map((item) => `- ${item.text}`).join('\n');
  const separator = existing.endsWith('\n') || existing === '' ? '' : '\n';
  await storage.write(filePath, `${existing}${separator}${lines}\n`);
}
