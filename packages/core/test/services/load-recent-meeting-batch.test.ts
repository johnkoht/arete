import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRecentMeetingBatch,
  extractIntelligenceFromFrontmatter,
  type MeetingExtractionBatch,
} from '../../src/services/meeting-reconciliation.js';
import type { StorageAdapter, ListOptions } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Mock Storage
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list(dir: string, options?: ListOptions) {
      const extensions = options?.extensions ?? [];
      const results: string[] = [];
      const dirPrefix = dir.endsWith('/') ? dir : dir + '/';
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(dirPrefix)) continue;
        // Only immediate children (no nested directories)
        const remainder = filePath.slice(dirPrefix.length);
        if (remainder.includes('/')) continue;
        if (extensions.length > 0 && !extensions.some(ext => filePath.endsWith(ext))) continue;
        results.push(filePath);
      }
      return results;
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {},
    async getModified() {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEETINGS_DIR = '/workspace/resources/meetings';

function meetingPath(filename: string): string {
  return `${MEETINGS_DIR}/${filename}`;
}

function makeMeetingContent(opts: {
  status: string;
  stagedItems?: Array<Record<string, unknown>>;
}): string {
  const fm: Record<string, unknown> = { status: opts.status };
  if (opts.stagedItems) {
    fm.staged_items = opts.stagedItems;
  }
  // Simple YAML serialization for test fixtures
  let yaml = '';
  for (const [key, value] of Object.entries(fm)) {
    if (key === 'staged_items' && Array.isArray(value)) {
      yaml += `staged_items:\n`;
      for (const item of value) {
        const entries = Object.entries(item);
        if (entries.length > 0) {
          yaml += `  - ${entries[0][0]}: ${entries[0][1]}\n`;
          for (let i = 1; i < entries.length; i++) {
            yaml += `    ${entries[i][0]}: ${entries[i][1]}\n`;
          }
        }
      }
    } else {
      yaml += `${key}: ${value}\n`;
    }
  }
  return `---\n${yaml}---\n\n# Meeting\n`;
}

// ---------------------------------------------------------------------------
// Tests: extractIntelligenceFromFrontmatter
// ---------------------------------------------------------------------------

describe('extractIntelligenceFromFrontmatter', () => {
  it('returns null when no staged_items', () => {
    assert.strictEqual(extractIntelligenceFromFrontmatter({}), null);
    assert.strictEqual(extractIntelligenceFromFrontmatter({ staged_items: undefined }), null);
  });

  it('returns null when staged_items is not an array', () => {
    assert.strictEqual(extractIntelligenceFromFrontmatter({ staged_items: 'not-array' }), null);
  });

  it('returns null when all items lack text', () => {
    const result = extractIntelligenceFromFrontmatter({
      staged_items: [{ type: 'action' }, { type: 'decision' }],
    });
    assert.strictEqual(result, null);
  });

  it('extracts action items', () => {
    const result = extractIntelligenceFromFrontmatter({
      staged_items: [
        {
          type: 'action',
          description: 'Send API docs',
          owner: 'john-smith',
          owner_name: 'John Smith',
          counterparty: 'jane-doe',
          direction: 'i_owe_them',
        },
      ],
    });
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 1);
    assert.strictEqual(result.actionItems[0].description, 'Send API docs');
    assert.strictEqual(result.actionItems[0].ownerSlug, 'john-smith');
    assert.strictEqual(result.actionItems[0].owner, 'John Smith');
    assert.strictEqual(result.actionItems[0].counterpartySlug, 'jane-doe');
    assert.strictEqual(result.actionItems[0].direction, 'i_owe_them');
  });

  it('extracts decisions and learnings', () => {
    const result = extractIntelligenceFromFrontmatter({
      staged_items: [
        { type: 'decision', text: 'Use React for frontend' },
        { type: 'learning', description: 'Users prefer batch processing' },
      ],
    });
    assert.ok(result);
    assert.deepStrictEqual(result.decisions, ['Use React for frontend']);
    assert.deepStrictEqual(result.learnings, ['Users prefer batch processing']);
    assert.strictEqual(result.actionItems.length, 0);
  });

  it('uses description or text field', () => {
    const result = extractIntelligenceFromFrontmatter({
      staged_items: [
        { type: 'decision', description: 'From description' },
        { type: 'learning', text: 'From text' },
      ],
    });
    assert.ok(result);
    assert.deepStrictEqual(result.decisions, ['From description']);
    assert.deepStrictEqual(result.learnings, ['From text']);
  });
});

// ---------------------------------------------------------------------------
// Tests: loadRecentMeetingBatch
// ---------------------------------------------------------------------------

describe('loadRecentMeetingBatch', () => {
  it('returns empty array for empty directory', async () => {
    const storage = createMockStorage();
    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when no files match date pattern', async () => {
    const storage = createMockStorage();
    storage.files.set(
      meetingPath('notes.md'),
      makeMeetingContent({ status: 'processed', stagedItems: [{ type: 'decision', text: 'test' }] }),
    );
    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('loads processed meetings within date range', async () => {
    const storage = createMockStorage();
    // Use today's date to ensure it's within range
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const filename = `${dateStr}-standup.md`;

    storage.files.set(
      meetingPath(filename),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [
          { type: 'action', description: 'Review PR', owner: 'john', owner_name: 'John', direction: 'i_owe_them' },
          { type: 'decision', text: 'Ship v2 next week' },
        ],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].meetingPath, meetingPath(filename));
    assert.strictEqual(result[0].extraction.actionItems.length, 1);
    assert.strictEqual(result[0].extraction.decisions.length, 1);
  });

  it('includes approved meetings', async () => {
    const storage = createMockStorage();
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${dateStr}-approved.md`),
      makeMeetingContent({
        status: 'approved',
        stagedItems: [{ type: 'learning', text: 'Users love dark mode' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].extraction.learnings, ['Users love dark mode']);
  });

  it('filters out meetings older than lookback window', async () => {
    const storage = createMockStorage();
    // 30 days ago — outside default 7-day window
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${oldDateStr}-old-meeting.md`),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [{ type: 'decision', text: 'Old decision' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR, 7);
    assert.deepStrictEqual(result, []);
  });

  it('includes meetings within custom lookback window', async () => {
    const storage = createMockStorage();
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 10);
    const dateStr = daysAgo.toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${dateStr}-recent.md`),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [{ type: 'decision', text: 'Recent decision' }],
      }),
    );

    // 7-day window should miss it
    const shortResult = await loadRecentMeetingBatch(storage, MEETINGS_DIR, 7);
    assert.strictEqual(shortResult.length, 0);

    // 14-day window should include it
    const longResult = await loadRecentMeetingBatch(storage, MEETINGS_DIR, 14);
    assert.strictEqual(longResult.length, 1);
  });

  it('filters out meetings with non-processed/approved status', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);

    // draft status — should be excluded
    storage.files.set(
      meetingPath(`${today}-draft.md`),
      makeMeetingContent({
        status: 'draft',
        stagedItems: [{ type: 'decision', text: 'Draft decision' }],
      }),
    );

    // raw status — should be excluded
    storage.files.set(
      meetingPath(`${today}-raw.md`),
      makeMeetingContent({
        status: 'raw',
        stagedItems: [{ type: 'learning', text: 'Raw learning' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('skips meetings without staged items', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${today}-empty.md`),
      makeMeetingContent({ status: 'processed' }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('skips unreadable files gracefully', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);

    // File is in listing but read returns null (simulated by not adding content)
    // We need to override list to return a path that doesn't exist in files
    const originalList = storage.list.bind(storage);
    storage.list = async (dir: string, options?: ListOptions) => {
      const results = await originalList(dir, options);
      results.push(meetingPath(`${today}-ghost.md`));
      return results;
    };

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('handles mixed valid and invalid files', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    // Valid processed meeting
    storage.files.set(
      meetingPath(`${today}-valid.md`),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [{ type: 'decision', text: 'Valid decision' }],
      }),
    );

    // Too old
    storage.files.set(
      meetingPath(`${oldDateStr}-old.md`),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [{ type: 'decision', text: 'Old' }],
      }),
    );

    // Wrong status
    storage.files.set(
      meetingPath(`${today}-draft.md`),
      makeMeetingContent({
        status: 'draft',
        stagedItems: [{ type: 'decision', text: 'Draft' }],
      }),
    );

    // No date prefix
    storage.files.set(
      meetingPath('random-notes.md'),
      makeMeetingContent({
        status: 'processed',
        stagedItems: [{ type: 'decision', text: 'No date' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].extraction.decisions[0], 'Valid decision');
  });
});
