/**
 * Tests for Fathom integration — pullFathom importance inference.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pullFathom } from '../../src/integrations/fathom/index.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { CalendarEvent } from '../../src/integrations/calendar/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      if (files.has(path)) return true;
      if (dirs.has(path)) return true;
      for (const filePath of files.keys()) {
        if (filePath.startsWith(path + '/')) return true;
      }
      return false;
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list(dir: string, options?: { extensions?: string[] }) {
      const ext = options?.extensions?.[0] ?? '';
      const results: string[] = [];
      const dirPrefix = dir.endsWith('/') ? dir : dir + '/';
      for (const path of files.keys()) {
        if (path.startsWith(dirPrefix) && (!ext || path.endsWith(ext))) {
          results.push(path);
        }
      }
      return results;
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir(path: string) {
      dirs.add(path);
    },
    async getModified() {
      return null;
    },
  };
}

const WORKSPACE = '/test-workspace';
const CRED_PATH = `${WORKSPACE}/.credentials/credentials.yaml`;

function makeTestPaths(root: string): WorkspacePaths {
  return {
    root,
    now: `${root}/now`,
    goals: `${root}/goals`,
    context: `${root}/context`,
    areas: `${root}/areas`,
    projects: `${root}/projects`,
    resources: `${root}/resources`,
    arete: `${root}/.arete`,
    people: `${root}/people`,
    templates: `${root}/templates`,
    skills: `${root}/.agents/skills`,
    tools: `${root}/.agents/tools`,
  };
}

// Fetch mock
type FetchCapture = { url: string; init: RequestInit };
let fetchCaptures: FetchCapture[] = [];
let fetchQueue: Array<{ body: unknown; status?: number }> = [];
const originalFetch = globalThis.fetch;

function setupFetchMock(): void {
  fetchCaptures = [];
  fetchQueue = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    fetchCaptures.push({ url: url.toString(), init: init ?? {} });
    const queued = fetchQueue.shift();
    if (!queued) {
      throw new Error(`Unexpected fetch call to ${url.toString()} — no response queued`);
    }
    return new Response(JSON.stringify(queued.body), {
      status: queued.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function teardownFetchMock(): void {
  globalThis.fetch = originalFetch;
}

function queueFetch(body: unknown, status = 200): void {
  fetchQueue.push({ body, status });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pullFathom importance inference', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let paths: WorkspacePaths;

  beforeEach(() => {
    storage = createMockStorage();
    paths = makeTestPaths(WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  it('uses calendar events to infer importance for 1:1 meetings', async () => {
    // Write valid API key
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Queue Fathom API response (listMeetings - returns { items: [...] })
    queueFetch({
      items: [
        {
          recording_id: 12345,
          title: '1:1 with Jane',
          created_at: '2026-01-15T10:00:00Z',
          recording_start_time: '2026-01-15T10:00:00Z',
          recording_end_time: '2026-01-15T11:00:00Z',
          default_summary: { markdown_formatted: 'Discussed project updates' },
          transcript: [],
          action_items: [{ description: 'Follow up on X' }],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/12345',
        },
      ],
    });

    // Calendar event for 1:1 meeting (2 attendees → important)
    const calendarEvents: CalendarEvent[] = [
      {
        title: '1:1 with Jane',
        startTime: new Date('2026-01-15T10:00:00Z'),
        endTime: new Date('2026-01-15T11:00:00Z'),
        calendar: 'Work',
        attendees: [
          { name: 'Me', email: 'me@example.com' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
        isAllDay: false,
      },
    ];

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { calendarEvents });

    assert.equal(result.saved, 1);
    
    // Verify importance in saved file (slugify removes ':' so "1:1" becomes "11")
    const savedFile = storage.files.get(`${WORKSPACE}/resources/meetings/2026-01-15-11-with-jane.md`);
    assert.ok(savedFile, 'meeting file should exist');
    assert.ok(savedFile.includes('importance: important'), 'should have importance: important (1:1 meeting)');
  });

  it('defaults to normal importance when no calendar event matches', async () => {
    // Write valid API key
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Queue Fathom API response (listMeetings - returns { items: [...] })
    queueFetch({
      items: [
        {
          recording_id: 12346,
          title: 'Team Standup',
          created_at: '2026-01-16T09:00:00Z',
          recording_start_time: '2026-01-16T09:00:00Z',
          recording_end_time: '2026-01-16T09:30:00Z',
          default_summary: { markdown_formatted: 'Quick standup' },
          transcript: [],
          action_items: [],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/12346',
        },
      ],
    });

    // Calendar events for different day — no match
    const calendarEvents: CalendarEvent[] = [
      {
        title: 'Team Standup',
        startTime: new Date('2026-01-15T09:00:00Z'),
        endTime: new Date('2026-01-15T09:30:00Z'),
        calendar: 'Work',
        attendees: [{ name: 'Team' }],
        isAllDay: false,
      },
    ];

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { calendarEvents });

    assert.equal(result.saved, 1);
    
    // Verify default importance
    const savedFile = storage.files.get(`${WORKSPACE}/resources/meetings/2026-01-16-team-standup.md`);
    assert.ok(savedFile, 'meeting file should exist');
    assert.ok(savedFile.includes('importance: normal'), 'should default to importance: normal');
  });

  it('passes hasAgenda to importance inference (upgrades light to normal)', async () => {
    // Write valid API key
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Create agenda file for matching
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-01-17-all-hands.md`,
      '---\nmeeting_title: "All Hands"\n---\n\n# All Hands'
    );

    // Queue Fathom API response (listMeetings - returns { items: [...] })
    queueFetch({
      items: [
        {
          recording_id: 12347,
          title: 'All Hands',
          created_at: '2026-01-17T10:00:00Z',
          recording_start_time: '2026-01-17T10:00:00Z',
          recording_end_time: '2026-01-17T11:00:00Z',
          default_summary: { markdown_formatted: 'Company update' },
          transcript: [],
          action_items: [],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/12347',
        },
      ],
    });

    // Calendar event for large meeting (5 attendees → light, but hasAgenda upgrades to normal)
    const calendarEvents: CalendarEvent[] = [
      {
        title: 'All Hands',
        startTime: new Date('2026-01-17T10:00:00Z'),
        endTime: new Date('2026-01-17T11:00:00Z'),
        calendar: 'Work',
        organizer: { name: 'Boss', email: 'boss@example.com', self: false },
        attendees: [
          { name: 'Person 1' },
          { name: 'Person 2' },
          { name: 'Person 3' },
          { name: 'Person 4' },
          { name: 'Person 5' },
        ],
        isAllDay: false,
      },
    ];

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { calendarEvents });

    assert.equal(result.saved, 1);
    
    // Verify importance upgraded to normal due to hasAgenda
    const savedFile = storage.files.get(`${WORKSPACE}/resources/meetings/2026-01-17-all-hands.md`);
    assert.ok(savedFile, 'meeting file should exist');
    assert.ok(savedFile.includes('importance: normal'), 'should have importance: normal (hasAgenda upgrades light)');
    assert.ok(savedFile.includes('agenda: now/agendas/2026-01-17-all-hands.md'), 'should have agenda linked');
  });

  it('copies recurring_series_id from calendar event', async () => {
    // Write valid API key
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Queue Fathom API response (listMeetings - returns { items: [...] })
    queueFetch({
      items: [
        {
          recording_id: 12348,
          title: 'Weekly Sync',
          created_at: '2026-01-18T10:00:00Z',
          recording_start_time: '2026-01-18T10:00:00Z',
          recording_end_time: '2026-01-18T11:00:00Z',
          default_summary: { markdown_formatted: 'Weekly sync notes' },
          transcript: [],
          action_items: [],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/12348',
        },
      ],
    });

    // Calendar event with recurring series ID
    const calendarEvents: CalendarEvent[] = [
      {
        title: 'Weekly Sync',
        startTime: new Date('2026-01-18T10:00:00Z'),
        endTime: new Date('2026-01-18T11:00:00Z'),
        calendar: 'Work',
        attendees: [
          { name: 'Me' },
          { name: 'Colleague' },
        ],
        isAllDay: false,
        recurringEventId: 'recurring_abc123',
      },
    ];

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { calendarEvents });

    assert.equal(result.saved, 1);
    
    // Verify recurring_series_id in saved file
    const savedFile = storage.files.get(`${WORKSPACE}/resources/meetings/2026-01-18-weekly-sync.md`);
    assert.ok(savedFile, 'meeting file should exist');
    assert.ok(savedFile.includes('recurring_series_id: recurring_abc123'), 'should have recurring_series_id');
  });

  it('infers light importance for large audience without agenda', async () => {
    // Write valid API key
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Queue Fathom API response (listMeetings - returns { items: [...] })
    queueFetch({
      items: [
        {
          recording_id: 12349,
          title: 'Company Town Hall',
          created_at: '2026-01-19T10:00:00Z',
          recording_start_time: '2026-01-19T10:00:00Z',
          recording_end_time: '2026-01-19T11:00:00Z',
          default_summary: { markdown_formatted: 'Company update' },
          transcript: [],
          action_items: [],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/12349',
        },
      ],
    });

    // Calendar event for large meeting (5+ attendees, not organizer → light)
    const calendarEvents: CalendarEvent[] = [
      {
        title: 'Company Town Hall',
        startTime: new Date('2026-01-19T10:00:00Z'),
        endTime: new Date('2026-01-19T11:00:00Z'),
        calendar: 'Work',
        organizer: { name: 'CEO', email: 'ceo@example.com', self: false },
        attendees: [
          { name: 'Person 1' },
          { name: 'Person 2' },
          { name: 'Person 3' },
          { name: 'Person 4' },
          { name: 'Person 5' },
          { name: 'Person 6' },
        ],
        isAllDay: false,
      },
    ];

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { calendarEvents });

    assert.equal(result.saved, 1);
    
    // Verify light importance
    const savedFile = storage.files.get(`${WORKSPACE}/resources/meetings/2026-01-19-company-town-hall.md`);
    assert.ok(savedFile, 'meeting file should exist');
    assert.ok(savedFile.includes('importance: light'), 'should have importance: light (large audience, no agenda)');
  });
});

// ---------------------------------------------------------------------------
// Reconciliation wiring tests (P2-9)
// ---------------------------------------------------------------------------

describe('pullFathom reconciliation', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let paths: WorkspacePaths;

  beforeEach(() => {
    storage = createMockStorage();
    paths = makeTestPaths(WORKSPACE);
    setupFetchMock();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  /** Helper: queue a standard Fathom API response with one meeting */
  function queueOneMeeting(overrides?: Partial<Record<string, unknown>>): void {
    queueFetch({
      items: [
        {
          recording_id: 99001,
          title: 'Reconcile Test Meeting',
          created_at: '2026-02-01T10:00:00Z',
          recording_start_time: '2026-02-01T10:00:00Z',
          recording_end_time: '2026-02-01T11:00:00Z',
          default_summary: { markdown_formatted: 'Test summary' },
          transcript: [],
          action_items: [
            { description: 'Follow up on API design' },
            { description: 'Send docs to team' },
          ],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/99001',
          ...overrides,
        },
      ],
    });
  }

  it('works without --reconcile (backward compatibility)', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');
    queueOneMeeting();

    // No reconcile option → should work exactly as before
    const result = await pullFathom(storage, WORKSPACE, paths, 7);

    assert.equal(result.saved, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(result.success, true);
    assert.equal(result.reconciliation, undefined, 'no reconciliation when option not set');
  });

  it('works with reconcile=false (explicit)', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');
    queueOneMeeting();

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: false });

    assert.equal(result.saved, 1);
    assert.equal(result.reconciliation, undefined, 'no reconciliation when reconcile=false');
  });

  it('runs reconciliation when reconcile=true and meetings saved', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');
    queueOneMeeting();

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: true });

    assert.equal(result.saved, 1);
    assert.ok(result.reconciliation, 'reconciliation should be present');
    assert.ok(Array.isArray(result.reconciliation.items), 'should have reconciled items');
    // 2 action items from the meeting
    assert.equal(result.reconciliation.items.length, 2);
    assert.ok(result.reconciliation.stats, 'should have stats');
  });

  it('skips reconciliation when no meetings saved (all duplicates)', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // First pull: save the meeting
    queueOneMeeting();
    await pullFathom(storage, WORKSPACE, paths, 7);

    // Second pull: same meeting → already exists → saved=0
    queueOneMeeting();
    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: true });

    assert.equal(result.saved, 0, 'no new meetings saved');
    assert.equal(result.reconciliation, undefined, 'no reconciliation when saved=0');
  });

  it('uses area memories for relevance scoring', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    // Create an area with memory containing a keyword that matches an action item
    storage.files.set(
      `${WORKSPACE}/areas/engineering.md`,
      '---\narea: Engineering\nstatus: active\n---\n\n# Engineering\n'
    );
    storage.files.set(
      `${WORKSPACE}/areas/engineering/memory.md`,
      '## Keywords\n\n- API design\n- architecture\n\n## Active People\n\n- john\n\n## Open Work\n\n## Recently Completed\n\n## Recent Decisions\n'
    );

    queueOneMeeting();

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: true });

    assert.ok(result.reconciliation, 'reconciliation should be present');
    // First action item ("Follow up on API design") should match keyword "API design"
    const apiItem = result.reconciliation.items.find(
      (i) => typeof i.original !== 'string' && i.original.description === 'Follow up on API design'
    );
    assert.ok(apiItem, 'should have the API design action item');
    assert.ok(apiItem.relevanceScore > 0, 'should have non-zero relevance due to keyword match');
    assert.equal(apiItem.annotations.areaSlug, 'engineering', 'should be matched to engineering area');
  });

  it('handles reconciliation errors gracefully (non-blocking)', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');
    queueOneMeeting();

    // Sabotage storage.list to throw when trying to list area files
    const originalList = storage.list.bind(storage);
    let callCount = 0;
    storage.list = async (dir: string, opts?: { extensions?: string[] }) => {
      callCount++;
      // The first list call is for agendas (in pullFathom save loop).
      // Area listing happens during loadReconciliationContext.
      // Throw on calls that look like areas directory listing.
      if (dir.includes('/areas')) {
        throw new Error('Simulated area listing failure');
      }
      return originalList(dir, opts);
    };

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: true });

    // Pull itself should succeed despite reconciliation failure
    assert.equal(result.saved, 1, 'meeting should still be saved');
    assert.equal(result.success, true, 'pull should succeed');
    assert.equal(result.reconciliation, undefined, 'reconciliation should be undefined on error');
  });

  it('reconciles multiple meetings as a batch', async () => {
    storage.files.set(CRED_PATH, 'fathom:\n  api_key: test-key');

    queueFetch({
      items: [
        {
          recording_id: 99002,
          title: 'Meeting A',
          created_at: '2026-02-01T10:00:00Z',
          recording_start_time: '2026-02-01T10:00:00Z',
          recording_end_time: '2026-02-01T11:00:00Z',
          default_summary: { markdown_formatted: 'Meeting A summary' },
          transcript: [],
          action_items: [{ description: 'Task from meeting A' }],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/99002',
        },
        {
          recording_id: 99003,
          title: 'Meeting B',
          created_at: '2026-02-02T10:00:00Z',
          recording_start_time: '2026-02-02T10:00:00Z',
          recording_end_time: '2026-02-02T11:00:00Z',
          default_summary: { markdown_formatted: 'Meeting B summary' },
          transcript: [],
          action_items: [{ description: 'Task from meeting B' }],
          calendar_invitees: [],
          url: 'https://fathom.video/meeting/99003',
        },
      ],
    });

    const result = await pullFathom(storage, WORKSPACE, paths, 7, { reconcile: true });

    assert.equal(result.saved, 2);
    assert.ok(result.reconciliation, 'reconciliation should be present');
    // 1 action item per meeting = 2 total
    assert.equal(result.reconciliation.items.length, 2);
    // Verify items come from different meetings
    const meetingPaths = new Set(result.reconciliation.items.map((i) => i.meetingPath));
    assert.equal(meetingPaths.size, 2, 'items should come from different meetings');
  });
});
