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
  favorite?: boolean;
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
  rawContent: string;
  allMeetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }>;
  // favorite is inherited from PersonSummary
};

export type PeopleResponse = {
  people: PersonSummary[];
  total: number;
  offset: number;
  limit: number;
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

export type PriorityLevel = 'high' | 'medium' | 'low';

export type CommitmentItem = {
  id: string;
  text: string;
  personSlug: string;
  direction: string;
  date: string;
  daysOpen: number;
  status: string;
  priority: number;
  priorityLevel: PriorityLevel;
};

export type CommitmentsListResponse = {
  commitments: CommitmentItem[];
  total: number;
  offset: number;
  limit: number;
};

export type ReconciliationCandidate = {
  commitmentId: string;
  commitmentText: string;
  personSlug: string;
  personName: string;
  sourceMeeting: string;
  matchedText: string;
  confidence: number;
};

export type ReconcileResponse = {
  candidates: ReconciliationCandidate[];
  count: number;
};

// ── Search types ──────────────────────────────────────────────────────────────

export type SearchResultType = 'meeting' | 'person' | 'decision' | 'learning' | 'project';

export type SearchResult = {
  type: SearchResultType;
  title: string;
  slug: string;
  excerpt: string;
  date?: string;
  url: string;
};

export type SearchResponse = {
  results: SearchResult[];
};

// ── Task types (for Tasks page) ───────────────────────────────────────────────

/**
 * Task type for the Tasks page.
 * Distinct from WorkspaceTask (used in review page) — this is the enriched
 * wire format from GET /api/tasks with resolved person names and commitment details.
 */
export type Task = {
  id: string;
  text: string;
  destination: 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';
  due: string | null;
  area: string | null;
  project: string | null;
  person: { slug: string; name: string } | null;
  from: {
    type: 'commitment';
    id: string;
    text: string;
    priority: 'high' | 'medium' | 'low';
    daysOpen: number;
  } | null;
  completed: boolean;
  completedAt: string | null;
  source: { file: string; section: string };
};

/**
 * Suggested task with AI scoring breakdown.
 * Returned from GET /api/tasks/suggested.
 */
export type SuggestedTask = Task & {
  score: number;
  breakdown: {
    dueDate: number;
    commitment: number;
    meetingRelevance: number;
    weekPriority: number;
  };
};

/** Filter param for fetchTasks */
export type TasksFilter = 'today' | 'upcoming' | 'anytime' | 'someday' | 'completed';

/** Options for fetchTasks */
export type FetchTasksOptions = {
  limit?: number;
  offset?: number;
  waitingOn?: boolean;
};

/** Response from GET /api/tasks */
export type TasksResponse = {
  tasks: Task[];
  total: number;
  offset: number;
  limit: number;
};

/** Updates for PATCH /api/tasks/:id */
export type TaskUpdate = {
  completed?: boolean;
  due?: string | null;
  area?: string | null;
  project?: string | null;
  destination?: Task['destination'];
};

/** Summary of an area for assignment dropdowns */
export type AreaSummary = {
  slug: string;
  name: string;
};

// ── Review types ──────────────────────────────────────────────────────────────

export type TaskDestination = 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';

export type TaskMetadata = {
  area?: string;
  project?: string;
  person?: string;
  from?: { type: 'commitment' | 'meeting'; id: string };
  due?: string;
};

export type WorkspaceTask = {
  id: string;
  text: string;
  completed: boolean;
  metadata: TaskMetadata;
  source: { file: string; section: string };
};

export type StagedMemoryItem = {
  id: string;
  text: string;
  type: 'decision' | 'learning';
  meetingSlug: string;
  meetingTitle: string;
  meetingDate: string;
  source?: 'ai' | 'dedup' | 'reconciled';
  confidence?: number;
};

export type ReviewCommitment = {
  id: string;
  text: string;
  direction: 'i_owe_them' | 'they_owe_me';
  personSlug: string;
  personName: string;
  source: string;
  date: string;
  status: 'open' | 'resolved' | 'dropped';
  resolvedAt: string | null;
  projectSlug?: string;
  goalSlug?: string;
  area?: string;
};

export type PendingReviewResponse = {
  tasks: WorkspaceTask[];
  decisions: StagedMemoryItem[];
  learnings: StagedMemoryItem[];
  commitments: ReviewCommitment[];
};

export type CompleteReviewRequest = {
  sessionId: string;
  approved: string[];
  skipped: string[];
};

export type CompleteReviewResponse = {
  success: boolean;
};

export type AutoApproveQualifyingMeeting = {
  slug: string;
  title: string;
  itemCount: number;
};

export type AutoApprovePreviewResponse = {
  meetings: AutoApproveQualifyingMeeting[];
  totalItems: number;
};

// ── Activity types ────────────────────────────────────────────────────────────

export type ActivityItem = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  timestamp: string;
};

export type ActivityResponse = {
  events: ActivityItem[];
};

// ── Meeting types (existing) ──────────────────────────────────────────────────

export type MeetingStatus = 'synced' | 'processed' | 'approved';
export type ItemStatus = 'pending' | 'approved' | 'skipped';
export type ItemType = 'action' | 'decision' | 'learning';

export type Attendee = {
  initials: string;
  name: string;
  email?: string;
};

/** Direction of an action item relative to the user. */
export type ItemDirection = 'i_owe_them' | 'they_owe_me';

export type ReviewItem = {
  id: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  /** Optional goal association for action items */
  goalSlug?: string;
  /** Origin of this item: ai (LLM extracted), dedup (matched user notes), reconciled (matched completed task in week.md) */
  source?: 'ai' | 'dedup' | 'reconciled';
  /** LLM confidence score (0-1) for extracted items */
  confidence?: number;
  /** Owner slug for action items (who is responsible) */
  ownerSlug?: string;
  /** Direction: does the user owe them, or do they owe the user? */
  direction?: ItemDirection;
  /** Counterparty slug for action items (who is the other party) */
  counterpartySlug?: string;
  /** Matched text from week.md/scratchpad.md (reconciled items only) */
  matchedText?: string;
};

export type ApprovedItems = {
  actionItems: string[];
  decisions: string[];
  learnings: string[];
};

/** Parsed item from meeting body (for viewing/editing approved items) */
export type ParsedItem = {
  text: string;
  completed?: boolean;
};

/** Parsed sections from meeting body */
export type ParsedSections = {
  actionItems: ParsedItem[];
  decisions: ParsedItem[];
  learnings: ParsedItem[];
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
  /** Just the transcript portion */
  transcript?: string;
  reviewItems?: ReviewItem[];
  approvedItems?: ApprovedItems;
  /** Parsed sections from body (for viewing approved items) */
  parsedSections?: ParsedSections;
  /** Confirmed area slug (from frontmatter) */
  area?: string;
  /** Suggested area slug (from content-based matching) */
  suggestedArea?: string;
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

export type MeetingsResponse = {
  meetings: Meeting[];
  total: number;
  offset: number;
  limit: number;
};
