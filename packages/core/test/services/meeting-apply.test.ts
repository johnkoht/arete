/**
 * Tests for meeting-apply service.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyMeetingIntelligence, clearStagedSections } from '../../src/services/meeting-apply.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { MeetingIntelligence } from '../../src/services/meeting-extraction.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeMeetingFile(
  root: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body: string,
): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => `  - ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n')}`;
      }
      return `${k}: ${v == null ? '' : JSON.stringify(v)}`;
    })
    .join('\n');
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n\n${body}`, 'utf8');
}

function writeAgendaFile(
  root: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body: string,
): void {
  const dir = join(root, 'now', 'agendas');
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n\n${body}`, 'utf8');
}

// ---------------------------------------------------------------------------
// Sample Intelligence
// ---------------------------------------------------------------------------

const sampleIntelligence: MeetingIntelligence = {
  summary: 'Discussion about project roadmap and next steps.',
  actionItems: [
    {
      owner: 'John Smith',
      ownerSlug: 'john-smith',
      description: 'Review the API documentation',
      direction: 'i_owe_them',
      counterpartySlug: 'jane-doe',
      confidence: 0.9,
    },
    {
      owner: 'Jane Doe',
      ownerSlug: 'jane-doe',
      description: 'Schedule follow-up meeting',
      direction: 'they_owe_me',
      confidence: 0.85,
    },
  ],
  nextSteps: ['Complete review by Friday'],
  decisions: ['Use TypeScript for the project', 'Deploy to AWS'],
  learnings: ['Team prefers async communication'],
};

// ---------------------------------------------------------------------------
// Tests: clearStagedSections
// ---------------------------------------------------------------------------

describe('clearStagedSections', () => {
  it('removes all staged sections and summary', () => {
    const content = `# Meeting Notes

## Summary
This is the summary.

## Staged Action Items
- ai_001: Do something

## Staged Decisions
- de_001: Decided something

## Staged Learnings
- le_001: Learned something

## Transcript
Speaker 1: Hello
`;

    const result = clearStagedSections(content);

    assert.ok(!result.includes('## Summary'), 'Should not contain ## Summary');
    assert.ok(!result.includes('## Staged Action Items'), 'Should not contain ## Staged Action Items');
    assert.ok(!result.includes('## Staged Decisions'), 'Should not contain ## Staged Decisions');
    assert.ok(!result.includes('## Staged Learnings'), 'Should not contain ## Staged Learnings');
    assert.ok(result.includes('# Meeting Notes'), 'Should preserve # Meeting Notes');
    assert.ok(result.includes('## Transcript'), 'Should preserve ## Transcript');
    assert.ok(result.includes('Speaker 1: Hello'), 'Should preserve transcript content');
  });

  it('preserves content before and after staged sections', () => {
    const content = `---
title: Test Meeting
---

# Meeting

## Context
Some context here.

## Summary
Summary text.

## Staged Action Items
- ai_001: Action

## Notes
Additional notes.
`;

    const result = clearStagedSections(content);

    assert.ok(result.includes('## Context'), 'Should preserve ## Context');
    assert.ok(result.includes('Some context here.'), 'Should preserve context content');
    assert.ok(result.includes('## Notes'), 'Should preserve ## Notes');
    assert.ok(result.includes('Additional notes.'), 'Should preserve notes content');
    assert.ok(!result.includes('## Summary'), 'Should not contain ## Summary');
    assert.ok(!result.includes('## Staged Action Items'), 'Should not contain ## Staged Action Items');
  });

  it('returns content unchanged if no staged sections exist', () => {
    const content = `# Meeting

## Transcript
Hello world.
`;

    const result = clearStagedSections(content);
    assert.equal(result.trim(), content.trim());
  });

  it('handles empty content', () => {
    const result = clearStagedSections('');
    assert.equal(result, '');
  });

  it('removes ## Core and ## Could include staged sections (Task 8)', () => {
    const content = `# Meeting Notes

## Core
Wiki-aware lead prose.

## Could include
- Risks: Sara flagged churn
- Pricing: tier may shift

## Staged Action Items
- ai_001: Do something

## Transcript
Speaker 1: Hello
`;

    const result = clearStagedSections(content);

    assert.ok(!result.includes('## Core'), 'Should not contain ## Core');
    assert.ok(!result.includes('Wiki-aware lead'), 'Should drop core body');
    assert.ok(!result.includes('## Could include'), 'Should not contain ## Could include');
    assert.ok(!result.includes('Sara flagged churn'), 'Should drop could-include body');
    assert.ok(!result.includes('## Staged Action Items'));
    assert.ok(result.includes('# Meeting Notes'));
    assert.ok(result.includes('## Transcript'));
  });
});

// ---------------------------------------------------------------------------
// Tests: applyMeetingIntelligence
// ---------------------------------------------------------------------------

describe('applyMeetingIntelligence', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meeting-apply-test-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes staged sections to meeting file', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      date: '2026-03-19',
      status: 'synced',
    }, `# Test Meeting

## Transcript
Speaker: Hello world.
`);

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const result = await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.equal(result.actionItemsStaged, 2);
    assert.equal(result.decisionsStaged, 2);
    assert.equal(result.learningsStaged, 1);
    assert.equal(result.warnings.length, 0);

    // Verify the file was updated
    const updatedContent = readFileSync(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('## Summary'), 'Should contain ## Summary');
    assert.ok(updatedContent.includes('Discussion about project roadmap'), 'Should contain summary text');
    assert.ok(updatedContent.includes('## Staged Action Items'), 'Should contain ## Staged Action Items');
    assert.ok(updatedContent.includes('ai_001'), 'Should contain ai_001');
    assert.ok(updatedContent.includes('Review the API documentation'), 'Should contain action item');
    assert.ok(updatedContent.includes('## Staged Decisions'), 'Should contain ## Staged Decisions');
    assert.ok(updatedContent.includes('de_001'), 'Should contain de_001');
    assert.ok(updatedContent.includes('Use TypeScript for the project'), 'Should contain decision');
    assert.ok(updatedContent.includes('## Staged Learnings'), 'Should contain ## Staged Learnings');
    assert.ok(updatedContent.includes('le_001'), 'Should contain le_001');
    assert.ok(updatedContent.includes('Team prefers async communication'), 'Should contain learning');
  });

  it('updates frontmatter with processed status', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      date: '2026-03-19',
      status: 'synced',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('status: processed'), 'Should have status: processed');
    assert.ok(updatedContent.includes('processed_at:'), 'Should have processed_at timestamp');
  });

  it('archives linked agenda when present', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      date: '2026-03-19',
      agenda: 'now/agendas/2026-03-19-test-meeting.md',
    }, '# Test Meeting\n');

    writeAgendaFile(tmpDir, '2026-03-19-test-meeting.md', {
      title: 'Test Meeting Agenda',
      status: 'active',
    }, `## Topics
- [ ] Item 1
`);

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const result = await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.equal(result.agendaArchived, 'now/agendas/2026-03-19-test-meeting.md');

    // Verify agenda was updated
    const agendaPath = join(tmpDir, 'now', 'agendas', '2026-03-19-test-meeting.md');
    const updatedAgenda = readFileSync(agendaPath, 'utf8');
    assert.ok(updatedAgenda.includes('status: processed'), 'Agenda should have status: processed');
  });

  it('skips agenda archival when skipAgenda is set', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      agenda: 'now/agendas/agenda.md',
    }, '# Test Meeting\n');

    writeAgendaFile(tmpDir, 'agenda.md', {
      title: 'Agenda',
      status: 'active',
    }, 'Topics here.\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const result = await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
      { skipAgenda: true },
    );

    assert.equal(result.agendaArchived, null);

    // Verify agenda was NOT updated
    const agendaPath = join(tmpDir, 'now', 'agendas', 'agenda.md');
    const agenda = readFileSync(agendaPath, 'utf8');
    assert.ok(agenda.includes('status: "active"'), 'Agenda should still have status: active');
  });

  it('clears existing staged sections when clear is set', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
    }, `# Test Meeting

## Summary
Old summary.

## Staged Action Items
- ai_001: Old action item

## Staged Decisions
- de_001: Old decision

## Transcript
Hello.
`);

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
      { clear: true },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');

    // Should not contain old content
    assert.ok(!updatedContent.includes('Old summary'), 'Should not contain old summary');
    assert.ok(!updatedContent.includes('Old action item'), 'Should not contain old action item');
    assert.ok(!updatedContent.includes('Old decision'), 'Should not contain old decision');

    // Should contain new content
    assert.ok(updatedContent.includes('Discussion about project roadmap'), 'Should contain new summary');
    assert.ok(updatedContent.includes('Review the API documentation'), 'Should contain new action item');
  });

  it('is idempotent - running twice produces same staged content', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      date: '2026-03-19',
    }, `# Test Meeting

## Transcript
Hello.
`);

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    // First application
    await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    // Second application (with clear to simulate reprocessing)
    await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
      { clear: true },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');

    // Should have the same staged sections
    assert.ok(updatedContent.includes('## Summary'), 'Should have summary');
    assert.ok(updatedContent.includes('Discussion about project roadmap'), 'Should have summary text');
    assert.ok(updatedContent.includes('## Staged Action Items'), 'Should have staged action items');
    assert.ok(updatedContent.includes('ai_001'), 'Should have ai_001');
    assert.ok(updatedContent.includes('## Staged Decisions'), 'Should have staged decisions');
    assert.ok(updatedContent.includes('de_001'), 'Should have de_001');
    assert.ok(updatedContent.includes('## Staged Learnings'), 'Should have staged learnings');
    assert.ok(updatedContent.includes('le_001'), 'Should have le_001');
  });

  it('throws error when meeting file not found', async () => {
    const meetingPath = join(tmpDir, 'resources', 'meetings', 'nonexistent.md');

    await assert.rejects(
      () => applyMeetingIntelligence(
        meetingPath,
        sampleIntelligence,
        { storage, workspaceRoot: tmpDir },
      ),
      /Meeting file not found/,
    );
  });

  it('warns when linked agenda file not found', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      agenda: 'now/agendas/missing.md',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const result = await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.ok(result.warnings.some(w => w.includes('Linked agenda not found')), 'Should warn about missing agenda');
    assert.equal(result.agendaArchived, null);
  });

  it('resolves relative paths against workspace root', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
    }, '# Test Meeting\n');

    // Use relative path
    const result = await applyMeetingIntelligence(
      'resources/meetings/test.md',
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.equal(result.meetingPath, join(tmpDir, 'resources/meetings/test.md'));
  });

  it('handles meeting with no frontmatter', async () => {
    const dir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'test.md'), `# Test Meeting

## Transcript
Hello world.
`, 'utf8');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const result = await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.equal(result.actionItemsStaged, 2);

    const updatedContent = readFileSync(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('---'), 'Should have frontmatter delimiters');
    assert.ok(updatedContent.includes('status: processed'), 'Should have status: processed');
    assert.ok(updatedContent.includes('## Summary'), 'Should have summary');
  });

  it('handles empty intelligence gracefully', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const emptyIntelligence: MeetingIntelligence = {
      summary: '',
      actionItems: [],
      nextSteps: [],
      decisions: [],
      learnings: [],
    };

    const result = await applyMeetingIntelligence(
      meetingPath,
      emptyIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    assert.equal(result.actionItemsStaged, 0);
    assert.equal(result.decisionsStaged, 0);
    assert.equal(result.learningsStaged, 0);

    const updatedContent = readFileSync(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('status: processed'), 'Should have status: processed');
    assert.ok(updatedContent.includes('## Summary'), 'Should have summary section');
    // Empty sections should not be included
    assert.ok(!updatedContent.includes('## Staged Action Items'), 'Should not have staged action items');
    assert.ok(!updatedContent.includes('## Staged Decisions'), 'Should not have staged decisions');
    assert.ok(!updatedContent.includes('## Staged Learnings'), 'Should not have staged learnings');
  });

  it('formats action items with owner arrow notation', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    await applyMeetingIntelligence(
      meetingPath,
      sampleIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');

    // Check action item formatting with owner notation
    assert.ok(updatedContent.includes('@john-smith'), 'Should have owner slug');
    assert.ok(updatedContent.includes('→'), 'Should have arrow notation');
  });

  it('writes topics and item counts to frontmatter', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
      date: '2026-04-05',
      status: 'synced',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const intelligenceWithTopics: MeetingIntelligence = {
      ...sampleIntelligence,
      topics: ['email-templates', 'q2-planning'],
    };

    await applyMeetingIntelligence(
      meetingPath,
      intelligenceWithTopics,
      { storage, workspaceRoot: tmpDir },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');
    // topics
    assert.ok(updatedContent.includes('email-templates'), 'Should have topic slug');
    assert.ok(updatedContent.includes('q2-planning'), 'Should have second topic slug');
    // counts: sampleIntelligence has 2 action items (1 mine, 1 theirs), 2 decisions, 1 learning
    assert.ok(updatedContent.includes('open_action_items: 2'), 'Should have open_action_items: 2');
    assert.ok(updatedContent.includes('my_commitments: 1'), 'Should have my_commitments: 1');
    assert.ok(updatedContent.includes('their_commitments: 1'), 'Should have their_commitments: 1');
    assert.ok(updatedContent.includes('decisions_count: 2'), 'Should have decisions_count: 2');
    assert.ok(updatedContent.includes('learnings_count: 1'), 'Should have learnings_count: 1');
  });

  it('writes empty topics array and zero counts when intelligence has none', async () => {
    writeMeetingFile(tmpDir, 'test.md', {
      title: 'Test Meeting',
    }, '# Test Meeting\n');

    const meetingPath = join(tmpDir, 'resources', 'meetings', 'test.md');

    const emptyIntelligence: MeetingIntelligence = {
      summary: '',
      actionItems: [],
      nextSteps: [],
      decisions: [],
      learnings: [],
    };

    await applyMeetingIntelligence(
      meetingPath,
      emptyIntelligence,
      { storage, workspaceRoot: tmpDir },
    );

    const updatedContent = readFileSync(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('open_action_items: 0'), 'Should have open_action_items: 0');
    assert.ok(updatedContent.includes('my_commitments: 0'), 'Should have my_commitments: 0');
    assert.ok(updatedContent.includes('their_commitments: 0'), 'Should have their_commitments: 0');
    assert.ok(updatedContent.includes('decisions_count: 0'), 'Should have decisions_count: 0');
    assert.ok(updatedContent.includes('learnings_count: 0'), 'Should have learnings_count: 0');
  });

  // ---------------------------------------------------------------------
  // Phase A #1 — alias/merge normalization of intelligence.topics
  // ---------------------------------------------------------------------

  describe('topic alias/merge', () => {
    async function makePaths(root: string) {
      const { WorkspaceService } = await import('../../src/services/workspace.js');
      return new WorkspaceService(storage).getPaths(root);
    }

    function seedTopicPage(root: string, slug: string, aliases: string[] = []): void {
      const dir = join(root, '.arete', 'memory', 'topics');
      mkdirSync(dir, { recursive: true });
      const lines = [
        '---',
        `topic_slug: ${slug}`,
        'status: active',
        'first_seen: 2026-03-01',
        'last_refreshed: 2026-04-22',
        'sources_integrated: []',
      ];
      if (aliases.length > 0) {
        lines.push('aliases:');
        for (const a of aliases) lines.push(`  - ${a}`);
      }
      lines.push('---');
      lines.push('');
      lines.push(`# ${slug}`);
      writeFileSync(join(dir, `${slug}.md`), lines.join('\n'));
    }

    it('normalizes LLM-proposed slugs against existing canonical slugs', async () => {
      writeMeetingFile(tmpDir, 'm.md', {
        title: 'M',
        date: '2026-04-22',
        status: 'synced',
      }, '# M\n');
      const meetingPath = join(tmpDir, 'resources', 'meetings', 'm.md');

      seedTopicPage(tmpDir, 'cover-whale-templates');

      const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
      const topicMemory = new TopicMemoryService(storage);

      const intelligence = {
        summary: 's',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
        topics: ['cover-whale-email-templates'], // near-dup of existing
      };

      const paths = await makePaths(tmpDir);
      await applyMeetingIntelligence(meetingPath, intelligence, {
        storage,
        workspaceRoot: tmpDir,
        topicMemory,
        workspacePaths: paths,
      });

      const updated = readFileSync(meetingPath, 'utf8');
      // Jaccard(3/4) = 0.75 > 0.67 threshold → coerced to existing slug
      assert.ok(updated.includes('- cover-whale-templates'),
        'near-dup must be coerced to existing canonical slug');
      assert.ok(!updated.includes('cover-whale-email-templates'),
        'original near-dup slug must NOT appear in frontmatter');
    });

    it('keeps low-overlap proposed slugs as new topics', async () => {
      writeMeetingFile(tmpDir, 'm.md', {
        title: 'M',
        date: '2026-04-22',
        status: 'synced',
      }, '# M\n');
      const meetingPath = join(tmpDir, 'resources', 'meetings', 'm.md');

      seedTopicPage(tmpDir, 'cover-whale-templates');

      const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
      const topicMemory = new TopicMemoryService(storage);

      const intelligence = {
        summary: 's',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
        topics: ['completely-different-subject'],
      };

      const paths = await makePaths(tmpDir);
      await applyMeetingIntelligence(meetingPath, intelligence, {
        storage,
        workspaceRoot: tmpDir,
        topicMemory,
        workspacePaths: paths,
      });

      const updated = readFileSync(meetingPath, 'utf8');
      assert.ok(updated.includes('- completely-different-subject'),
        'disjoint slug stays as-is');
    });

    it('skipTopicAlias: true bypasses the pass (--skip-topics path)', async () => {
      writeMeetingFile(tmpDir, 'm.md', {
        title: 'M',
        date: '2026-04-22',
        status: 'synced',
      }, '# M\n');
      const meetingPath = join(tmpDir, 'resources', 'meetings', 'm.md');

      seedTopicPage(tmpDir, 'cover-whale-templates');

      const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
      const topicMemory = new TopicMemoryService(storage);

      const intelligence = {
        summary: 's',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
        topics: ['cover-whale-email-templates'],
      };

      const paths = await makePaths(tmpDir);
      await applyMeetingIntelligence(
        meetingPath,
        intelligence,
        { storage, workspaceRoot: tmpDir, topicMemory, workspacePaths: paths },
        { skipTopicAlias: true },
      );

      const updated = readFileSync(meetingPath, 'utf8');
      // With skipTopicAlias, the original slug is written verbatim (no coercion).
      assert.ok(updated.includes('- cover-whale-email-templates'),
        '--skip-topics must preserve raw slugs verbatim');
    });

    it('no topicMemory dep: passes topics through unchanged (backward compat)', async () => {
      writeMeetingFile(tmpDir, 'm.md', {
        title: 'M',
        date: '2026-04-22',
        status: 'synced',
      }, '# M\n');
      const meetingPath = join(tmpDir, 'resources', 'meetings', 'm.md');

      const intelligence = {
        summary: 's',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
        topics: ['anything-goes'],
      };

      await applyMeetingIntelligence(meetingPath, intelligence, {
        storage,
        workspaceRoot: tmpDir,
      });

      const updated = readFileSync(meetingPath, 'utf8');
      assert.ok(updated.includes('- anything-goes'),
        'pre-topic-wiki-memory callers (no topicMemory dep) are unaffected');
    });
  });
});
