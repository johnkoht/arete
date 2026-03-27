/**
 * Tests for meeting save logic and agenda linking.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingAgenda,
  findMatchingAgendaPath,
  saveMeetingFile,
  meetingFilename,
  inferMeetingImportance,
  type MeetingForSave,
  type AgendaMatchResult,
  type Importance,
} from '../../src/integrations/meetings.js';
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
      // Check if it's a file or a directory
      if (files.has(path)) return true;
      if (dirs.has(path)) return true;
      // Check if any file is in this directory (simulates directory exists)
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

function makeMeeting(overrides: Partial<MeetingForSave> = {}): MeetingForSave {
  return {
    title: 'Weekly Sync',
    date: '2026-03-04',
    duration_minutes: 30,
    summary: 'A productive meeting.',
    transcript: 'Full transcript here.',
    action_items: ['Follow up on X'],
    highlights: ['Key decision made'],
    attendees: [{ name: 'John', email: 'john@example.com' }],
    url: 'https://example.com/meeting/123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('meetingFilename', () => {
  it('generates filename from date and title', () => {
    const meeting = makeMeeting({ date: '2026-03-04', title: 'Weekly Sync' });
    const filename = meetingFilename(meeting);

    assert.equal(filename, '2026-03-04-weekly-sync.md');
  });

  it('handles ISO date with time', () => {
    const meeting = makeMeeting({ date: '2026-03-04T14:30:00Z', title: 'Test' });
    const filename = meetingFilename(meeting);

    assert.equal(filename, '2026-03-04-test.md');
  });

  it('slugifies title with special characters', () => {
    const meeting = makeMeeting({ title: "John's & Mary's Meeting!" });
    const filename = meetingFilename(meeting);

    assert.ok(filename.endsWith('.md'));
    assert.ok(!filename.includes("'"));
    assert.ok(!filename.includes('&'));
  });
});

describe('findMatchingAgenda', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('returns matchType none when agendas directory does not exist', async () => {
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result.matchType, 'none');
    assert.equal(result.match, null);
    assert.equal(result.candidates.length, 0);
  });

  it('returns matchType none when no agendas match the date', async () => {
    // Create agenda with different date
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-05-weekly-sync.md`,
      '# Weekly Sync'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result.matchType, 'none');
    assert.equal(result.candidates.length, 0);
  });

  it('matches agenda by exact date and similar title', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-sync.md`,
      '# Weekly Sync\n\n- [ ] Topic 1'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result.match, 'now/agendas/2026-03-04-weekly-sync.md');
    assert.equal(result.matchType, 'fuzzy');
    assert.ok(result.confidence >= 0.7);
  });

  it('matches with fuzzy title similarity > 0.5', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-team-sync.md`,
      '# Weekly Team Sync'
    );

    // "Team Weekly Sync" vs "weekly team sync" = 100% match
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Team Weekly Sync');
    assert.equal(result.match, 'now/agendas/2026-03-04-weekly-team-sync.md');
    assert.equal(result.matchType, 'fuzzy');
  });

  it('returns low-confidence match when title similarity is low but single candidate', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-monthly-review.md`,
      '# Monthly Review'
    );

    // "Weekly Sync" vs "monthly review" - no overlap = 0
    // But it's the only candidate for this date, so it's returned with low confidence
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result.matchType, 'fuzzy');
    assert.equal(result.confidence, 0);
    assert.equal(result.match, 'now/agendas/2026-03-04-monthly-review.md');
    assert.equal(result.candidates.length, 1);
  });

  it('handles ISO date format with time', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-standup.md`,
      '# Standup'
    );

    const result = await findMatchingAgenda(
      storage,
      WORKSPACE,
      '2026-03-04T14:30:00Z',
      'Standup'
    );
    assert.equal(result.match, 'now/agendas/2026-03-04-standup.md');
  });

  it('picks best match when multiple agendas exist for same date', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-sync.md`,
      '# Weekly Sync'
    );
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-team-standup.md`,
      '# Team Standup'
    );

    // "Weekly Sync" vs "weekly sync" = 100% match
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result.match, 'now/agendas/2026-03-04-weekly-sync.md');
    assert.equal(result.candidates.length, 2);
  });

  it('matches single-word titles exactly', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-standup.md`,
      '# Standup'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Standup');
    assert.equal(result.match, 'now/agendas/2026-03-04-standup.md');
  });

  it('returns candidate for agenda with empty title slug (single candidate)', async () => {
    // Edge case: YYYY-MM-DD-.md (11 chars + nothing after hyphen)
    storage.files.set(`${WORKSPACE}/now/agendas/2026-03-04-.md`, '# Empty');

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Some Meeting');
    // Single candidate for the date - returned with low confidence
    assert.equal(result.matchType, 'fuzzy');
    assert.equal(result.confidence, 0);
    assert.equal(result.candidates.length, 1);
  });

  it('returns candidate when title normalizes to empty (single candidate)', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-meeting.md`,
      '# Meeting'
    );

    // Title with only special chars normalizes to empty
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', '!!!');
    // Single candidate for the date - returned with low confidence
    assert.equal(result.matchType, 'fuzzy');
    assert.equal(result.confidence, 0);
    assert.equal(result.candidates.length, 1);
  });

  it('matches on frontmatter meeting_title for exact match', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-lindsay-1-1.md`,
      '---\nmeeting_title: "John / Lindsay 1:1"\ndate: 2026-03-04\n---\n\n# Lindsay 1:1'
    );

    // This would fail fuzzy matching but succeeds on exact meeting_title
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'John / Lindsay 1:1');
    assert.equal(result.match, 'now/agendas/2026-03-04-lindsay-1-1.md');
    assert.equal(result.matchType, 'exact');
    assert.equal(result.confidence, 1.0);
  });

  it('prefers exact meeting_title match over fuzzy filename match', async () => {
    // One agenda with exact meeting_title match
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-lindsay-weekly.md`,
      '---\nmeeting_title: "Lindsay Weekly"\ndate: 2026-03-04\n---\n\n# Lindsay Weekly'
    );
    // Another agenda with good fuzzy filename match
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-lindsay-weekly-sync.md`,
      '# Lindsay Weekly Sync'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Lindsay Weekly');
    assert.equal(result.match, 'now/agendas/2026-03-04-lindsay-weekly.md');
    assert.equal(result.matchType, 'exact');
  });
});

describe('findMatchingAgendaPath (backward compat)', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('returns null when agendas directory does not exist', async () => {
    const result = await findMatchingAgendaPath(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, null);
  });

  it('returns null when no high-confidence match', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-monthly-review.md`,
      '# Monthly Review'
    );

    // Low similarity - should return null even though there's a candidate
    const result = await findMatchingAgendaPath(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, null);
  });

  it('returns path for high-confidence fuzzy match', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-sync.md`,
      '# Weekly Sync'
    );

    const result = await findMatchingAgendaPath(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, 'now/agendas/2026-03-04-weekly-sync.md');
  });

  it('returns path for exact meeting_title match', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-lindsay-1-1.md`,
      '---\nmeeting_title: "John / Lindsay 1:1"\ndate: 2026-03-04\n---\n\n# Lindsay 1:1'
    );

    const result = await findMatchingAgendaPath(storage, WORKSPACE, '2026-03-04', 'John / Lindsay 1:1');
    assert.equal(result, 'now/agendas/2026-03-04-lindsay-1-1.md');
  });
});

describe('saveMeetingFile', () => {
  let storage: ReturnType<typeof createMockStorage>;
  const template = `# {title}
**Date**: {date}
**Source**: {integration}

## Summary
{summary}
`;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('creates meeting file with frontmatter', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result, 'should return file path');
    const content = storage.files.get(result);
    assert.ok(content, 'file should exist');
    assert.ok(content.includes('---'), 'should have frontmatter');
    assert.ok(content.includes('title: Weekly Sync'));
    assert.ok(content.includes('source: Manual'));
  });

  it('includes agenda in frontmatter when present', async () => {
    const meeting = makeMeeting({ agenda: 'now/agendas/2026-03-04-weekly-sync.md' });
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(
      content.includes('agenda: now/agendas/2026-03-04-weekly-sync.md'),
      'should include agenda in frontmatter'
    );
  });

  it('does not include agenda in frontmatter when absent', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(!content.includes('agenda:'), 'should not include agenda when absent');
  });

  it('skips existing file without force', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;
    const existingPath = `${outputDir}/2026-03-04-weekly-sync.md`;
    storage.files.set(existingPath, 'existing content');

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.equal(result, null, 'should return null for existing file');
    assert.equal(storage.files.get(existingPath), 'existing content', 'should not overwrite');
  });

  it('overwrites existing file with force', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;
    const existingPath = `${outputDir}/2026-03-04-weekly-sync.md`;
    storage.files.set(existingPath, 'existing content');

    const result = await saveMeetingFile(storage, meeting, outputDir, template, { force: true });

    assert.ok(result, 'should return file path with force');
    const content = storage.files.get(existingPath);
    assert.ok(content?.includes('Weekly Sync'), 'should overwrite with new content');
  });

  it('uses custom integration name', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template, {
      integration: 'Krisp',
    });

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(content.includes('source: Krisp'));
  });

  it('includes importance in frontmatter when provided', async () => {
    const meeting = makeMeeting({ importance: 'important' });
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(content.includes('importance: important'), 'should include importance in frontmatter');
  });

  it('does not include importance in frontmatter when absent', async () => {
    const meeting = makeMeeting();
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(!content.includes('importance:'), 'should not include importance when absent');
  });

  it('includes recurring_series_id in frontmatter when provided', async () => {
    const meeting = makeMeeting({ recurring_series_id: 'abc123xyz' });
    const outputDir = `${WORKSPACE}/resources/meetings`;

    const result = await saveMeetingFile(storage, meeting, outputDir, template);

    assert.ok(result);
    const content = storage.files.get(result);
    assert.ok(content);
    assert.ok(content.includes('recurring_series_id: abc123xyz'), 'should include recurring_series_id');
  });
});

// ---------------------------------------------------------------------------
// inferMeetingImportance tests
// ---------------------------------------------------------------------------

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    title: 'Test Meeting',
    startTime: new Date('2026-03-04T10:00:00Z'),
    endTime: new Date('2026-03-04T11:00:00Z'),
    calendar: 'Work',
    attendees: [],
    isAllDay: false,
    ...overrides,
  };
}

describe('inferMeetingImportance', () => {
  it('returns important when organizer.self is true', () => {
    const event = makeCalendarEvent({
      organizer: { name: 'Me', email: 'me@example.com', self: true },
      attendees: [
        { name: 'Me', email: 'me@example.com' },
        { name: 'Person 1', email: 'p1@example.com' },
        { name: 'Person 2', email: 'p2@example.com' },
        { name: 'Person 3', email: 'p3@example.com' },
        { name: 'Person 4', email: 'p4@example.com' },
        { name: 'Person 5', email: 'p5@example.com' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'important', 'organizer self should be important even with many attendees');
  });

  it('returns important for 1:1 meeting (2 attendees)', () => {
    const event = makeCalendarEvent({
      attendees: [
        { name: 'Me', email: 'me@example.com' },
        { name: 'Other', email: 'other@example.com' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'important', '1:1 meetings should be important');
  });

  it('returns normal for small group (3 attendees)', () => {
    const event = makeCalendarEvent({
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'normal', 'small groups should be normal');
  });

  it('returns light for large audience (5+ attendees, not organizer)', () => {
    const event = makeCalendarEvent({
      organizer: { name: 'Someone Else', email: 'other@example.com', self: false },
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
        { name: 'Person 4' },
        { name: 'Person 5' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'light', 'large audience meetings should be light');
  });

  it('returns normal for default case (4 attendees)', () => {
    const event = makeCalendarEvent({
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
        { name: 'Person 4' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'normal', '4 attendees should be normal');
  });

  it('upgrades light to normal when hasAgenda is true', () => {
    const event = makeCalendarEvent({
      organizer: { name: 'Someone Else', email: 'other@example.com', self: false },
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
        { name: 'Person 4' },
        { name: 'Person 5' },
      ],
    });

    const result = inferMeetingImportance(event, { hasAgenda: true });
    assert.equal(result, 'normal', 'hasAgenda should upgrade light to normal');
  });

  it('keeps normal as normal when hasAgenda is true', () => {
    const event = makeCalendarEvent({
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
      ],
    });

    const result = inferMeetingImportance(event, { hasAgenda: true });
    assert.equal(result, 'normal', 'hasAgenda should not change normal');
  });

  it('handles missing organizer field gracefully', () => {
    const event = makeCalendarEvent({
      // No organizer field
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
        { name: 'Person 3' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'normal', 'should work without organizer field');
  });

  it('handles empty attendees array', () => {
    const event = makeCalendarEvent({
      attendees: [],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'normal', 'empty attendees should be normal (≤3)');
  });

  it('handles organizer without self field', () => {
    const event = makeCalendarEvent({
      organizer: { name: 'Someone', email: 'someone@example.com' },
      attendees: [
        { name: 'Person 1' },
        { name: 'Person 2' },
      ],
    });

    const result = inferMeetingImportance(event);
    assert.equal(result, 'important', '1:1 should still be important without organizer.self');
  });
});
