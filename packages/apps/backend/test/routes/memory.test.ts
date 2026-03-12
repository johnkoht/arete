import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadMemoryItems } from '../../src/routes/memory.js';

describe('memory routes', () => {
  describe('loadMemoryItems', () => {
    it('parses standard format (### YYYY-MM-DD: Title)', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'arete-memory-test-'));
      const memoryDir = join(tmpDir, '.arete', 'memory', 'items');
      await fs.mkdir(memoryDir, { recursive: true });

      await fs.writeFile(
        join(memoryDir, 'decisions.md'),
        `# Decisions

### 2026-02-24: Email template rollout
**Source**: Deep Dive
Phase 1: POP team.

### 2026-03-02: Search bar priority
**Source**: Dashboard Jam
Backend search coverage.
`
      );

      const items = await loadMemoryItems(tmpDir);

      assert.equal(items.length, 2);
      assert.equal(items[0].date, '2026-03-02');
      assert.equal(items[0].title, 'Search bar priority');
      assert.equal(items[0].source, 'Dashboard Jam');
      assert.equal(items[1].date, '2026-02-24');
      assert.equal(items[1].title, 'Email template rollout');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('parses legacy format (## Title with - **Date**: YYYY-MM-DD)', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'arete-memory-test-'));
      const memoryDir = join(tmpDir, '.arete', 'memory', 'items');
      await fs.mkdir(memoryDir, { recursive: true });

      await fs.writeFile(
        join(memoryDir, 'decisions.md'),
        `# Decisions

## Email template rollout will start with POP team first
- **Date**: 2026-02-24
- **Source**: Email Templates Deep Dive (Jamie Burk)
- Phase 1: POP team (18 templates).

## Universal search bar is the top quick win
- **Date**: 2026-03-02
- **Source**: Claim Dashboard Jam
- Backend search already covers claim number.
`
      );

      const items = await loadMemoryItems(tmpDir);

      assert.equal(items.length, 2);
      assert.equal(items[0].date, '2026-03-02');
      assert.equal(items[0].title, 'Universal search bar is the top quick win');
      assert.equal(items[0].source, 'Claim Dashboard Jam');
      assert.equal(items[1].date, '2026-02-24');
      assert.equal(items[1].title, 'Email template rollout will start with POP team first');
      assert.equal(items[1].source, 'Email Templates Deep Dive (Jamie Burk)');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('parses both decisions and learnings', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'arete-memory-test-'));
      const memoryDir = join(tmpDir, '.arete', 'memory', 'items');
      await fs.mkdir(memoryDir, { recursive: true });

      await fs.writeFile(
        join(memoryDir, 'decisions.md'),
        `# Decisions

## Decision one
- **Date**: 2026-02-24
- Content here.
`
      );

      await fs.writeFile(
        join(memoryDir, 'learnings.md'),
        `# Learnings

## Learning one
- **Date**: 2026-02-25
- Insight here.
`
      );

      const items = await loadMemoryItems(tmpDir);

      assert.equal(items.length, 2);
      assert.equal(items[0].type, 'learning');
      assert.equal(items[0].date, '2026-02-25');
      assert.equal(items[1].type, 'decision');
      assert.equal(items[1].date, '2026-02-24');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('handles mixed formats in same file', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'arete-memory-test-'));
      const memoryDir = join(tmpDir, '.arete', 'memory', 'items');
      await fs.mkdir(memoryDir, { recursive: true });

      await fs.writeFile(
        join(memoryDir, 'decisions.md'),
        `# Decisions

### 2026-03-01: Standard format entry
**Source**: Meeting
Content.

## Legacy format entry
- **Date**: 2026-02-28
- **Source**: Other meeting
- More content.
`
      );

      const items = await loadMemoryItems(tmpDir);

      assert.equal(items.length, 2);
      assert.equal(items[0].title, 'Standard format entry');
      assert.equal(items[0].date, '2026-03-01');
      assert.equal(items[1].title, 'Legacy format entry');
      assert.equal(items[1].date, '2026-02-28');

      await fs.rm(tmpDir, { recursive: true });
    });

    it('returns empty array when no memory files exist', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'arete-memory-test-'));

      const items = await loadMemoryItems(tmpDir);

      assert.equal(items.length, 0);

      await fs.rm(tmpDir, { recursive: true });
    });
  });
});
