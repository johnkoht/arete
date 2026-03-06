/**
 * Frontend-normalized types — the shapes components work with.
 *
 * All mapping from backend wire formats (lowercase status, string duration,
 * initials-less attendees, flat staged items) happens in src/api/meetings.ts
 * before these types are returned to hooks/components.
 */

// ── Dashboard types ──────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
};

export type CalendarTodayResponse = {
  events: CalendarEvent[];
  configured: boolean;
};

export type CommitmentsSummary = {
  open: number;
  dueThisWeek: number;
  overdue: number;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  lastModified: string;
  status: string;
  description: string;
};

export type ProjectsResponse = {
  projects: ProjectSummary[];
};

export type MemoryItemType = 'decision' | 'learning';

export type MemoryItem = {
  id: string;
  type: MemoryItemType;
  date: string;
  title: string;
  content: string;
  source?: string;
};

export type MemoryRecentResponse = {
  items: MemoryItem[];
};

export type MemoryResponse = {
  items: MemoryItem[];
  total: number;
  offset: number;
  limit: number;
};

// ── People types ─────────────────────────────────────────────────────────────

export type PersonCategory = 'internal' | 'customer' | 'user';

export type PersonSummary = {
  slug: string;
  name: string;
  role: string;
  company: string;
  category: PersonCategory;
  healthScore: number | null;
  healthStatus: string | null;
  lastMeetingDate: string | null;
  lastMeetingTitle: string | null;
  openCommitments: number;
  trend: 'up' | 'flat' | 'down' | null;
};

export type PersonCommitmentItem = {
  id: string;
  text: string;
  direction: string;
  date: string;
};

export type PersonDetail = PersonSummary & {
  email: string;
  recentMeetings: Array<{ date: string; title: string }>;
  openCommitmentItems: PersonCommitmentItem[];
  stances: string[];
  repeatedAsks: string[];
  repeatedConcerns: string[];
};

export type PeopleResponse = {
  people: PersonSummary[];
};

// ── Goals types ──────────────────────────────────────────────────────────────

export type QuarterOutcome = {
  id: string;
  title: string;
  successCriteria: string;
  orgAlignment: string;
};

export type WeekPriority = {
  index: number;
  title: string;
  successCriteria: string;
  advancesGoal: string;
  effort: string;
  done: boolean;
};

export type WeekCommitment = {
  text: string;
  done: boolean;
};

export type StrategyResponse = {
  title: string;
  content: string;
  preview: string;
  found: boolean;
};

export type QuarterResponse = {
  outcomes: QuarterOutcome[];
  quarter: string;
  found: boolean;
};

export type WeekResponse = {
  priorities: WeekPriority[];
  commitments: WeekCommitment[];
  weekOf: string;
  found: boolean;
};

// ── Intelligence types ────────────────────────────────────────────────────────

export type SignalPattern = {
  topic: string;
  mentions: number;
  people: string[];
  meetings: string[];
  lastSeen: string;
};

export type PatternsResponse = {
  success: boolean;
  patterns: SignalPattern[];
  count: number;
};

export type CommitmentItem = {
  id: string;
  text: string;
  personSlug: string;
  direction: string;
  date: string;
  daysOpen: number;
};

export type CommitmentsListResponse = {
  commitments: CommitmentItem[];
};

// ── Meeting types (existing) ──────────────────────────────────────────────────

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

export type ApprovedItems = {
  actionItems: string[];
  decisions: string[];
  learnings: string[];
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
  recordingUrl?: string;
  summary?: string;
  body?: string;
  reviewItems?: ReviewItem[];
  approvedItems?: ApprovedItems;
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
