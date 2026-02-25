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
});
