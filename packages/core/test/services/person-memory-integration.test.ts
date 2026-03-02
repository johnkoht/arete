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

  it('caches LLM calls — same meeting+person not called twice', async () => {
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

    // Calling refreshPersonMemory once — the cache is within a single call
    await service.refreshPersonMemory(paths, { callLLM: mockLLM });
    assert.equal(llmCallCount, 1, 'LLM should be called once per unique meeting+person');

    // The cache is function-scoped, so a second call should trigger a new LLM call
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

  it('extracts action items with direction classification', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe will send the report by Friday.
I'll follow up with Jane Doe on the proposal.
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

Jane Doe will send the ancient report.
`);

    const result = await service.refreshPersonMemory(paths);

    // The item from 2025-01-01 should be stale (>30 days from now: 2026-03-01)
    assert.ok(result.itemsAgedOut >= 1, 'Old action items should be aged out');
    assert.equal(result.actionItemsExtracted, 0, 'Stale items should not be in final count');
  });

  it('reads owner name from profile.md for action item direction', async () => {
    writeProfile(tmpDir, 'John Owner');
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

John Owner will send Jane Doe the contract.
`);

    const result = await service.refreshPersonMemory(paths);

    // "John Owner will send Jane Doe..." → i_owe_them direction
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

  it('handles missing profile.md gracefully', async () => {
    // No profile.md written — ownerName should be undefined
    writePerson(tmpDir, 'customers', 'jane-doe', 'Jane Doe');
    writeMeeting(tmpDir, '2026-02-10-sync.md', `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe will send the report by Friday.
`);

    // Should not throw
    const result = await service.refreshPersonMemory(paths);
    assert.equal(typeof result.actionItemsExtracted, 'number');
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

  it('uses separate cache keys for different people on same meeting', async () => {
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
      // Track which person we're extracting for — check the instruction line
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
      callArgs.push('bob');
      return JSON.stringify({
        stances: [{
          topic: 'migration',
          direction: 'opposes',
          summary: 'Bob opposes migration',
          evidence_quote: 'Bob opposes it',
        }],
      });
    };

    const result = await service.refreshPersonMemory(paths, { callLLM: mockLLM });

    assert.equal(callArgs.length, 2, 'LLM called once per person for same meeting');
    assert.ok(callArgs.includes('jane'));
    assert.ok(callArgs.includes('bob'));
    assert.equal(result.stancesExtracted, 2, 'One stance per person');
  });
});
