import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('people command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-people');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('shows slug in people list output', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe
`,
      'utf8',
    );

    const stdout = runCli(['people', 'list'], { cwd: tmpDir });
    assert.ok(stdout.includes('Slug'));
    assert.ok(stdout.includes('jane-doe'));
  });

  it('shows auto memory highlights via people show --memory', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

### Repeated asks
- **timeline** — mentioned 2 times

<!-- AUTO_PERSON_MEMORY:END -->
`,
      'utf8',
    );

    const stdout = runCli(['people', 'show', 'jane-doe', '--memory'], { cwd: tmpDir });
    assert.ok(stdout.includes('Memory Highlights (Auto)'));
    assert.ok(stdout.includes('timeline'));
  });

  it('supports stale-only refresh mode', () => {
    const today = new Date().toISOString().slice(0, 10);
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

Last refreshed: ${today}

### Repeated asks
- **timeline** — mentioned 2 times

### Repeated concerns
- None detected yet.
<!-- AUTO_PERSON_MEMORY:END -->
`,
      'utf8',
    );

    const stdout = runCli(['people', 'memory', 'refresh', '--person', 'jane-doe', '--if-stale-days', '7', '--skip-qmd', '--json'], { cwd: tmpDir });
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.updated, 0);
    assert.equal(result.skippedFresh, 1);
  });

  it('refreshes person memory highlights from meetings', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe
`,
      'utf8',
    );

    const meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });

    writeFileSync(
      join(meetingsDir, '2026-02-10-sync.md'),
      `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about project timeline.
Jane Doe is concerned about budget.
`,
      'utf8',
    );

    writeFileSync(
      join(meetingsDir, '2026-02-12-sync.md'),
      `---
title: "Sync 2"
date: "2026-02-12"
attendee_ids:
  - jane-doe
---

Jane Doe asked about project timeline.
Jane Doe is concerned about budget.
`,
      'utf8',
    );

    const stdout = runCli(['people', 'memory', 'refresh', '--skip-qmd', '--json'], { cwd: tmpDir });
    const result = JSON.parse(stdout);

    assert.equal(result.success, true);
    assert.equal(result.updated, 1);

    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(personContent.includes('Memory Highlights (Auto)'));
    assert.ok(personContent.includes('project timeline'));
    assert.ok(personContent.includes('budget'));
  });

  it('shows enriched memory sections (stances, items, health) via --memory', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

> Auto-generated from meeting notes/transcripts. Do not edit manually.

Last refreshed: 2026-02-20

### Repeated asks
- **project timeline** — mentioned 3 times (last: 2026-02-18; sources: sync-1.md, sync-2.md, sync-3.md)

### Repeated concerns
- **budget** — mentioned 2 times (last: 2026-02-15; sources: sync-1.md, sync-2.md)

### Stances
- **microservices** — supports: Prefers microservices over monolith (from: sync-1.md, 2026-02-10)

### Open Items (I owe them)
- Send updated roadmap (from: sync-3.md, 2026-02-18)

### Open Items (They owe me)
- Review proposal by Friday (from: sync-2.md, 2026-02-15)

### Relationship Health
- Last met: 2026-02-18 (2 days ago)
- Meetings: 3 in last 30d, 5 in last 90d
- Open loops: 2
- Status: Active
<!-- AUTO_PERSON_MEMORY:END -->
`,
      'utf8',
    );

    const stdout = runCli(['people', 'show', 'jane-doe', '--memory'], { cwd: tmpDir });
    assert.ok(stdout.includes('Memory Highlights (Auto)'));
    assert.ok(stdout.includes('Stances'));
    assert.ok(stdout.includes('microservices'));
    assert.ok(stdout.includes('Open Items (I owe them)'));
    assert.ok(stdout.includes('Send updated roadmap'));
    assert.ok(stdout.includes('Open Items (They owe me)'));
    assert.ok(stdout.includes('Relationship Health'));
    assert.ok(stdout.includes('Active'));
  });

  it('shows enriched memory in --json output', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

### Stances
- **microservices** — supports: Prefers microservices

### Relationship Health
- Status: Active
<!-- AUTO_PERSON_MEMORY:END -->
`,
      'utf8',
    );

    const stdout = runCli(['people', 'show', 'jane-doe', '--memory', '--json'], { cwd: tmpDir });
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.ok(result.person);
    assert.ok(typeof result.memoryHighlights === 'string');
    assert.ok(result.memoryHighlights.includes('Stances'));
    assert.ok(result.memoryHighlights.includes('microservices'));
  });

  it('dry-run refresh previews without writing files', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe
`,
      'utf8',
    );

    const meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
    writeFileSync(
      join(meetingsDir, '2026-02-10-sync.md'),
      `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about project timeline.
Jane Doe is concerned about budget.
`,
      'utf8',
    );
    writeFileSync(
      join(meetingsDir, '2026-02-12-sync.md'),
      `---
title: "Sync 2"
date: "2026-02-12"
attendee_ids:
  - jane-doe
---

Jane Doe asked about project timeline.
Jane Doe is concerned about budget.
`,
      'utf8',
    );

    const stdout = runCli(
      ['people', 'memory', 'refresh', '--dry-run', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const result = JSON.parse(stdout);

    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.updated, 1);
    assert.equal(typeof result.stancesExtracted, 'number');
    assert.equal(typeof result.actionItemsExtracted, 'number');
    assert.equal(typeof result.itemsAgedOut, 'number');

    // Verify file was NOT written
    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(!personContent.includes('Memory Highlights (Auto)'));
  });

  it('dry-run refresh shows preview text in non-JSON mode', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe
`,
      'utf8',
    );

    const stdout = runCli(
      ['people', 'memory', 'refresh', '--dry-run', '--skip-qmd'],
      { cwd: tmpDir },
    );
    assert.ok(stdout.includes('dry-run'));
    assert.ok(stdout.includes('Would update'));
  });

  it('refresh JSON output includes new extraction count fields', () => {
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      `---
name: "Jane Doe"
category: "internal"
email: "jane@example.com"
---

# Jane Doe
`,
      'utf8',
    );

    const stdout = runCli(
      ['people', 'memory', 'refresh', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const result = JSON.parse(stdout);

    assert.equal(result.success, true);
    // New fields present alongside existing ones
    assert.ok('stancesExtracted' in result);
    assert.ok('actionItemsExtracted' in result);
    assert.ok('itemsAgedOut' in result);
    // Existing fields still present
    assert.ok('updated' in result);
    assert.ok('scannedPeople' in result);
    assert.ok('scannedMeetings' in result);
    assert.ok('skippedFresh' in result);
  });
});
