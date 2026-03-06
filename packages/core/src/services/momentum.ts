/**
 * Momentum service — commitment and relationship momentum analysis.
 *
 * computeCommitmentMomentum(): buckets open commitments into hot/stale/critical
 * computeRelationshipMomentum(): scans meeting attendees to classify relationships
 */

import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { Commitment } from '../models/index.js';

// ---------------------------------------------------------------------------
// Commitment Momentum
// ---------------------------------------------------------------------------

export type CommitmentBucket = 'hot' | 'stale' | 'critical';

export type CommitmentMomentumItem = {
  commitment: Commitment;
  bucket: CommitmentBucket;
  ageDays: number;
};

export type CommitmentMomentum = {
  hot: CommitmentMomentumItem[];      // active last 7 days
  stale: CommitmentMomentumItem[];    // 14–30 days open
  critical: CommitmentMomentumItem[]; // 30+ days open
};

/**
 * Bucket open commitments by how long they've been open.
 *
 * Hot:      < 7 days old (recently created, still in motion)
 * Stale:    7–30 days old (drifting, needs attention)
 * Critical: > 30 days old (seriously overdue)
 *
 * Age is measured from the commitment's `date` field.
 */
export function computeCommitmentMomentum(
  commitments: Commitment[],
  referenceDate: Date = new Date(),
): CommitmentMomentum {
  const result: CommitmentMomentum = { hot: [], stale: [], critical: [] };

  for (const c of commitments) {
    if (c.status !== 'open') continue;

    const itemDate = new Date(c.date);
    if (Number.isNaN(itemDate.getTime())) {
      // Can't determine age — treat as stale
      result.stale.push({ commitment: c, bucket: 'stale', ageDays: -1 });
      continue;
    }

    const ageDays = (referenceDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24);

    if (ageDays > 30) {
      result.critical.push({ commitment: c, bucket: 'critical', ageDays: Math.floor(ageDays) });
    } else if (ageDays > 7) {
      result.stale.push({ commitment: c, bucket: 'stale', ageDays: Math.floor(ageDays) });
    } else {
      result.hot.push({ commitment: c, bucket: 'hot', ageDays: Math.floor(ageDays) });
    }
  }

  // Sort each bucket by age descending (oldest first within bucket)
  const byAge = (a: CommitmentMomentumItem, b: CommitmentMomentumItem) =>
    b.ageDays - a.ageDays;
  result.hot.sort(byAge);
  result.stale.sort(byAge);
  result.critical.sort(byAge);

  return result;
}

// ---------------------------------------------------------------------------
// Relationship Momentum
// ---------------------------------------------------------------------------

export type RelationshipBucket = 'active' | 'cooling' | 'stale';

export type RelationshipMomentumItem = {
  personSlug: string;
  personName: string;
  lastMeetingDate: string; // YYYY-MM-DD
  daysSinceMeeting: number;
  bucket: RelationshipBucket;
  meetingCount: number; // total meetings in period
};

export type RelationshipMomentum = {
  active: RelationshipMomentumItem[];   // met last 14 days
  cooling: RelationshipMomentumItem[];  // 14–30 days
  stale: RelationshipMomentumItem[];    // 30+ days
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): { data: Record<string, unknown> } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {} };
  try {
    return { data: parseYaml(match[1]) as Record<string, unknown> };
  } catch {
    return { data: {} };
  }
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractAttendeeSlugs(data: Record<string, unknown>): string[] {
  const slugs: string[] = [];

  const attendeeIds = data['attendee_ids'];
  if (Array.isArray(attendeeIds)) {
    for (const id of attendeeIds) {
      if (typeof id === 'string' && id.trim()) slugs.push(id.trim());
    }
    if (slugs.length > 0) return slugs;
  }

  const attendees = data['attendees'];
  if (Array.isArray(attendees)) {
    for (const a of attendees) {
      if (typeof a === 'string' && a.trim()) {
        slugs.push(slugifyName(a.trim()));
      } else if (a && typeof a === 'object') {
        const obj = a as Record<string, unknown>;
        const name = typeof obj['name'] === 'string' ? obj['name'] : '';
        if (name.trim()) slugs.push(slugifyName(name.trim()));
      }
    }
  }

  return slugs;
}

/**
 * Try to resolve a person's display name from their profile file.
 * Falls back to the slug if the file doesn't exist or can't be parsed.
 */
async function resolvePersonName(
  personSlug: string,
  peopleDir: string,
  storage: StorageAdapter,
): Promise<string> {
  const categories = ['internal', 'customers', 'users'];

  for (const cat of categories) {
    const filePath = join(peopleDir, cat, `${personSlug}.md`);
    const content = await storage.read(filePath);
    if (!content) continue;

    // Extract name from frontmatter or first heading
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fmMatch) {
      try {
        const data = parseYaml(fmMatch[1]) as Record<string, unknown>;
        const name = data['name'] ?? data['full_name'];
        if (typeof name === 'string' && name.trim()) return name.trim();
      } catch { /* ignore */ }
    }

    // Try first # Heading
    const headingMatch = content.match(/^# (.+)/m);
    if (headingMatch) return headingMatch[1].trim();
  }

  // Fall back: convert slug to title case
  return personSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute relationship momentum by scanning meeting attendees.
 *
 * Reads all .md files in meetingsDirPath, collects attendee slugs per meeting,
 * and classifies each known person by their last meeting date.
 *
 * @param meetingsDirPath - Absolute path to resources/meetings/
 * @param peopleDir - Absolute path to people/ directory
 * @param storage - StorageAdapter
 * @param options - { days: 90 } lookback for "known" relationships; { personSlug } to filter
 */
export async function computeRelationshipMomentum(
  meetingsDirPath: string,
  peopleDir: string,
  storage: StorageAdapter,
  options: { days?: number; personSlug?: string; referenceDate?: Date } = {},
): Promise<RelationshipMomentum> {
  const lookbackDays = options.days ?? 90;
  const referenceDate = options.referenceDate ?? new Date();
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const result: RelationshipMomentum = { active: [], cooling: [], stale: [] };

  // Map: personSlug → { lastMeetingDate, meetingCount }
  type PersonTrack = { lastDate: string; count: number };
  const personMap = new Map<string, PersonTrack>();

  const allFiles = await storage.list(meetingsDirPath, { extensions: ['.md'] });

  for (const filePath of allFiles) {
    const content = await storage.read(filePath);
    if (!content) continue;

    const { data } = parseFrontmatter(content);

    const dateRaw = data['date'];
    if (typeof dateRaw !== 'string') continue;

    const meetingDate = new Date(dateRaw);
    if (Number.isNaN(meetingDate.getTime())) continue;

    // Only consider meetings within lookback window
    if (meetingDate < cutoff) continue;

    const dateStr = dateRaw.includes('T') ? dateRaw.slice(0, 10) : dateRaw;
    const attendees = extractAttendeeSlugs(data);

    for (const slug of attendees) {
      if (!slug) continue;
      if (options.personSlug && slug !== options.personSlug) continue;

      const track = personMap.get(slug);
      if (!track) {
        personMap.set(slug, { lastDate: dateStr, count: 1 });
      } else {
        track.count++;
        if (dateStr > track.lastDate) track.lastDate = dateStr;
      }
    }
  }

  if (personMap.size === 0) return result;

  // Build momentum items
  for (const [slug, track] of personMap) {
    const lastDate = new Date(track.lastDate);
    const daysSince = (referenceDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    const days = Math.floor(daysSince);

    const personName = await resolvePersonName(slug, peopleDir, storage);

    const item: RelationshipMomentumItem = {
      personSlug: slug,
      personName,
      lastMeetingDate: track.lastDate,
      daysSinceMeeting: days,
      bucket: days <= 14 ? 'active' : days <= 30 ? 'cooling' : 'stale',
      meetingCount: track.count,
    };

    result[item.bucket].push(item);
  }

  // Sort each bucket by lastMeetingDate descending (most recent first)
  const byDate = (a: RelationshipMomentumItem, b: RelationshipMomentumItem) =>
    b.lastMeetingDate.localeCompare(a.lastMeetingDate);
  result.active.sort(byDate);
  result.cooling.sort(byDate);
  result.stale.sort(byDate);

  return result;
}
