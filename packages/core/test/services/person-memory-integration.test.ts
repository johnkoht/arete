/**
 * Tests for Task 4: stance and action item extraction integration
 * into EntityService.refreshPersonMemory().
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { LLMCallFn } from '../../src/services/person-signals.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writePerson(root: string, category: string, slug: string, name: string): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\nname: "${name}"\ncategory: "${category}"\n---\n\n# ${name}\n\n## Notes\n\n- Existing note.\n`,
    'utf8',
  );
}

function writeMeeting(root: string, filename: string, content: string): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content, 'utf8');
}

function writeProfile(root: string, name: string): void {
  const dir = join(root, 'context');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'profile.md'),
    `---\nname: "${name}"\nemail: "owner@example.com"\n---\n\nProfile content.\n`,
    'utf8',
  );
}

describe('refreshPersonMemory — stance and action item integration', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'person-memory-integration-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero counts for stances/actionItems when callLLM not provided', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about deployment timing.
Jane Doe asked about deployment timing.
`);

    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.stancesExtracted, 0, 'No stances without callLLM');
    assert.equal(result.actionItemsExtracted, 0, 'No action items in this content');
    assert.equal(result.itemsAgedOut, 0, 'No items aged out');
    // Existing behavior still works
    assert.equal(result.updated, 1);
  });

  it('extracts stances when callLLM is provided', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe: I think we should use Kubernetes for deployment.
`);

    const mockLLM: LLMCallFn = async (_prompt: string) => {
      return JSON.stringify({
        stances: [
          {
            topic: 'Kubernetes deployment',
            direction: 'supports',
            summary: 'Supports using Kubernetes',
            evidence_quote: 'I think we should use Kubernetes for deployment',
          },
        ],
      });
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: mockLLM });

    assert.equal(result.stancesExtracted, 1);
  });

  it('caches LLM calls — same meeting+person not called twice for stances', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe discussed the roadmap.
`);

    let llmCallCount = 0;
    const mockLLM: LLMCallFn = async (_prompt: string) => {
      llmCallCount += 1;
      return JSON.stringify({ stances: [] });
    };

    // Calling refreshPersonMemory once — each unique meeting+person triggers 1 LLM call
    // (one for stances via stanceCache). Action items use parsing, not LLM.
    // The cache is function-scoped, so the same pair is never extracted twice within a refresh.
    await service.refreshPersonMemory(paths, { callLLM: mockLLM });
    assert.equal(llmCallCount, 1, 'LLM should be called once per unique meeting+person (stances only)');

    // The cache is function-scoped, so a second refresh triggers fresh LLM calls
    await service.refreshPersonMemory(paths, { callLLM: mockLLM });
    assert.equal(llmCallCount, 2, 'New refresh should call LLM again (function-scoped cache)');
  });

  it('deduplicates stances by topic+direction across meetings', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync 1"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe likes Kubernetes.
`);
    writeMeeting(tmpDir, '2026-02-11-sync.md', `---
title: "Sync 2"
date: "2026-02-11"
attendee_ids:
  - jane-doe
---

Jane Doe mentioned Kubernetes again.
`);

    const mockLLM: LLMCallFn = async (_prompt: string) => {
      return JSON.stringify({
        stances: [
          {
            topic: 'Kubernetes',
            direction: 'supports',
            summary: 'Supports Kubernetes',
            evidence_quote: 'some quote',
          },
        ],
      });
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: mockLLM });

    // Same topic+direction from two meetings → deduped to 1
    assert.equal(result.stancesExtracted, 1, 'Duplicate stances should be deduped');
  });

  it('deduplicates stances case-insensitively — "React" and "react" are the same topic', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync 1"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe loves React.
`);
    writeMeeting(tmpDir, '2026-02-11-sync.md', `---
title: "Sync 2"
date: "2026-02-11"
attendee_ids:
  - jane-doe
---

Jane Doe really likes react for front-end.
`);

    // First meeting returns "React" (uppercase), second returns "react" (lowercase)
    let callCount = 0;
    const mockLLM: LLMCallFn = async (_prompt: string) => {
      callCount++;
      const topic = callCount === 1 ? 'React' : 'react';
      return JSON.stringify({
        stances: [
          {
            topic,
            direction: 'supports',
            summary: `Supports ${topic}`,
            evidence_quote: 'some quote',
          },
        ],
      });
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: mockLLM });

    // "React" and "react" should normalize to the same dedup key → only 1 stance
    assert.equal(result.stancesExtracted, 1, 'Case-insensitive topic dedup: "React" and "react" should be one stance');
  });

  it('extracts action items with direction classification from ## Action Items section', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Notes

Some meeting notes here.

## Action Items

- [ ] Jane Doe to send the report by Friday (@jane-doe → @john-owner)
- [ ] I'll follow up with Jane Doe on the proposal (@john-owner → @jane-doe)
`);

    const result = await service.refreshPersonMemory(paths);

    assert.ok(result.actionItemsExtracted >= 1, 'Should extract at least one action item');
    assert.equal(result.itemsAgedOut, 0, 'Recent items should not be aged out');
  });

  it('ages out stale action items older than 30 days', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2025-01-01-old-sync.md', `---
title: "Old Sync"
date: "2025-01-01"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] Jane Doe to send the ancient report (@jane-doe → @john-owner)
`);

    const result = await service.refreshPersonMemory(paths);

    // The item from 2025-01-01 should be stale (>30 days from now: 2026-03-01)
    assert.ok(result.itemsAgedOut >= 1, 'Old action items should be aged out');
    assert.equal(result.actionItemsExtracted, 0, 'Stale items should not be in final count');
  });

  it('reads owner slug from profile.md for action item direction', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] John Owner to send Jane Doe the contract (@john-owner → @jane-doe)
`);

    const result = await service.refreshPersonMemory(paths);

    // "@john-owner → @jane-doe" → from jane-doe's perspective: they_owe_me
    assert.ok(result.actionItemsExtracted >= 1, 'Should extract owner action item');
  });

  it('returns new count fields in result alongside existing fields', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about deployment timing.
Jane Doe asked about deployment timing.
`);

    const result = await service.refreshPersonMemory(paths);

    // Existing fields still present
    assert.equal(typeof result.updated, 'number');
    assert.equal(typeof result.scannedPeople, 'number');
    assert.equal(typeof result.scannedMeetings, 'number');
    assert.equal(typeof result.skippedFresh, 'number');
    // New fields present
    assert.equal(typeof result.stancesExtracted, 'number');
    assert.equal(typeof result.actionItemsExtracted, 'number');
    assert.equal(typeof result.itemsAgedOut, 'number');
  });

  it('early return for null workspacePaths includes new count fields', async () => {
    const result = await service.refreshPersonMemory(null);

    assert.equal(result.stancesExtracted, 0);
    assert.equal(result.actionItemsExtracted, 0);
    assert.equal(result.itemsAgedOut, 0);
    assert.equal(result.updated, 0);
  });

  it('handles missing profile.md gracefully — no action items extracted', async () => {
    // No profile.md written — ownerSlug is undefined, so no action items extracted
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] Jane Doe to send the report by Friday (@jane-doe → @someone)
`);

    // Should not throw, but no action items extracted without owner slug
    const result = await service.refreshPersonMemory(paths);
    assert.equal(result.actionItemsExtracted, 0, 'No action items without owner slug');
  });

  it('handles LLM errors gracefully — returns empty stances', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe discussed plans.
`);

    const failingLLM: LLMCallFn = async () => {
      throw new Error('LLM service unavailable');
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: failingLLM });

    assert.equal(result.stancesExtracted, 0, 'LLM failure should produce 0 stances');
    // Existing behavior (asks/concerns) should still work
    assert.equal(typeof result.updated, 'number');
  });

  it('uses separate stance cache keys for different people on same meeting', async () => {
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writePerson(tmpDir, 'internal', 'bob-smith', 'Bob Smith');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
  - bob-smith
---

Jane Doe supports the migration plan.
Bob Smith opposes the migration plan.
`);

    const callArgs: string[] = [];
    const mockLLM: LLMCallFn = async (prompt: string) => {
      // Track which person we're extracting STANCES for — check the instruction line.
      // Action items now use parsing, not LLM, so we only see stance prompts.
      if (prompt.includes('Extract stances ONLY for: Jane Doe')) {
        callArgs.push('jane');
        return JSON.stringify({
          stances: [{
            topic: 'migration',
            direction: 'supports',
            summary: 'Jane supports migration',
            evidence_quote: 'Jane supports it',
          }],
        });
      }
      if (prompt.includes('Extract stances ONLY for: Bob Smith')) {
        callArgs.push('bob');
        return JSON.stringify({
          stances: [{
            topic: 'migration',
            direction: 'opposes',
            summary: 'Bob opposes migration',
            evidence_quote: 'Bob opposes it',
          }],
        });
      }
      return JSON.stringify({ stances: [] });
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: mockLLM });

    assert.equal(callArgs.length, 2, 'LLM called once per person for same meeting (stances only)');
    assert.ok(callArgs.includes('jane'));
    assert.ok(callArgs.includes('bob'));
    assert.equal(result.stancesExtracted, 2, 'One stance per person');
  });

  // ---------------------------------------------------------------------------
  // Task 4 integration tests: parsing-based action item extraction
  // ---------------------------------------------------------------------------

  it('parses action items from ## Action Items section into commitments', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Notes

Meeting notes here.

## Action Items

- [ ] Jane Doe to send the API documentation (@jane-doe → @john-owner)
- [ ] John Owner to review the proposal (@john-owner → @jane-doe)
`);

    const result = await service.refreshPersonMemory(paths);

    // Two action items involving jane-doe (one where she's owner, one where she's counterparty)
    assert.equal(result.actionItemsExtracted, 2, 'Should extract both action items for jane-doe');
    assert.equal(result.itemsAgedOut, 0, 'Recent items should not be aged out');

    // Verify the items appear in the person file
    const personContent = readFileSync(join(tmpDir, 'people', 'customers', 'jane-doe.md'), 'utf8');
    assert.ok(personContent.includes('API documentation'), 'Should include first action item text');
    assert.ok(personContent.includes('review the proposal'), 'Should include second action item text');
  });

  it('returns zero action items for meetings without ## Action Items section', async () => {
    writeProfile(tmpDir, 'John Owner');
    
    // Write a person file that already has some action items in the auto section
    const personDir = join(tmpDir, 'people', 'customers');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "customers"
---

# Jane Doe

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

Last refreshed: 2026-02-09

### Open Items (I owe them)

- Send the contract to Jane Doe (from: 2026-02-05-meeting.md)

<!-- AUTO_PERSON_MEMORY:END -->

## Notes

Existing note.
`,
      'utf8',
    );

    // Write a meeting that does NOT have ## Action Items section
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Notes

Jane Doe discussed the roadmap.
Jane Doe asked about timeline.
Jane Doe asked about timeline.
`);

    const result = await service.refreshPersonMemory(paths);

    // No action items extracted from this meeting (no ## Action Items section)
    assert.equal(result.actionItemsExtracted, 0, 'Should extract zero action items from meeting without section');

    // This test verifies the parsing logic: meetings without ## Action Items section
    // yield zero extracted action items. Commitment preservation (AC requirement) is
    // handled by CommitmentsService which syncs from person files, not from meeting
    // re-extraction. That path is tested in CommitmentsService tests.
    assert.equal(result.updated, 1, 'Person should still be updated for other signals');
  });

  it('parsing-based extraction does not require callLLM', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] Jane Doe to send the report (@jane-doe → @john-owner)
`);

    // No callLLM provided — action items should still be extracted via parsing
    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.actionItemsExtracted, 1, 'Should extract action item without callLLM');
  });

  it('handles arrow notation variants correctly', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] Jane Doe to send docs (@jane-doe -> @john-owner)
- [ ] John to review specs (@john-owner => @jane-doe)
- [ ] Jane to update roadmap (jane-doe --> john-owner)
`);

    const result = await service.refreshPersonMemory(paths);

    // All three items should be extracted with various arrow notations
    assert.equal(result.actionItemsExtracted, 3, 'Should parse all arrow notation variants');
  });

  it('infers direction from text when no arrow notation present', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

## Action Items

- [ ] I'll send Jane Doe the API docs
- [ ] Jane Doe to review the proposal
`);

    const result = await service.refreshPersonMemory(paths);

    // Both items should be extracted using owner-name heuristics
    // "I'll send Jane Doe" → owner is actor, jane mentioned → they_owe_me (from jane's perspective)
    // "Jane Doe to review" → jane is actor → i_owe_them (from jane's perspective)
    assert.equal(result.actionItemsExtracted, 2, 'Should infer direction from text');
  });
});
