/**
 * Workspace service — meeting file operations for the backend.
 * Uses gray-matter for frontmatter parsing and @arete/core for file I/O.
 */

import { join } from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import {
  FileStorageAdapter,
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemEdits,
  parseStagedItemOwner,
  writeItemStatusToFile,
  commitApprovedItems,
  loadConfig,
  refreshQmdIndex,
  createServices,
  extractAttendeeSlugs,
  inferUrgency,
  PEOPLE_CATEGORIES,
} from '@arete/core';
import type { WriteItemStatusOptions, TaskDestination, UrgencyBucket } from '@arete/core';
import type { MeetingSummary, FullMeeting } from '../types.js';

const storage = new FileStorageAdapter();

function meetingsDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'resources', 'meetings');
}

function slugToPath(workspaceRoot: string, slug: string): string {
  return join(meetingsDir(workspaceRoot), `${slug}.md`);
}

/**
 * Safely extract a date string from frontmatter.
 * YAML may parse unquoted dates as Date objects, so handle both string and Date.
 */
function extractDate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return '';
}

function parseAttendees(
  raw: unknown
): Array<{ name: string; email: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    if (typeof a === 'string') return { name: a, email: '' };
    if (a && typeof a === 'object') {
      const obj = a as Record<string, unknown>;
      return {
        name: typeof obj['name'] === 'string' ? obj['name'] : '',
        email: typeof obj['email'] === 'string' ? obj['email'] : '',
      };
    }
    return { name: '', email: '' };
  });
}

function extractDuration(fm: Record<string, unknown>, body: string): string {
  // Check frontmatter first
  if (fm['duration'] && typeof fm['duration'] === 'string') {
    return fm['duration'];
  }
  if (fm['duration'] && typeof fm['duration'] === 'number') {
    return `${fm['duration']} minutes`;
  }
  // Try ## Duration section in body
  const sectionMatch = body.match(/^##\s+Duration\s*\n([^\n#]+)/im);
  if (sectionMatch) return sectionMatch[1].trim();
  // Try **Duration**: X format (Krisp style)
  const boldMatch = body.match(/\*\*Duration\*\*:\s*(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (boldMatch) return boldMatch[1].trim();
  return '';
}

function extractSummary(fm: Record<string, unknown>, body: string): string {
  // Check frontmatter first
  if (fm['summary'] && typeof fm['summary'] === 'string') {
    return fm['summary'];
  }
  // Try ## Summary section in body
  const match = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (match) {
    const summaryText = match[1].trim();
    // Skip placeholder text
    if (summaryText && summaryText.toLowerCase() !== 'no summary available.' && summaryText !== '') {
      return summaryText;
    }
  }
  return '';
}

/**
 * Format a person slug as a display name.
 * E.g., 'john-smith' → 'John Smith'
 */
function formatSlugAsName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get person display name from slug by searching all people categories.
 * Falls back to formatting the slug as a name if not found.
 */
async function getPersonName(
  workspaceRoot: string,
  slug: string,
): Promise<string> {
  const peopleDir = join(workspaceRoot, 'people');
  
  for (const category of PEOPLE_CATEGORIES) {
    const filePath = join(peopleDir, category, `${slug}.md`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = matter(content);
      const name = parsed.data['name'] as string | undefined;
      if (name) return name;
    } catch {
      // File not found or error, try next category
    }
  }
  
  // Fallback: format slug as name
  return formatSlugAsName(slug);
}

/**
 * Add an entry to the ## Waiting On section in week.md.
 * Creates the section if it doesn't exist.
 * 
 * Format: - [ ] Person Name: What they owe @person(slug) @from(commitment:hashPrefix)
 */
async function addWaitingOnEntry(
  workspaceRoot: string,
  personName: string,
  personSlug: string,
  text: string,
  commitmentHashPrefix: string,
): Promise<void> {
  const weekFile = join(workspaceRoot, 'now', 'week.md');
  let content: string;
  
  try {
    content = await fs.readFile(weekFile, 'utf8');
  } catch {
    // File doesn't exist, create minimal structure
    content = `# Week\n\n## Waiting On\n`;
  }
  
  const entry = `- [ ] ${personName}: ${text} @person(${personSlug}) @from(commitment:${commitmentHashPrefix})`;
  
  // Find ## Waiting On section
  const waitingOnMatch = content.match(/^## Waiting On\s*$/m);
  
  if (waitingOnMatch) {
    // Section exists - insert entry after header
    const insertPos = (waitingOnMatch.index ?? 0) + waitingOnMatch[0].length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);
    content = `${before}\n${entry}${after}`;
  } else {
    // Section doesn't exist - append it
    // Find a good place to insert (after Tasks section or at end)
    const tasksMatch = content.match(/^### Could complete[\s\S]*?(?=\n## |\n---|\z)/m);
    if (tasksMatch && tasksMatch.index !== undefined) {
      const insertPos = tasksMatch.index + tasksMatch[0].length;
      const before = content.slice(0, insertPos);
      const after = content.slice(insertPos);
      content = `${before}\n\n## Waiting On\n${entry}${after}`;
    } else {
      // Append at end
      content = content.trimEnd() + `\n\n## Waiting On\n${entry}\n`;
    }
  }
  
  await fs.writeFile(weekFile, content, 'utf8');
}

/**
 * Parse a markdown section with list items into an array of item objects.
 * Handles both plain items (- text) and checkbox items (- [ ] text, - [x] text).
 */
function parseListSection(body: string, sectionName: string): Array<{ text: string; completed?: boolean }> {
  // Note: Can't use $ with 'm' flag as it matches end-of-line, not end-of-string
  // Instead, match until next ## header, --- divider, or end of content
  const regex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---)`, 'im');
  let match = body.match(regex);
  
  // If no match with lookahead, try matching to end of string (section is last in file)
  if (!match) {
    const endRegex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*)$`, 'im');
    match = body.match(endRegex);
  }
  
  if (!match) return [];
  
  const content = match[1];
  const items: Array<{ text: string; completed?: boolean }> = [];
  
  // Match list items: - [ ] text, - [x] text, - [X] text, or just - text
  const lines = content.split('\n');
  for (const line of lines) {
    // Checkbox format: - [ ] or - [x] or - [X]
    const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      items.push({
        text: checkboxMatch[2].trim(),
        completed: checkboxMatch[1].toLowerCase() === 'x',
      });
      continue;
    }
    // Plain format: - text
    const plainMatch = line.match(/^-\s+(.+)$/);
    if (plainMatch) {
      items.push({ text: plainMatch[1].trim() });
    }
  }
  
  return items;
}

/**
 * Extract transcript from body (everything under ## Transcript header).
 */
function extractTranscript(body: string): string {
  const match = body.match(/^##\s+Transcript\s*\n([\s\S]*)$/im);
  return match ? match[1].trim() : '';
}

/**
 * Detect meeting status based on content.
 * 
 * Status hierarchy:
 * 1. Explicit frontmatter status takes precedence
 * 2. Has approved_items frontmatter → approved
 * 3. Has "## Staged X" sections → processed (pending review in new UI)
 * 4. Has "## Action Items" (no Staged prefix) with content → approved (old format, already committed)
 * 5. Has Summary/Key Points → processed
 * 6. Otherwise → synced
 * 
 * Returns lowercase status (frontend handles display formatting).
 */
function detectMeetingStatus(fm: Record<string, unknown>, body: string): string {
  // Explicit frontmatter status takes precedence (normalize to lowercase)
  if (typeof fm['status'] === 'string') {
    return fm['status'].toLowerCase();
  }
  
  // Has approved_items in frontmatter → approved
  if (fm['approved_items'] && typeof fm['approved_items'] === 'object') {
    return 'approved';
  }
  
  // Has staged sections → processed (pending review)
  const hasStagedSections = /^##\s+Staged\s+(Action Items|Decisions|Learnings)\s*\n/im.test(body);
  if (hasStagedSections) {
    return 'processed';
  }
  
  // Has non-staged Action Items with real content → approved (old format, already committed)
  const actionItemsMatch = body.match(/^##\s+Action Items\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (actionItemsMatch) {
    const content = actionItemsMatch[1].trim();
    // Skip placeholder text
    if (content && 
        !content.toLowerCase().includes('no action items') &&
        /^-\s+(\[.\]\s+)?/m.test(content)) {  // matches "- " or "- [ ] " or "- [x] "
      return 'approved';
    }
  }
  
  // Has Decisions or Learnings sections with real content → approved
  const decisionsMatch = body.match(/^##\s+Decisions\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (decisionsMatch) {
    const content = decisionsMatch[1].trim();
    if (content && !content.toLowerCase().includes('no decisions') && /^-\s+/m.test(content)) {
      return 'approved';
    }
  }
  
  const learningsMatch = body.match(/^##\s+Learnings\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (learningsMatch) {
    const content = learningsMatch[1].trim();
    if (content && !content.toLowerCase().includes('no learnings') && /^-\s+/m.test(content)) {
      return 'approved';
    }
  }
  
  // Has Summary with real content → processed (but no items extracted yet)
  const summaryMatch = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  const hasSummary = summaryMatch && 
    summaryMatch[1].trim() && 
    !summaryMatch[1].toLowerCase().includes('no summary available');
  
  // Has Key Points with real content
  const keyPointsMatch = body.match(/^##\s+Key Points\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  const hasKeyPoints = keyPointsMatch && 
    keyPointsMatch[1].trim() && 
    !keyPointsMatch[1].toLowerCase().includes('no key points');
  
  if (hasSummary || hasKeyPoints) {
    return 'processed';
  }
  
  return 'synced';
}

export async function listMeetings(workspaceRoot: string): Promise<MeetingSummary[]> {
  const dir = meetingsDir(workspaceRoot);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const summaries: MeetingSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const slug = entry.slice(0, -3);
    const filePath = join(dir, entry);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const { data, content } = matter(raw);
      const fm = data as Record<string, unknown>;
      summaries.push({
        slug,
        title: typeof fm['title'] === 'string' ? fm['title'] : slug,
        date: extractDate(fm['date']),
        status: detectMeetingStatus(fm, content),
        attendees: parseAttendees(fm['attendees']),
        duration: extractDuration(fm, content),
        source: typeof fm['source'] === 'string' ? fm['source'] : '',
        recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
      });
    } catch {
      // skip unreadable files
    }
  }

  // Sort by date descending
  summaries.sort((a, b) => b.date.localeCompare(a.date));
  return summaries;
}

/** Parse `staged_item_source` from meeting file frontmatter. */
function parseStagedItemSource(content: string): Record<string, 'ai' | 'dedup'> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const fm = matter(content).data as Record<string, unknown>;
    const raw = fm['staged_item_source'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    // Validate values are 'ai' or 'dedup'
    const result: Record<string, 'ai' | 'dedup'> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (val === 'ai' || val === 'dedup') {
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Parse `staged_item_confidence` from meeting file frontmatter. */
function parseStagedItemConfidence(content: string): Record<string, number> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const fm = matter(content).data as Record<string, unknown>;
    const raw = fm['staged_item_confidence'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    // Validate values are numbers
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === 'number') {
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Owner metadata for an action item */
interface ItemOwnerMeta {
  ownerSlug?: string;
  direction?: string;
  counterpartySlug?: string;
}

/** Parse `staged_item_owner` from meeting file frontmatter. */
function parseStagedItemOwner(content: string): Record<string, ItemOwnerMeta> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const fm = matter(content).data as Record<string, unknown>;
    const raw = fm['staged_item_owner'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    // Validate structure
    const result: Record<string, ItemOwnerMeta> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const meta = val as Record<string, unknown>;
        result[key] = {
          ownerSlug: typeof meta['ownerSlug'] === 'string' ? meta['ownerSlug'] : undefined,
          direction: typeof meta['direction'] === 'string' ? meta['direction'] : undefined,
          counterpartySlug: typeof meta['counterpartySlug'] === 'string' ? meta['counterpartySlug'] : undefined,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Parse `staged_item_matched_text` from meeting file frontmatter. */
function parseStagedItemMatchedText(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    const fm = matter(content).data as Record<string, unknown>;
    const raw = fm['staged_item_matched_text'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === 'string') {
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function getMeeting(
  workspaceRoot: string,
  slug: string
): Promise<FullMeeting | null> {
  const filePath = slugToPath(workspaceRoot, slug);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const { data, content } = matter(raw);
  const fm = data as Record<string, unknown>;
  const stagedSections = parseStagedSections(content);
  const stagedItemStatus = parseStagedItemStatus(raw);
  const stagedItemEdits = parseStagedItemEdits(raw);
  const stagedItemSource = parseStagedItemSource(raw);
  const stagedItemConfidence = parseStagedItemConfidence(raw);
  const stagedItemOwner = parseStagedItemOwner(raw);
  const stagedItemMatchedText = parseStagedItemMatchedText(raw);

  // Apply sources, confidence, owner, and matchedText metadata to staged items
  for (const item of stagedSections.actionItems) {
    item.source = stagedItemSource[item.id] ?? 'ai';
    item.confidence = stagedItemConfidence[item.id];
    item.matchedText = stagedItemMatchedText[item.id];
    // Apply owner metadata if available
    const ownerMeta = stagedItemOwner[item.id];
    if (ownerMeta) {
      item.ownerSlug = ownerMeta.ownerSlug;
      item.direction = ownerMeta.direction as 'i_owe_them' | 'they_owe_me' | undefined;
      item.counterpartySlug = ownerMeta.counterpartySlug;
    }
  }
  for (const item of stagedSections.decisions) {
    item.source = stagedItemSource[item.id] ?? 'ai';
    item.confidence = stagedItemConfidence[item.id];
    item.matchedText = stagedItemMatchedText[item.id];
  }
  for (const item of stagedSections.learnings) {
    item.source = stagedItemSource[item.id] ?? 'ai';
    item.confidence = stagedItemConfidence[item.id];
    item.matchedText = stagedItemMatchedText[item.id];
  }

  // Parse approved_items from frontmatter if present
  const rawApproved = fm['approved_items'];
  const approvedItems = {
    actionItems: [] as string[],
    decisions: [] as string[],
    learnings: [] as string[],
  };
  if (rawApproved && typeof rawApproved === 'object' && !Array.isArray(rawApproved)) {
    const ra = rawApproved as Record<string, unknown>;
    if (Array.isArray(ra['actionItems'])) approvedItems.actionItems = ra['actionItems'].filter((x): x is string => typeof x === 'string');
    if (Array.isArray(ra['decisions'])) approvedItems.decisions = ra['decisions'].filter((x): x is string => typeof x === 'string');
    if (Array.isArray(ra['learnings'])) approvedItems.learnings = ra['learnings'].filter((x): x is string => typeof x === 'string');
  }

  // Parse sections from body (for old meetings or detailed view)
  const parsedSections = {
    actionItems: parseListSection(content, 'Action Items'),
    decisions: parseListSection(content, 'Decisions'),
    learnings: parseListSection(content, 'Learnings'),
  };

  return {
    slug,
    title: typeof fm['title'] === 'string' ? fm['title'] : slug,
    date: extractDate(fm['date']),
    status: detectMeetingStatus(fm, content),
    attendees: parseAttendees(fm['attendees']),
    duration: extractDuration(fm, content),
    source: typeof fm['source'] === 'string' ? fm['source'] : '',
    recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
    summary: extractSummary(fm, content),
    body: content,
    transcript: extractTranscript(content),
    frontmatter: fm,
    stagedSections,
    stagedItemStatus,
    stagedItemEdits,
    approvedItems,
    parsedSections,
  };
}

export async function deleteMeeting(
  workspaceRoot: string,
  slug: string
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  await fs.unlink(filePath);

  // Refresh QMD index — non-fatal on failure
  try {
    const config = await loadConfig(storage, workspaceRoot);
    await refreshQmdIndex(workspaceRoot, config.qmd_collection ?? 'arete');
  } catch (err) {
    console.error('[backend] QMD refresh failed after delete:', err);
  }
}

export async function updateMeeting(
  workspaceRoot: string,
  slug: string,
  updates: { title?: string; summary?: string }
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  if (updates.title !== undefined) fm['title'] = updates.title;
  if (updates.summary !== undefined) fm['summary'] = updates.summary;

  const updated = matter.stringify(parsed.content, fm);
  await fs.writeFile(filePath, updated, 'utf8');
}

export async function updateItemStatus(
  workspaceRoot: string,
  slug: string,
  itemId: string,
  options: WriteItemStatusOptions
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  await writeItemStatusToFile(storage, filePath, itemId, options);
}

/**
 * Result of post-approval automation.
 */
export type ApprovalAutomationResult = {
  qmdRefreshed: boolean;
  personMemoryRefreshed: string[];
  commitmentsUpdated: boolean;
  goalSlug?: string;
};

/**
 * Options for approving a meeting.
 */
export type ApproveMeetingOptions = {
  /** Optional goal to link action items to */
  goalSlug?: string;
};

/**
 * Approve meeting and run post-approval automation.
 * 
 * Post-approval steps:
 * 1. Save staged_item_owner metadata (needed for direction info after commit)
 * 2. Commit approved items to memory (decisions, learnings)
 * 3. Resolve attendees to slugs (if attendee_ids missing)
 * 4. Refresh QMD index
 * 5. Create commitments and tasks from action items:
 *    - i_owe_them: create commitment + task with urgency-based bucket
 *    - they_owe_me: create commitment + Waiting On entry
 * 6. Refresh person memory for each attendee
 */
export async function approveMeeting(
  workspaceRoot: string,
  slug: string,
  options: ApproveMeetingOptions = {}
): Promise<FullMeeting & { automation?: ApprovalAutomationResult }> {
  const filePath = slugToPath(workspaceRoot, slug);
  const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
  
  // Step 1: Read and save staged_item_owner BEFORE commitApprovedItems clears it
  const rawContentBeforeCommit = await fs.readFile(filePath, 'utf8');
  const ownerMap = parseStagedItemOwner(rawContentBeforeCommit);
  const stagedSections = parseStagedSections(rawContentBeforeCommit);
  const statusMap = parseStagedItemStatus(rawContentBeforeCommit);
  const editsMap = parseStagedItemEdits(rawContentBeforeCommit);
  
  // Collect approved action items with their metadata
  const approvedActionItems: Array<{
    id: string;
    text: string;
    ownerSlug?: string;
    counterpartySlug?: string;
    direction: 'i_owe_them' | 'they_owe_me';
  }> = [];
  
  for (const item of stagedSections.actionItems) {
    if (statusMap[item.id] !== 'approved') continue;
    
    const ownerMeta = ownerMap[item.id];
    const text = editsMap[item.id] ?? item.text;
    const direction = (ownerMeta?.direction as 'i_owe_them' | 'they_owe_me') ?? 'i_owe_them';
    
    approvedActionItems.push({
      id: item.id,
      text,
      ownerSlug: ownerMeta?.ownerSlug ?? item.ownerSlug,
      counterpartySlug: ownerMeta?.counterpartySlug ?? item.counterpartySlug,
      direction,
    });
  }
  
  // Step 2: Commit approved items (decisions, learnings to memory)
  await commitApprovedItems(storage, filePath, memoryDir);
  
  // Get meeting to extract metadata
  let meeting = await getMeeting(workspaceRoot, slug);
  if (!meeting) throw new Error(`Meeting not found after approve: ${slug}`);
  
  // Extract meeting area for task metadata
  const meetingArea = typeof meeting.frontmatter['area'] === 'string'
    ? meeting.frontmatter['area']
    : undefined;
  
  const meetingDate = typeof meeting.frontmatter['date'] === 'string'
    ? new Date(meeting.frontmatter['date'].slice(0, 10))
    : new Date();
  
  // Step 3: Resolve attendees to slugs if attendee_ids is missing
  let attendeeIds: string[] = Array.isArray(meeting.frontmatter['attendee_ids'])
    ? meeting.frontmatter['attendee_ids'].filter((id): id is string => typeof id === 'string')
    : [];
  
  if (attendeeIds.length === 0) {
    attendeeIds = extractAttendeeSlugs(meeting.frontmatter);
    
    if (attendeeIds.length > 0) {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      fm['attendee_ids'] = attendeeIds;
      const updated = matter.stringify(parsed.content, fm);
      await fs.writeFile(filePath, updated, 'utf8');
      
      meeting = await getMeeting(workspaceRoot, slug);
      if (!meeting) throw new Error(`Meeting not found after attendee resolution: ${slug}`);
    }
  }
  
  // Step 4: Refresh QMD index
  const config = await loadConfig(storage, workspaceRoot);
  let qmdRefreshed = false;
  try {
    await refreshQmdIndex(workspaceRoot, config.qmd_collection);
    qmdRefreshed = true;
  } catch (err) {
    console.error('[approveMeeting] QMD refresh failed:', err);
  }
  
  // Step 5: Create commitments and tasks from action items
  const personMemoryRefreshed: string[] = [];
  let commitmentsCreated = 0;
  let tasksCreated = 0;
  let waitingOnCreated = 0;
  
  if (approvedActionItems.length > 0) {
    try {
      const services = await createServices(workspaceRoot);
      const paths = services.workspace.getPaths(workspaceRoot);
      
      for (const item of approvedActionItems) {
        // Determine person slug (the other party in the commitment)
        const personSlug = item.direction === 'i_owe_them'
          ? item.counterpartySlug
          : item.ownerSlug;
        
        if (!personSlug) continue;
        
        // Get person display name for commitment and Waiting On
        const personName = await getPersonName(workspaceRoot, personSlug);
        
        if (item.direction === 'i_owe_them') {
          // I owe them: create commitment + task with urgency-based bucket
          const result = await services.commitments.create(
            item.text,
            personSlug,
            personName,
            'i_owe_them',
            {
              createTask: false, // We'll create the task manually with proper bucket
              goalSlug: options.goalSlug,
              area: meetingArea,
              date: meetingDate,
              source: `${slug}.md`,
            },
          );
          commitmentsCreated++;
          
          // Infer urgency and create task with proper bucket
          const urgencyBucket = inferUrgency(item.text);
          const taskDestination: TaskDestination = urgencyBucket;
          
          await services.tasks.addTask(item.text, taskDestination, {
            area: meetingArea,
            person: personSlug,
            from: { type: 'commitment', id: result.commitment.id.slice(0, 8) },
          });
          tasksCreated++;
          
        } else {
          // They owe me: create commitment only + add to Waiting On
          const result = await services.commitments.create(
            item.text,
            personSlug,
            personName,
            'they_owe_me',
            {
              createTask: false,
              goalSlug: options.goalSlug,
              area: meetingArea,
              date: meetingDate,
              source: `${slug}.md`,
            },
          );
          commitmentsCreated++;
          
          // Add to Waiting On section in week.md
          await addWaitingOnEntry(
            workspaceRoot,
            personName,
            personSlug,
            item.text,
            result.commitment.id.slice(0, 8),
          );
          waitingOnCreated++;
        }
      }
      
      // Step 6: Refresh person memory for attendees
      for (const personSlug of attendeeIds) {
        try {
          await services.entity.refreshPersonMemory(paths, {
            personSlug,
            commitments: services.commitments,
          });
          personMemoryRefreshed.push(personSlug);
        } catch (err) {
          console.error(`[approveMeeting] Person memory refresh failed for ${personSlug}:`, err);
        }
      }
    } catch (err) {
      console.error('[approveMeeting] Task/commitment creation failed:', err);
    }
  }
  
  return {
    ...meeting,
    automation: {
      qmdRefreshed,
      personMemoryRefreshed,
      commitmentsUpdated: commitmentsCreated > 0,
      ...(options.goalSlug ? { goalSlug: options.goalSlug } : {}),
    },
  };
}
