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

/** Build a Format A (staged/processed) meeting file with body sections. */
function makeFormatAContent(opts: {
  status?: string;
  stagedItemOwner?: Record<string, { ownerSlug?: string; direction?: string; counterpartySlug?: string }>;
  actionItems?: Array<{ id: string; text: string }>;
  decisions?: Array<{ id: string; text: string }>;
  learnings?: Array<{ id: string; text: string }>;
  summary?: string;
}): string {
  const status = opts.status ?? 'processed';
  let yaml = `status: ${status}\n`;

  if (opts.stagedItemOwner) {
    yaml += `staged_item_owner:\n`;
    for (const [id, meta] of Object.entries(opts.stagedItemOwner)) {
      yaml += `  ${id}:\n`;
      if (meta.ownerSlug) yaml += `    ownerSlug: ${meta.ownerSlug}\n`;
      if (meta.direction) yaml += `    direction: ${meta.direction}\n`;
      if (meta.counterpartySlug) yaml += `    counterpartySlug: ${meta.counterpartySlug}\n`;
    }
  }

  let body = '';
  if (opts.summary) {
    body += `## Summary\n${opts.summary}\n\n`;
  }
  if (opts.actionItems && opts.actionItems.length > 0) {
    body += `## Staged Action Items\n`;
    for (const item of opts.actionItems) {
      body += `- ${item.id}: ${item.text}\n`;
    }
    body += '\n';
  }
  if (opts.decisions && opts.decisions.length > 0) {
    body += `## Staged Decisions\n`;
    for (const item of opts.decisions) {
      body += `- ${item.id}: ${item.text}\n`;
    }
    body += '\n';
  }
  if (opts.learnings && opts.learnings.length > 0) {
    body += `## Staged Learnings\n`;
    for (const item of opts.learnings) {
      body += `- ${item.id}: ${item.text}\n`;
    }
    body += '\n';
  }

  return `---\n${yaml}---\n\n${body}`;
}

/** Build a Format B (approved) meeting file with frontmatter approved_items. */
function makeFormatBContent(opts: {
  status?: string;
  actionItems?: string[];
  decisions?: string[];
  learnings?: string[];
}): string {
  const status = opts.status ?? 'approved';
  let yaml = `status: ${status}\n`;

  const hasItems = (opts.actionItems?.length || 0) > 0
    || (opts.decisions?.length || 0) > 0
    || (opts.learnings?.length || 0) > 0;

  if (hasItems) {
    yaml += `approved_items:\n`;
    if (opts.actionItems && opts.actionItems.length > 0) {
      yaml += `  actionItems:\n`;
      for (const item of opts.actionItems) {
        yaml += `    - "${item}"\n`;
      }
    }
    if (opts.decisions && opts.decisions.length > 0) {
      yaml += `  decisions:\n`;
      for (const item of opts.decisions) {
        yaml += `    - "${item}"\n`;
      }
    }
    if (opts.learnings && opts.learnings.length > 0) {
      yaml += `  learnings:\n`;
      for (const item of opts.learnings) {
        yaml += `    - "${item}"\n`;
      }
    }
  }

  return `---\n${yaml}---\n\n# Meeting\n`;
}

/** Build a bare meeting file with only a status (no intelligence). */
function makeBareContent(status: string): string {
  return `---\nstatus: ${status}\n---\n\n# Meeting\n`;
}

// ---------------------------------------------------------------------------
// Tests: extractIntelligenceFromFrontmatter
// ---------------------------------------------------------------------------

describe('extractIntelligenceFromFrontmatter', () => {
  it('returns null when body has no staged sections and no approved_items', () => {
    assert.strictEqual(extractIntelligenceFromFrontmatter({}, ''), null);
    assert.strictEqual(extractIntelligenceFromFrontmatter({}, '# Meeting\nSome text'), null);
  });

  it('returns null when approved_items is empty', () => {
    const result = extractIntelligenceFromFrontmatter(
      { approved_items: { actionItems: [], decisions: [], learnings: [] } },
      '',
    );
    assert.strictEqual(result, null);
  });

  // -- Format A: Staged sections in body -----------------------------------

  it('Format A: extracts action items from body staged sections', () => {
    const body = `## Summary\nTest summary\n\n## Staged Action Items\n- ai_001: Send API docs\n`;
    const result = extractIntelligenceFromFrontmatter({}, body);
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 1);
    assert.strictEqual(result.actionItems[0].description, 'Send API docs');
  });

  it('Format A: enriches action items with staged_item_owner metadata', () => {
    const body = `## Staged Action Items\n- ai_001: Map out signature logic for Anthony\n`;
    const frontmatter = {
      staged_item_owner: {
        ai_001: {
          ownerSlug: 'john-koht',
          direction: 'i_owe_them',
          counterpartySlug: 'lindsay-gray',
        },
      },
    };
    const result = extractIntelligenceFromFrontmatter(frontmatter, body);
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 1);
    assert.strictEqual(result.actionItems[0].ownerSlug, 'john-koht');
    assert.strictEqual(result.actionItems[0].direction, 'i_owe_them');
    assert.strictEqual(result.actionItems[0].counterpartySlug, 'lindsay-gray');
    assert.strictEqual(result.actionItems[0].description, 'Map out signature logic for Anthony');
  });

  it('Format A: extracts decisions and learnings from body', () => {
    const body = [
      '## Staged Decisions',
      '- de_001: Note templates should be standardized to 5-10 static templates',
      '',
      '## Staged Learnings',
      '- le_001: Adjuster managers are often unaware of the full template inventory',
    ].join('\n');
    const result = extractIntelligenceFromFrontmatter({}, body);
    assert.ok(result);
    assert.deepStrictEqual(result.decisions, [
      'Note templates should be standardized to 5-10 static templates',
    ]);
    assert.deepStrictEqual(result.learnings, [
      'Adjuster managers are often unaware of the full template inventory',
    ]);
    assert.strictEqual(result.actionItems.length, 0);
  });

  it('Format A: handles all three section types together', () => {
    const body = [
      '## Summary',
      'Test summary',
      '',
      '## Staged Action Items',
      '- ai_001: Review PR',
      '- ai_002: Deploy staging',
      '',
      '## Staged Decisions',
      '- de_001: Use React for frontend',
      '',
      '## Staged Learnings',
      '- le_001: Users prefer batch processing',
    ].join('\n');
    const result = extractIntelligenceFromFrontmatter({}, body);
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 2);
    assert.strictEqual(result.decisions.length, 1);
    assert.strictEqual(result.learnings.length, 1);
    assert.strictEqual(result.actionItems[0].description, 'Review PR');
    assert.strictEqual(result.actionItems[1].description, 'Deploy staging');
    assert.deepStrictEqual(result.decisions, ['Use React for frontend']);
    assert.deepStrictEqual(result.learnings, ['Users prefer batch processing']);
  });

  // -- Format B: approved_items in frontmatter ----------------------------

  it('Format B: extracts from approved_items frontmatter', () => {
    const frontmatter = {
      approved_items: {
        actionItems: [
          'Send API docs (@john-koht)',
          'Review templates (@john-koht)',
        ],
        decisions: ['Use REST API for partner integration'],
        learnings: ['Template sprawl mirrors email sprawl'],
      },
    };
    const result = extractIntelligenceFromFrontmatter(frontmatter, '');
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 2);
    assert.strictEqual(result.actionItems[0].description, 'Send API docs');
    assert.strictEqual(result.actionItems[0].ownerSlug, 'john-koht');
    assert.strictEqual(result.actionItems[1].description, 'Review templates');
    assert.strictEqual(result.actionItems[1].ownerSlug, 'john-koht');
    assert.deepStrictEqual(result.decisions, ['Use REST API for partner integration']);
    assert.deepStrictEqual(result.learnings, ['Template sprawl mirrors email sprawl']);
  });

  it('Format B: parses owner with counterparty notation', () => {
    const frontmatter = {
      approved_items: {
        actionItems: [
          'Send API docs (@john-koht \u2192 @anthony-avina)',
        ],
        decisions: [],
        learnings: [],
      },
    };
    const result = extractIntelligenceFromFrontmatter(frontmatter, '');
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 1);
    assert.strictEqual(result.actionItems[0].description, 'Send API docs');
    assert.strictEqual(result.actionItems[0].ownerSlug, 'john-koht');
    assert.strictEqual(result.actionItems[0].counterpartySlug, 'anthony-avina');
    assert.strictEqual(result.actionItems[0].direction, 'i_owe_them');
  });

  it('Format B: action items without owner notation get empty ownerSlug', () => {
    const frontmatter = {
      approved_items: {
        actionItems: ['Just a plain action item'],
        decisions: [],
        learnings: [],
      },
    };
    const result = extractIntelligenceFromFrontmatter(frontmatter, '');
    assert.ok(result);
    assert.strictEqual(result.actionItems.length, 1);
    assert.strictEqual(result.actionItems[0].description, 'Just a plain action item');
    assert.strictEqual(result.actionItems[0].ownerSlug, '');
  });

  // -- Priority: Format A wins over Format B ------------------------------

  it('Format A takes priority when body has staged sections', () => {
    const body = `## Staged Decisions\n- de_001: From body\n`;
    const frontmatter = {
      approved_items: {
        decisions: ['From frontmatter'],
      },
    };
    const result = extractIntelligenceFromFrontmatter(frontmatter, body);
    assert.ok(result);
    // Format A found items, so Format B is skipped
    assert.deepStrictEqual(result.decisions, ['From body']);
  });

  // -- Empty sections -----------------------------------------------------

  it('returns null when body has section headers but no items', () => {
    const body = `## Staged Action Items\n\n## Staged Decisions\n\n`;
    const result = extractIntelligenceFromFrontmatter({}, body);
    assert.strictEqual(result, null);
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
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'test' }],
      }),
    );
    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('loads Format A processed meetings within date range', async () => {
    const storage = createMockStorage();
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const filename = `${dateStr}-standup.md`;

    storage.files.set(
      meetingPath(filename),
      makeFormatAContent({
        status: 'processed',
        actionItems: [{ id: 'ai_001', text: 'Review PR' }],
        decisions: [{ id: 'de_001', text: 'Ship v2 next week' }],
        stagedItemOwner: {
          ai_001: { ownerSlug: 'john', direction: 'i_owe_them' },
        },
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].meetingPath, meetingPath(filename));
    assert.strictEqual(result[0].extraction.actionItems.length, 1);
    assert.strictEqual(result[0].extraction.actionItems[0].ownerSlug, 'john');
    assert.strictEqual(result[0].extraction.decisions.length, 1);
  });

  it('loads Format B approved meetings', async () => {
    const storage = createMockStorage();
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${dateStr}-approved.md`),
      makeFormatBContent({
        status: 'approved',
        learnings: ['Users love dark mode'],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].extraction.learnings, ['Users love dark mode']);
  });

  it('filters out meetings older than lookback window', async () => {
    const storage = createMockStorage();
    // 30 days ago -- outside default 7-day window
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const oldDateStr = oldDate.toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${oldDateStr}-old-meeting.md`),
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'Old decision' }],
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
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'Recent decision' }],
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

    // draft status -- should be excluded
    storage.files.set(
      meetingPath(`${today}-draft.md`),
      makeFormatAContent({
        status: 'draft',
        decisions: [{ id: 'de_001', text: 'Draft decision' }],
      }),
    );

    // raw status -- should be excluded
    storage.files.set(
      meetingPath(`${today}-raw.md`),
      makeFormatAContent({
        status: 'raw',
        learnings: [{ id: 'le_001', text: 'Raw learning' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.deepStrictEqual(result, []);
  });

  it('skips meetings without intelligence items', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);

    storage.files.set(
      meetingPath(`${today}-empty.md`),
      makeBareContent('processed'),
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

    // Valid processed meeting (Format A)
    storage.files.set(
      meetingPath(`${today}-valid.md`),
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'Valid decision' }],
      }),
    );

    // Too old
    storage.files.set(
      meetingPath(`${oldDateStr}-old.md`),
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'Old' }],
      }),
    );

    // Wrong status
    storage.files.set(
      meetingPath(`${today}-draft.md`),
      makeFormatAContent({
        status: 'draft',
        decisions: [{ id: 'de_001', text: 'Draft' }],
      }),
    );

    // No date prefix
    storage.files.set(
      meetingPath('random-notes.md'),
      makeFormatAContent({
        status: 'processed',
        decisions: [{ id: 'de_001', text: 'No date' }],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].extraction.decisions[0], 'Valid decision');
  });

  it('loads mixed batch of Format A and Format B meetings', async () => {
    const storage = createMockStorage();
    const today = new Date().toISOString().slice(0, 10);

    // Format A: processed with staged sections
    storage.files.set(
      meetingPath(`${today}-standup.md`),
      makeFormatAContent({
        status: 'processed',
        actionItems: [{ id: 'ai_001', text: 'Review PR' }],
        stagedItemOwner: {
          ai_001: { ownerSlug: 'john-koht', direction: 'i_owe_them' },
        },
      }),
    );

    // Format B: approved with approved_items
    storage.files.set(
      meetingPath(`${today}-retro.md`),
      makeFormatBContent({
        status: 'approved',
        decisions: ['Use REST API for partner integration'],
        learnings: ['Template sprawl mirrors email sprawl'],
      }),
    );

    const result = await loadRecentMeetingBatch(storage, MEETINGS_DIR);
    assert.strictEqual(result.length, 2);

    // Find the Format A and Format B results (order not guaranteed)
    const formatA = result.find(r => r.meetingPath.includes('standup'));
    const formatB = result.find(r => r.meetingPath.includes('retro'));

    assert.ok(formatA);
    assert.strictEqual(formatA.extraction.actionItems.length, 1);
    assert.strictEqual(formatA.extraction.actionItems[0].ownerSlug, 'john-koht');

    assert.ok(formatB);
    assert.deepStrictEqual(formatB.extraction.decisions, ['Use REST API for partner integration']);
    assert.deepStrictEqual(formatB.extraction.learnings, ['Template sprawl mirrors email sprawl']);
  });
});
