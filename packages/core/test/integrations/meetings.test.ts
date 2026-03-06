/**
 * Tests for meeting save logic and agenda linking.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingAgenda,
  saveMeetingFile,
  meetingFilename,
  type MeetingForSave,
} from '../../src/integrations/meetings.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

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

  it('returns null when agendas directory does not exist', async () => {
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, null);
  });

  it('returns null when no agendas match the date', async () => {
    // Create agenda with different date
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-05-weekly-sync.md`,
      '# Weekly Sync'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, null);
  });

  it('matches agenda by exact date and similar title', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-sync.md`,
      '# Weekly Sync\n\n- [ ] Topic 1'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, 'now/agendas/2026-03-04-weekly-sync.md');
  });

  it('matches with fuzzy title similarity > 0.7', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-weekly-team-sync.md`,
      '# Weekly Team Sync'
    );

    // "Weekly Sync" vs "weekly team sync" - 2 of 3 words match = 0.67
    // But if we have "Team Weekly Sync" it should match better
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Team Weekly Sync');
    assert.equal(result, 'now/agendas/2026-03-04-weekly-team-sync.md');
  });

  it('returns null when title similarity is too low', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-monthly-review.md`,
      '# Monthly Review'
    );

    // "Weekly Sync" vs "monthly review" - no overlap = 0
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Weekly Sync');
    assert.equal(result, null);
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
    assert.equal(result, 'now/agendas/2026-03-04-standup.md');
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
    assert.equal(result, 'now/agendas/2026-03-04-weekly-sync.md');
  });

  it('matches single-word titles exactly', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-standup.md`,
      '# Standup'
    );

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Standup');
    assert.equal(result, 'now/agendas/2026-03-04-standup.md');
  });

  it('returns null for agenda with empty title slug', async () => {
    // Edge case: YYYY-MM-DD-.md (11 chars + nothing after hyphen)
    storage.files.set(`${WORKSPACE}/now/agendas/2026-03-04-.md`, '# Empty');

    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', 'Some Meeting');
    assert.equal(result, null);
  });

  it('returns null when title normalizes to empty', async () => {
    storage.files.set(
      `${WORKSPACE}/now/agendas/2026-03-04-meeting.md`,
      '# Meeting'
    );

    // Title with only special chars normalizes to empty
    const result = await findMatchingAgenda(storage, WORKSPACE, '2026-03-04', '!!!');
    assert.equal(result, null);
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
});
