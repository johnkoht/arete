/**
 * Frontend-normalized types — the shapes components work with.
 *
 * All mapping from backend wire formats (lowercase status, string duration,
 * initials-less attendees, flat staged items) happens in src/api/meetings.ts
 * before these types are returned to hooks/components.
 */

export type MeetingStatus = 'Synced' | 'Processed' | 'Approved';
export type ItemStatus = 'pending' | 'approved' | 'skipped';
export type ItemType = 'action' | 'decision' | 'learning';

export type Attendee = {
  initials: string;
  name: string;
  email?: string;
};

export type ReviewItem = {
  id: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
};

export type Meeting = {
  slug: string;
  title: string;
  date: string;
  attendees: Attendee[];
  status: MeetingStatus;
  /** Parsed integer minutes (0 if backend returned unparseable string) */
  duration: number;
  source: string;
  summary?: string;
  body?: string;
  reviewItems?: ReviewItem[];
};

export type JobStatus = 'running' | 'done' | 'error';

export type JobResponse = {
  status: JobStatus;
  output: string;
};

export type SyncResponse = {
  jobId: string;
};

export type ProcessResponse = {
  jobId: string;
};

export type PatchItemParams = {
  id: string;
  status: ItemStatus;
  editedText?: string;
};
