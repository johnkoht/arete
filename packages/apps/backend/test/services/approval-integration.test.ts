/**
 * Integration tests for meeting approval workflow.
 *
 * Tests the full flow: processing → approval → commitments sync.
 * Uses temp directories with real files but mocks external services.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runProcessingSessionTestable, type ProcessingDeps } from '../../src/services/agent.js';
import * as workspaceService from '../../src/services/workspace.js';

// ──────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal Areté workspace structure in a temp directory.
 */
async function createTestWorkspace(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arete-test-'));
  
  // Create required directories
  await fs.mkdir(path.join(tmpDir, 'resources', 'meetings'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'people', 'internal'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'people', 'customers'), { recursive: true });
  
  // Create minimal arete.yaml
  await fs.writeFile(
    path.join(tmpDir, 'arete.yaml'),
    `version: 1
qmd_collection: test-arete
`
  );
  
  return tmpDir;
}

/**
 * Clean up test workspace.
 */
async function cleanupTestWorkspace(workspaceRoot: string): Promise<void> {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
}

/**
 * Create a meeting file with attendees but no attendee_ids.
 */
async function createMeetingFile(
  workspaceRoot: string,
  slug: string,
  options: {
    attendees?: Array<{ name: string; email: string }>;
    status?: string;
    stagedItems?: {
      actionItems?: string[];
      decisions?: string[];
      learnings?: string[];
    };
    itemStatus?: Record<string, 'approved' | 'pending' | 'skipped'>;
  } = {}
): Promise<string> {
  const {
    attendees = [
      { name: 'Sarah Chen', email: 'sarah@example.com' },
      { name: 'John Smith', email: 'john@example.com' },
    ],
    status = 'processed',
    stagedItems = {
      actionItems: ['Send the proposal to Sarah'],
      decisions: ['Use TypeScript for the project'],
      learnings: ['Team prefers async communication'],
    },
    itemStatus = { ai_001: 'approved', de_001: 'approved', le_001: 'approved' },
  } = options;

  const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
  
  // Build frontmatter
  const frontmatter: Record<string, unknown> = {
    title: 'Team Sync',
    date: '2026-03-17',
    status,
    attendees,
    staged_item_status: itemStatus,
    staged_item_source: {
      ai_001: 'ai',
      de_001: 'ai',
      le_001: 'ai',
    },
    staged_item_confidence: {
      ai_001: 0.9,
      de_001: 0.9,
      le_001: 0.9,
    },
  };
  
  // Build body with staged sections
  const bodyParts: string[] = [
    '## Summary',
    'Team sync discussion about Q2 priorities.',
    '',
  ];
  
  if (stagedItems.actionItems && stagedItems.actionItems.length > 0) {
    bodyParts.push('## Staged Action Items');
    stagedItems.actionItems.forEach((item, i) => {
      bodyParts.push(`- ai_${String(i + 1).padStart(3, '0')}: ${item}`);
    });
    bodyParts.push('');
  }
  
  if (stagedItems.decisions && stagedItems.decisions.length > 0) {
    bodyParts.push('## Staged Decisions');
    stagedItems.decisions.forEach((item, i) => {
      bodyParts.push(`- de_${String(i + 1).padStart(3, '0')}: ${item}`);
    });
    bodyParts.push('');
  }
  
  if (stagedItems.learnings && stagedItems.learnings.length > 0) {
    bodyParts.push('## Staged Learnings');
    stagedItems.learnings.forEach((item, i) => {
      bodyParts.push(`- le_${String(i + 1).padStart(3, '0')}: ${item}`);
    });
    bodyParts.push('');
  }
  
  bodyParts.push('## Transcript');
  bodyParts.push('Sarah: Let\'s discuss the roadmap.');
  bodyParts.push('John: I think we should focus on Q2 priorities.');
  
  // Write the file
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return `${key}:\n${formatYamlObject(value, 2)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');
  
  const content = `---\n${yaml}\n---\n\n${bodyParts.join('\n')}\n`;
  await fs.writeFile(meetingPath, content);
  
  return meetingPath;
}

/**
 * Format a nested object as YAML.
 */
function formatYamlObject(obj: unknown, indent: number): string {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const entries = Object.entries(item as Record<string, unknown>);
        const first = entries[0];
        const rest = entries.slice(1);
        let result = `${' '.repeat(indent)}- ${first![0]}: ${JSON.stringify(first![1])}`;
        for (const [k, v] of rest) {
          result += `\n${' '.repeat(indent)}  ${k}: ${JSON.stringify(v)}`;
        }
        return result;
      }
      return `${' '.repeat(indent)}- ${JSON.stringify(item)}`;
    }).join('\n');
  }
  
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj as Record<string, unknown>)
      .map(([k, v]) => `${' '.repeat(indent)}${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
  }
  
  return String(obj);
}

// Note: createPersonFile is available for future tests that need person file fixtures
// async function createPersonFile(workspaceRoot: string, slug: string, name: string, category: 'internal' | 'customers' | 'users' = 'internal'): Promise<string> { ... }

// ──────────────────────────────────────────────────────────────────────────────
// Mock jobs service
// ──────────────────────────────────────────────────────────────────────────────

function makeMockJobs() {
  const appended: Array<{ id: string; line: string }> = [];
  const statuses: Array<{ id: string; status: string }> = [];
  return {
    appended,
    statuses,
    appendEvent(id: string, line: string) {
      appended.push({ id, line });
    },
    setJobStatus(id: string, status: 'running' | 'done' | 'error') {
      statuses.push({ id, status });
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock processing deps
// ──────────────────────────────────────────────────────────────────────────────

interface MeetingIntelligence {
  summary: string;
  actionItems: Array<{
    owner: string;
    ownerSlug: string;
    description: string;
    direction: 'i_owe_them' | 'they_owe_me';
    counterpartySlug?: string;
    confidence?: number;
  }>;
  nextSteps: string[];
  decisions: string[];
  learnings: string[];
}

function toRawLLMJson(intelligence: MeetingIntelligence): object {
  return {
    summary: intelligence.summary,
    action_items: intelligence.actionItems.map((ai) => ({
      owner: ai.owner,
      owner_slug: ai.ownerSlug,
      description: ai.description,
      direction: ai.direction,
      counterparty_slug: ai.counterpartySlug,
      confidence: ai.confidence ?? 0.9,
    })),
    next_steps: intelligence.nextSteps,
    decisions: intelligence.decisions,
    learnings: intelligence.learnings,
  };
}

function makeMockProcessingDeps(
  _workspaceRoot: string,
  aiResponse: MeetingIntelligence
): ProcessingDeps {
  return {
    readFile: (filePath: string) => fs.readFile(filePath, 'utf8'),
    writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content, 'utf8'),
    aiService: {
      call: async () => ({ text: JSON.stringify(toRawLLMJson(aiResponse)) }),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Meeting Approval Integration', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await createTestWorkspace();
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await cleanupTestWorkspace(workspaceRoot);
    }
  });

  describe('attendee resolution during approval', () => {
    it('resolves attendees to slugs when attendee_ids is missing', async () => {
      // Create meeting with attendees but no attendee_ids
      const slug = '2026-03-17-team-sync';
      await createMeetingFile(workspaceRoot, slug, {
        attendees: [
          { name: 'Sarah Chen', email: 'sarah@example.com' },
          { name: 'John Smith', email: 'john@example.com' },
        ],
      });

      // Approve the meeting
      const result = await workspaceService.approveMeeting(workspaceRoot, slug);

      // Read the meeting file to check attendee_ids was written
      const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
      const content = await fs.readFile(meetingPath, 'utf8');

      // Verify attendee_ids is now in frontmatter
      assert.ok(content.includes('attendee_ids:'), 'Should have attendee_ids in frontmatter');
      assert.ok(content.includes('sarah-chen'), 'Should include sarah-chen slug');
      assert.ok(content.includes('john-smith'), 'Should include john-smith slug');
      
      // Verify automation result
      assert.ok(result.automation, 'Should have automation result');
    });

    it('preserves existing attendee_ids if already present', async () => {
      // Create meeting with both attendees and attendee_ids
      const slug = '2026-03-17-existing-ids';
      const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
      
      const content = `---
title: "Team Sync"
date: "2026-03-17"
status: processed
attendees:
  - name: "Sarah Chen"
    email: "sarah@example.com"
attendee_ids:
  - existing-sarah-slug
staged_item_status:
  ai_001: approved
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Summary
Team sync.

## Staged Action Items
- ai_001: Follow up with team

## Transcript
Discussion here.
`;
      await fs.writeFile(meetingPath, content);

      // Approve the meeting
      await workspaceService.approveMeeting(workspaceRoot, slug);

      // Read the meeting file
      const updatedContent = await fs.readFile(meetingPath, 'utf8');

      // Should still have the original slug
      assert.ok(updatedContent.includes('existing-sarah-slug'), 'Should preserve existing attendee_ids');
      // Should NOT have computed new slugs
      assert.ok(!updatedContent.includes('sarah-chen'), 'Should not add computed slugs when attendee_ids exists');
    });

    it('handles empty attendees gracefully', async () => {
      const slug = '2026-03-17-no-attendees';
      await createMeetingFile(workspaceRoot, slug, {
        attendees: [],
      });

      // Should not throw
      const result = await workspaceService.approveMeeting(workspaceRoot, slug);
      
      assert.ok(result, 'Should return result even with no attendees');
      assert.ok(result.automation, 'Should have automation result');
      assert.equal(result.automation!.personMemoryRefreshed.length, 0, 'Should have no refreshed persons');
    });
  });

  describe('full processing → approval flow', () => {
    it('processes meeting with AI and then approves with attendee resolution', async () => {
      const slug = '2026-03-17-full-flow';
      const jobs = makeMockJobs();
      
      // Create a raw meeting file (unprocessed)
      const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
      const rawContent = `---
title: "Planning Session"
date: "2026-03-17"
status: synced
attendees:
  - name: "Alice Johnson"
    email: "alice@example.com"
  - name: "Bob Williams"
    email: "bob@example.com"
---

## Summary
No summary available.

## Transcript
Alice: We need to send the Q2 report to stakeholders.
Bob: I'll handle that by Friday.
Alice: Great. Let's also document the API changes.
`;
      await fs.writeFile(meetingPath, rawContent);

      // Step 1: Process meeting (mock AI extraction)
      const aiResponse: MeetingIntelligence = {
        summary: 'Planning session for Q2 deliverables.',
        actionItems: [
          {
            owner: 'Bob',
            ownerSlug: 'bob-williams',
            description: 'Send Q2 report to stakeholders by Friday',
            direction: 'i_owe_them',
            counterpartySlug: 'alice-johnson',
            confidence: 0.95,
          },
        ],
        nextSteps: [],
        decisions: ['Document API changes before release'],
        learnings: [],
      };
      
      const deps = makeMockProcessingDeps(workspaceRoot, aiResponse);
      await runProcessingSessionTestable(workspaceRoot, slug, 'job-123', jobs, deps);

      // Verify processing completed
      assert.ok(
        jobs.statuses.some(s => s.status === 'done'),
        'Processing should complete successfully'
      );

      // Read processed content
      let processedContent = await fs.readFile(meetingPath, 'utf8');
      assert.ok(processedContent.includes('status: processed'), 'Should be marked as processed');
      assert.ok(processedContent.includes('## Staged Action Items'), 'Should have staged action items');

      // Step 2: Update item status to approved (simulating UI action)
      await workspaceService.updateItemStatus(workspaceRoot, slug, 'ai_001', { status: 'approved' });
      await workspaceService.updateItemStatus(workspaceRoot, slug, 'de_001', { status: 'approved' });

      // Step 3: Approve meeting
      const result = await workspaceService.approveMeeting(workspaceRoot, slug);

      // Verify approval results
      assert.equal(result.status, 'approved', 'Meeting should be approved');
      assert.ok(result.automation, 'Should have automation result');
      
      // Verify attendee_ids was resolved
      const finalContent = await fs.readFile(meetingPath, 'utf8');
      assert.ok(finalContent.includes('attendee_ids:'), 'Should have attendee_ids');
      assert.ok(finalContent.includes('alice-johnson'), 'Should include alice-johnson slug');
      assert.ok(finalContent.includes('bob-williams'), 'Should include bob-williams slug');
    });
  });

  describe('getMeeting returns attendee data', () => {
    it('returns attendees from frontmatter', async () => {
      const slug = '2026-03-17-get-meeting';
      await createMeetingFile(workspaceRoot, slug, {
        attendees: [
          { name: 'Test User', email: 'test@example.com' },
        ],
      });

      const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
      
      assert.ok(meeting, 'Meeting should exist');
      assert.ok(Array.isArray(meeting.attendees), 'Attendees should be an array');
      assert.equal(meeting.attendees.length, 1, 'Should have one attendee');
      assert.equal(meeting.attendees[0]!.name, 'Test User');
    });
  });

  describe('error handling', () => {
    it('throws when meeting not found', async () => {
      await assert.rejects(
        () => workspaceService.approveMeeting(workspaceRoot, 'nonexistent-meeting'),
        /not found|ENOENT/i
      );
    });

    it('handles malformed frontmatter gracefully', async () => {
      const slug = '2026-03-17-malformed';
      const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
      
      // Create meeting with invalid YAML (but parseable with fallbacks)
      const content = `---
title: Test
date: 2026-03-17
status: processed
attendees: not-an-array
staged_item_status:
  ai_001: approved
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Summary
Test meeting.

## Staged Action Items
- ai_001: Test item

## Transcript
Test.
`;
      await fs.writeFile(meetingPath, content);

      // Should not throw - just handle gracefully with empty attendees
      const result = await workspaceService.approveMeeting(workspaceRoot, slug);
      assert.ok(result, 'Should return result even with malformed attendees');
    });
  });
});

describe('extractAttendeeSlugs behavior', () => {
  // These tests verify the core utility function behavior through the workspace service
  
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await createTestWorkspace();
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await cleanupTestWorkspace(workspaceRoot);
    }
  });

  it('handles string attendees (name only)', async () => {
    const slug = '2026-03-17-string-attendees';
    const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
    
    const content = `---
title: "Test"
date: "2026-03-17"
status: processed
attendees:
  - "Jane Doe"
  - "Bob Smith"
staged_item_status:
  ai_001: approved
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Summary
Test.

## Staged Action Items
- ai_001: Test item

## Transcript
Test.
`;
    await fs.writeFile(meetingPath, content);

    await workspaceService.approveMeeting(workspaceRoot, slug);

    const updatedContent = await fs.readFile(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('jane-doe'), 'Should slugify Jane Doe');
    assert.ok(updatedContent.includes('bob-smith'), 'Should slugify Bob Smith');
  });

  it('handles object attendees with name and email', async () => {
    const slug = '2026-03-17-object-attendees';
    const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
    
    const content = `---
title: "Test"
date: "2026-03-17"
status: processed
attendees:
  - name: "Alice Cooper"
    email: "alice@example.com"
staged_item_status:
  ai_001: approved
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Summary
Test.

## Staged Action Items
- ai_001: Test item

## Transcript
Test.
`;
    await fs.writeFile(meetingPath, content);

    await workspaceService.approveMeeting(workspaceRoot, slug);

    const updatedContent = await fs.readFile(meetingPath, 'utf8');
    assert.ok(updatedContent.includes('alice-cooper'), 'Should slugify Alice Cooper');
  });

  it('handles duplicate attendees in different formats', async () => {
    const slug = '2026-03-17-dedupe';
    const meetingPath = path.join(workspaceRoot, 'resources', 'meetings', `${slug}.md`);
    
    // Same person listed twice with different formats
    const content = `---
title: "Test"
date: "2026-03-17"
status: processed
attendees:
  - "John Smith"
  - name: "John Smith"
    email: "john@example.com"
staged_item_status:
  ai_001: approved
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Summary
Test.

## Staged Action Items
- ai_001: Test item

## Transcript
Test.
`;
    await fs.writeFile(meetingPath, content);

    await workspaceService.approveMeeting(workspaceRoot, slug);

    const updatedContent = await fs.readFile(meetingPath, 'utf8');
    // extractAttendeeSlugs processes both formats and may return duplicates
    // (deduplication is not in scope for this utility)
    // This test verifies the approval workflow handles mixed attendee formats
    assert.ok(updatedContent.includes('john-smith'), 'Should resolve john-smith from both formats');
  });
});
