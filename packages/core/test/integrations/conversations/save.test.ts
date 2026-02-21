/**
 * Tests for conversation save logic.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { conversationFilename, saveConversationFile, updateConversationFrontmatter } from '../../../src/integrations/conversations/save.js';
import type { ConversationForSave } from '../../../src/integrations/conversations/types.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversation(overrides: Partial<ConversationForSave> = {}): ConversationForSave {
  return {
    title: 'Sprint Planning Discussion',
    date: '2026-02-20',
    source: 'manual',
    participants: ['Alice', 'Bob'],
    rawTranscript: 'Alice: Let\'s discuss the sprint.\nBob: Sounds good.',
    normalizedContent: '**Alice**: Let\'s discuss the sprint.\n\n**Bob**: Sounds good.',
    insights: {
      summary: 'Team discussed sprint priorities.',
      decisions: ['Focus on conversation capture feature'],
      actionItems: ['Alice to write PRD'],
    },
    provenance: {
      source: 'manual',
      capturedAt: '2026-02-20T16:00:00Z',
    },
    ...overrides,
  };
}

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
      return files.has(path) || dirs.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir(dir: string) {
      dirs.add(dir);
    },
    async getModified() {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('conversationFilename', () => {
  it('generates {date}-{slug}.md format', () => {
    const conv = makeConversation({ title: 'Sprint Planning Discussion', date: '2026-02-20' });
    assert.equal(conversationFilename(conv), '2026-02-20-sprint-planning-discussion.md');
  });

  it('handles date with timestamp (strips time)', () => {
    const conv = makeConversation({ date: '2026-02-20T16:00:00Z' });
    const filename = conversationFilename(conv);
    assert.ok(filename.startsWith('2026-02-20-'));
  });

  it('handles empty date (uses today)', () => {
    const conv = makeConversation({ date: '' });
    const filename = conversationFilename(conv);
    const todayStr = new Date().toISOString().slice(0, 10);
    assert.ok(filename.startsWith(todayStr));
  });

  it('handles empty title', () => {
    const conv = makeConversation({ title: '' });
    const filename = conversationFilename(conv);
    assert.ok(filename.endsWith('-untitled.md'));
  });

  it('slugifies special characters', () => {
    const conv = makeConversation({ title: 'Q1 Planning & Review (2026)' });
    const filename = conversationFilename(conv);
    assert.equal(filename, '2026-02-20-q1-planning-review-2026.md');
  });
});

describe('saveConversationFile', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('saves a conversation file with correct path', async () => {
    const conv = makeConversation();
    const result = await saveConversationFile(storage, conv, '/workspace/resources/conversations');
    assert.equal(result, '/workspace/resources/conversations/2026-02-20-sprint-planning-discussion.md');
  });

  it('creates the output directory', async () => {
    const conv = makeConversation();
    await saveConversationFile(storage, conv, '/workspace/resources/conversations');
    assert.ok(storage.dirs.has('/workspace/resources/conversations'));
  });

  it('returns null if file exists and force is false', async () => {
    const conv = makeConversation();
    // Pre-create the file
    storage.files.set('/workspace/resources/conversations/2026-02-20-sprint-planning-discussion.md', 'existing');
    const result = await saveConversationFile(storage, conv, '/workspace/resources/conversations');
    assert.equal(result, null);
  });

  it('overwrites if file exists and force is true', async () => {
    const conv = makeConversation();
    storage.files.set('/workspace/resources/conversations/2026-02-20-sprint-planning-discussion.md', 'existing');
    const result = await saveConversationFile(storage, conv, '/workspace/resources/conversations', { force: true });
    assert.ok(result !== null);
  });

  it('writes valid YAML frontmatter', async () => {
    const conv = makeConversation();
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md');
    assert.ok(content);
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.includes('title: "Sprint Planning Discussion"'));
    assert.ok(content.includes('date: "2026-02-20"'));
    assert.ok(content.includes('source: "manual"'));
    assert.ok(content.includes('captured_at: "2026-02-20T16:00:00Z"'));
    // Check frontmatter closing
    const fmEnd = content.indexOf('---', 4);
    assert.ok(fmEnd > 0);
  });

  it('includes participants section', async () => {
    const conv = makeConversation({ participants: ['Alice', 'Bob', 'Carol'] });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('## Participants'));
    assert.ok(content.includes('- Alice'));
    assert.ok(content.includes('- Bob'));
    assert.ok(content.includes('- Carol'));
  });

  it('includes insight sections when populated', async () => {
    const conv = makeConversation({
      insights: {
        summary: 'A productive conversation.',
        decisions: ['Ship by Friday'],
        actionItems: ['Write tests'],
        openQuestions: ['What about performance?'],
        stakeholders: ['VP Engineering'],
        risks: ['Timeline is tight'],
      },
    });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('## Summary'));
    assert.ok(content.includes('A productive conversation.'));
    assert.ok(content.includes('## Decisions'));
    assert.ok(content.includes('- Ship by Friday'));
    assert.ok(content.includes('## Action Items'));
    assert.ok(content.includes('- [ ] Write tests'));
    assert.ok(content.includes('## Open Questions'));
    assert.ok(content.includes('- What about performance?'));
    assert.ok(content.includes('## Stakeholders'));
    assert.ok(content.includes('- VP Engineering'));
    assert.ok(content.includes('## Risks'));
    assert.ok(content.includes('- Timeline is tight'));
  });

  it('omits insight sections when empty', async () => {
    const conv = makeConversation({
      insights: {
        summary: 'Just a summary.',
        // No other sections
      },
    });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('## Summary'));
    assert.ok(!content.includes('## Decisions'));
    assert.ok(!content.includes('## Action Items'));
    assert.ok(!content.includes('## Open Questions'));
    assert.ok(!content.includes('## Stakeholders'));
    assert.ok(!content.includes('## Risks'));
  });

  it('omits insight sections when arrays are empty', async () => {
    const conv = makeConversation({
      insights: {
        decisions: [],
        actionItems: [],
      },
    });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(!content.includes('## Decisions'));
    assert.ok(!content.includes('## Action Items'));
  });

  it('includes raw transcript and normalized content', async () => {
    const conv = makeConversation();
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('## Conversation'));
    assert.ok(content.includes('**Alice**: Let\'s discuss the sprint.'));
    assert.ok(content.includes('## Raw Transcript'));
    assert.ok(content.includes('Alice: Let\'s discuss the sprint.'));
  });

  it('handles conversation with no participants', async () => {
    const conv = makeConversation({ participants: [] });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(!content.includes('## Participants'));
  });

  it('escapes double quotes in title frontmatter', async () => {
    const conv = makeConversation({ title: 'Discussion about "urgent" issue' });
    await saveConversationFile(storage, conv, '/out');
    const filename = conversationFilename(conv);
    const content = storage.files.get(`/out/${filename}`)!;
    assert.ok(content.includes('title: "Discussion about \\"urgent\\" issue"'));
  });

  // participantIds frontmatter rendering
  it('omits participant_ids field when participantIds is undefined (backward compat)', async () => {
    const conv = makeConversation(); // no participantIds
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(!content.includes('participant_ids'));
  });

  it('writes participant_ids: [] when participantIds is empty array', async () => {
    const conv = makeConversation({ participantIds: [] });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('participant_ids: []'));
  });

  it('writes participant_ids in flow style when participantIds has values', async () => {
    const conv = makeConversation({ participantIds: ['alice-smith', 'bob-jones'] });
    await saveConversationFile(storage, conv, '/out');
    const content = storage.files.get('/out/2026-02-20-sprint-planning-discussion.md')!;
    assert.ok(content.includes('participant_ids: [alice-smith, bob-jones]'));
  });
});

describe('updateConversationFrontmatter', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('no-ops when file does not exist', async () => {
    // Should not throw
    await assert.doesNotReject(() =>
      updateConversationFrontmatter(storage, '/out/nonexistent.md', ['alice'])
    );
  });

  it('inserts participant_ids before closing --- when not present', async () => {
    const content = '---\ntitle: "Test"\ndate: "2026-02-20"\n---\n\n# Test\n';
    storage.files.set('/out/test.md', content);
    await updateConversationFrontmatter(storage, '/out/test.md', ['alice-smith', 'bob-jones']);
    const updated = storage.files.get('/out/test.md')!;
    assert.ok(updated.includes('participant_ids: [alice-smith, bob-jones]'));
    // Body still intact
    assert.ok(updated.includes('# Test'));
    // Title still intact
    assert.ok(updated.includes('title: "Test"'));
  });

  it('replaces existing participant_ids line, not duplicated', async () => {
    const content = '---\ntitle: "Test"\nparticipant_ids: []\n---\n\n# Test\n';
    storage.files.set('/out/test.md', content);
    await updateConversationFrontmatter(storage, '/out/test.md', ['carol']);
    const updated = storage.files.get('/out/test.md')!;
    const matches = [...updated.matchAll(/participant_ids:/g)];
    assert.equal(matches.length, 1, 'participant_ids should appear exactly once');
    assert.ok(updated.includes('participant_ids: [carol]'));
  });

  it('no-ops gracefully on malformed frontmatter (no closing ---)', async () => {
    const content = '---\ntitle: "Test"\nno closing delimiter here';
    storage.files.set('/out/test.md', content);
    await assert.doesNotReject(() =>
      updateConversationFrontmatter(storage, '/out/test.md', ['alice'])
    );
    // File should be unchanged
    assert.equal(storage.files.get('/out/test.md'), content);
  });

  it('no-ops gracefully on content without frontmatter', async () => {
    const content = '# Plain markdown\nNo frontmatter here.\n';
    storage.files.set('/out/test.md', content);
    await assert.doesNotReject(() =>
      updateConversationFrontmatter(storage, '/out/test.md', ['alice'])
    );
    assert.equal(storage.files.get('/out/test.md'), content);
  });

  it('handles slugs with special chars in flow style YAML', async () => {
    const content = '---\ntitle: "T"\ndate: "2026-02-20"\n---\n\n# T\n';
    storage.files.set('/out/test.md', content);
    await updateConversationFrontmatter(storage, '/out/test.md', ['john-oconnor', 'xu-lei']);
    const updated = storage.files.get('/out/test.md')!;
    assert.ok(updated.includes('participant_ids: [john-oconnor, xu-lei]'));
  });

  it('writes participant_ids: [] when called with empty array', async () => {
    const content = '---\ntitle: "T"\ndate: "2026-02-20"\n---\n\n# T\n';
    storage.files.set('/out/test.md', content);
    await updateConversationFrontmatter(storage, '/out/test.md', []);
    const updated = storage.files.get('/out/test.md')!;
    assert.ok(updated.includes('participant_ids: []'));
    // Body still intact
    assert.ok(updated.includes('# T'));
  });
});
