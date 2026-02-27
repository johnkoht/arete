/**
 * Tests for MemoryService via compat searchMemory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchMemory } from '../../src/compat/memory.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import { createTestWorkspace } from '../fixtures/index.js';

describe('MemoryService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let writeFixtureFile: (relativePath: string, content: string) => void;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mem-svc-'));
    const fixture = createTestWorkspace(tmpDir);
    paths = fixture.paths;
    writeFixtureFile = fixture.writeFile;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for empty query tokens', async () => {
    const result = await searchMemory('the a', paths);
    assert.equal(result.results.length, 0);
    assert.equal(result.total, 0);
  });

  it('finds decisions matching query tokens', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-01-15: Use Elasticsearch for search
**Decision**: We chose Elasticsearch over Algolia.

### 2026-01-20: Onboarding flow redesign
**Context**: Onboarding drop-off was 40%.
**Decision**: Redesign the onboarding wizard.
`,
    );

    const result = await searchMemory('onboarding', paths);
    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].type, 'decisions');
    assert.ok(result.results[0].content.includes('Onboarding'));
  });

  it('filters by memory type when specified', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      '# Decisions\n\n### 2026-01-15: Search decision\n\n**Decision**: Use Elasticsearch.\n',
    );
    writeFixtureFile(
      '.arete/memory/items/learnings.md',
      '# Learnings\n\n### 2026-02-01: Search insight\n\n**Insight**: Users want instant search.\n',
    );

    const result = await searchMemory('search', paths, { types: ['learnings'] });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].type, 'learnings');
  });

  it('respects limit option', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      `# Decisions
### 2026-01-10: Search tech
**Decision**: Elasticsearch.
### 2026-01-15: Search UX
**Decision**: Instant search.
### 2026-01-20: Search API
**Decision**: REST endpoints.
`,
    );

    const result = await searchMemory('search', paths, { limit: 2 });
    assert.equal(result.results.length, 2);
    assert.equal(result.total, 3);
  });

  it('searches meetings and returns type=meeting', async () => {
    writeFixtureFile(
      'resources/meetings/2026-02-25-glance-account-filtering.md',
      `---
title: "Glance Account Filtering Discussion"
---

# Glance Account Filtering Discussion

## Discussion

We discussed the multi-account filtering feature for Glance.
The accounts need to be filterable by region and status.
`,
    );

    const result = await searchMemory('account filtering', paths);
    assert.ok(result.results.length >= 1, 'Should find at least one result');
    const meetingResult = result.results.find(r => r.type === 'meeting');
    assert.ok(meetingResult, 'Should have a meeting type result');
    assert.equal(meetingResult.source, '2026-02-25-glance-account-filtering.md');
    assert.ok(meetingResult.content.includes('multi-account'), 'Content should include meeting text');
  });

  it('searches conversations and returns type=conversation', async () => {
    writeFixtureFile(
      'resources/conversations/2026-02-25-glance-multi-account-filtering-request.md',
      `---
title: "Glance Multi-Account Filtering Request"
---

# Glance Multi-Account Filtering Request

## Summary

Customer requested multi-account filtering support.
They need to filter by account status and region.
`,
    );

    const result = await searchMemory('multi-account', paths);
    assert.ok(result.results.length >= 1, 'Should find at least one result');
    const conversationResult = result.results.find(r => r.type === 'conversation');
    assert.ok(conversationResult, 'Should have a conversation type result');
    assert.equal(conversationResult.source, '2026-02-25-glance-multi-account-filtering-request.md');
    assert.ok(conversationResult.content.includes('multi-account'), 'Content should include conversation text');
  });

  it('combines results from memory files, meetings, and conversations', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-02-20: Account structure decision
**Decision**: Use hierarchical accounts.
`,
    );
    writeFixtureFile(
      'resources/meetings/2026-02-22-account-planning.md',
      `---
title: "Account Planning Meeting"
---
Discussion about account management features.
`,
    );
    writeFixtureFile(
      'resources/conversations/2026-02-24-account-feedback.md',
      `---
title: "Account Feature Feedback"
---
Customer feedback on account features.
`,
    );

    const result = await searchMemory('account', paths);
    assert.ok(result.total >= 3, 'Should find results from all three sources');
    
    const types = result.results.map(r => r.type);
    assert.ok(types.includes('decisions'), 'Should include decisions');
    assert.ok(types.includes('meeting'), 'Should include meetings');
    assert.ok(types.includes('conversation'), 'Should include conversations');
  });
});
