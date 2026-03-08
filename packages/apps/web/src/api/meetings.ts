/**
 * Typed API functions for all meeting-related backend endpoints.
 *
 * All type-shape mismatches between backend and frontend are handled HERE:
 *  - Attendees: { name, email } → { initials, name, email }
 *  - Duration: "62 minutes" (string) → 62 (number)
 *  - Status: "synced" (lowercase) → "Synced" (capitalized)
 *  - ReviewItem types: 'ai'|'de'|'le' → 'action'|'decision'|'learning'
 *  - Flat ReviewItem list: stagedSections (grouped) → flat ReviewItem[]
 */

import { apiFetch } from './client.js';
import type {
  Meeting,
  Attendee,
  ReviewItem,
  MeetingStatus,
  JobResponse,
  SyncResponse,
  ProcessResponse,
  PatchItemParams,
} from './types.js';

// ── Raw backend wire types ──────────────────────────────────────────────────

type RawAttendee = { name: string; email: string };

type RawMeetingSummary = {
  slug: string;
  title: string;
  date: string;
  status: string;
  attendees: RawAttendee[];
  duration: string;
  source: string;
  recordingUrl: string;
};

type RawStagedItem = {
  id: string;
  text: string;
  type: 'ai' | 'de' | 'le';
};

type RawStagedSections = {
  actionItems: RawStagedItem[];
  decisions: RawStagedItem[];
  learnings: RawStagedItem[];
};

type RawApprovedItems = {
  actionItems: string[];
  decisions: string[];
  learnings: string[];
};

type RawParsedItem = {
  text: string;
  completed?: boolean;
};

type RawParsedSections = {
  actionItems: RawParsedItem[];
  decisions: RawParsedItem[];
  learnings: RawParsedItem[];
};

type RawFullMeeting = RawMeetingSummary & {
  summary: string;
  body: string;
  transcript: string;
  frontmatter: Record<string, unknown>;
  stagedSections: RawStagedSections;
  stagedItemStatus: Record<string, 'approved' | 'skipped' | 'pending'>;
  stagedItemEdits: Record<string, string>;
  approvedItems: RawApprovedItems;
  parsedSections: RawParsedSections;
};

// ── Mapping helpers ─────────────────────────────────────────────────────────

function mapAttendee(a: RawAttendee): Attendee {
  const parts = a.name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')
      : (parts[0]?.[0] ?? '?');
  return { name: a.name, email: a.email, initials: initials.toUpperCase() };
}

function parseDuration(s: string): number {
  const match = /(\d+)/.exec(s);
  return match ? parseInt(match[1], 10) : 0;
}

function normalizeStatus(s: string): MeetingStatus {
  const lower = s.toLowerCase();
  if (lower === 'processed') return 'processed';
  if (lower === 'approved') return 'approved';
  return 'synced';
}

const TYPE_MAP = { ai: 'action', de: 'decision', le: 'learning' } as const;

function flattenStagedItems(raw: RawFullMeeting): ReviewItem[] {
  const allItems: RawStagedItem[] = [
    ...raw.stagedSections.actionItems,
    ...raw.stagedSections.decisions,
    ...raw.stagedSections.learnings,
  ];
  return allItems.map((item) => ({
    id: item.id,
    type: TYPE_MAP[item.type],
    text: raw.stagedItemEdits[item.id] ?? item.text,
    status: raw.stagedItemStatus[item.id] ?? 'pending',
  }));
}

function mapSummary(raw: RawMeetingSummary): Meeting {
  return {
    slug: raw.slug,
    title: raw.title,
    date: raw.date,
    attendees: raw.attendees.map(mapAttendee),
    status: normalizeStatus(raw.status),
    duration: parseDuration(raw.duration),
    source: raw.source,
    recordingUrl: raw.recordingUrl,
  };
}

function mapFullMeeting(raw: RawFullMeeting): Meeting {
  return {
    ...mapSummary(raw),
    summary: raw.summary,
    body: raw.body,
    transcript: raw.transcript,
    reviewItems: flattenStagedItems(raw),
    approvedItems: raw.approvedItems,
    parsedSections: raw.parsedSections,
  };
}

// ── API functions ───────────────────────────────────────────────────────────

/** GET /api/meetings — list all meeting summaries */
export async function fetchMeetings(): Promise<Meeting[]> {
  const raw = await apiFetch<RawMeetingSummary[]>('/api/meetings');
  return raw.map(mapSummary);
}

/** GET /api/meetings/:slug — full meeting with staged items */
export async function fetchMeeting(slug: string): Promise<Meeting> {
  const raw = await apiFetch<RawFullMeeting>(`/api/meetings/${slug}`);
  return mapFullMeeting(raw);
}

/** POST /api/meetings/sync — start Krisp sync job */
export async function syncKrisp(): Promise<SyncResponse> {
  return apiFetch<SyncResponse>('/api/meetings/sync', { method: 'POST' });
}

/** GET /api/jobs/:id — poll job status */
export async function fetchJobStatus(jobId: string): Promise<JobResponse> {
  return apiFetch<JobResponse>(`/api/jobs/${jobId}`);
}

/** PATCH /api/meetings/:slug/items/:id — update staged item status/text */
export async function patchItem(slug: string, params: PatchItemParams): Promise<Meeting> {
  const raw = await apiFetch<RawFullMeeting>(`/api/meetings/${slug}/items/${params.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: params.status,
      editedText: params.editedText,
    }),
  });
  return mapFullMeeting(raw);
}

/** POST /api/meetings/:slug/approve — commit approved items to memory */
export async function approveMeeting(slug: string): Promise<Meeting> {
  const raw = await apiFetch<RawFullMeeting>(`/api/meetings/${slug}/approve`, {
    method: 'POST',
  });
  return mapFullMeeting(raw);
}

/** POST /api/meetings/:slug/process-people — run arete meeting process --json */
export async function processPeople(slug: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/meetings/${slug}/process-people`, {
    method: 'POST',
  });
}

/** POST /api/meetings/:slug/process — start Pi SDK agent processing job */
export async function processMeeting(slug: string): Promise<ProcessResponse> {
  return apiFetch<ProcessResponse>(`/api/meetings/${slug}/process`, {
    method: 'POST',
  });
}

/** DELETE /api/meetings/:slug — delete meeting file */
export async function deleteMeeting(slug: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/meetings/${slug}`, {
    method: 'DELETE',
  });
}
