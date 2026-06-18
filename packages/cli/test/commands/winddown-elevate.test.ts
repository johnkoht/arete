/**
 * CLI tests for `arete winddown elevate <meeting> <itemId...>` (CHR-W4 FF-1).
 *
 * Thin command over the core `writeItemElevatedToFile` /
 * `removeItemElevatedFromFile` helpers. Removes the chef's hand-edit footgun for
 * `staged_item_elevated` (SKILL Step 2d). Covers AC-FF1.1–1.6:
 *   - 1.1 elevate writes staged_item_elevated map, idempotent, preserves siblings
 *   - 1.2 --remove deletes only named ids; absent id is a no-op (not an error)
 *   - 1.3 integration: elevate → render shows those items [x], others [ ]
 *   - 1.4 elevate never writes status:'approved' (status unchanged)
 *   - 1.5 unknown meeting / unknown id → error + non-zero exit, file unchanged
 *   - 1.6 AC-B2 invariant: elevate-then-`meeting approve` commits nothing
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

const DATE = '2026-06-17';
const SLUG = `${DATE}-anthony`;

function meetingPath(dir: string): string {
  return join(dir, 'resources', 'meetings', `${SLUG}.md`);
}

function writeMeeting(dir: string): void {
  const meetingsDir = join(dir, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  const content = `---
title: Anthony / John Weekly
date: ${DATE}
status: processed
attendees:
  - John Koht
  - Anthony
staged_item_status:
  ai_001: pending
  ai_002: pending
  de_001: pending
custom_field: keep-me
---

## Summary

Weekly sync.

## Staged Action Items
- ai_001: Set up tech spike with Nick + James
- ai_002: Confirm consolidation rules universal

## Staged Decisions
- de_001: PRDs get a UX section going forward
`;
  writeFileSync(meetingPath(dir), content, 'utf8');
}

function elevatedMap(dir: string): Record<string, unknown> {
  const raw = readFileSync(meetingPath(dir), 'utf8');
  const fm = parseYaml(raw.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
  return (fm['staged_item_elevated'] as Record<string, unknown>) ?? {};
}

function statusMap(dir: string): Record<string, unknown> {
  const raw = readFileSync(meetingPath(dir), 'utf8');
  const fm = parseYaml(raw.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
  return (fm['staged_item_status'] as Record<string, unknown>) ?? {};
}

describe('arete winddown elevate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-winddown-elevate');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    writeMeeting(tmpDir);
  });

  afterEach(() => cleanupTmpDir(tmpDir));

  it('AC-FF1.1: elevate writes the elevated map, is idempotent, preserves siblings', () => {
    const { code, stdout } = runCliRaw(
      ['winddown', 'elevate', SLUG, 'ai_001', 'de_001', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, stdout);
    const out = JSON.parse(stdout);
    assert.equal(out.success, true);
    assert.deepEqual(out.elevated.sort(), ['ai_001', 'de_001']);
    assert.deepEqual(elevatedMap(tmpDir), { ai_001: true, de_001: true });

    // Idempotent re-run.
    const second = runCliRaw(['winddown', 'elevate', SLUG, 'ai_001', '--json'], { cwd: tmpDir });
    assert.equal(second.code, 0, second.stdout);
    assert.deepEqual(elevatedMap(tmpDir), { ai_001: true, de_001: true });

    // All other frontmatter preserved (incl. staged_item_status + custom field).
    const raw = readFileSync(meetingPath(tmpDir), 'utf8');
    const fm = parseYaml(raw.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.equal(fm['custom_field'], 'keep-me');
    assert.deepEqual(fm['staged_item_status'], { ai_001: 'pending', ai_002: 'pending', de_001: 'pending' });
  });

  it('AC-FF1.2: --remove deletes only named ids; absent ids are a no-op (not an error)', () => {
    runCliRaw(['winddown', 'elevate', SLUG, 'ai_001', 'de_001'], { cwd: tmpDir });
    // Remove one present + one absent id.
    const { code, stdout } = runCliRaw(
      ['winddown', 'elevate', SLUG, 'ai_001', 'ai_999', '--remove', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, stdout);
    const out = JSON.parse(stdout);
    assert.deepEqual(out.removed.sort(), ['ai_001', 'ai_999']);
    // de_001 untouched; ai_001 gone; absent ai_999 caused no error.
    assert.deepEqual(elevatedMap(tmpDir), { de_001: true });
  });

  it('AC-FF1.3: integration — elevate then render shows elevated items [x], others [ ]', () => {
    runCliRaw(['winddown', 'elevate', SLUG, 'ai_001', 'de_001'], { cwd: tmpDir });
    const { code, stdout } = runCliRaw(['winddown', 'render', DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    // ai_001 + de_001 elevated → [x]; ai_002 pending → [ ].
    assert.match(stdout, /- \[x\] Set up tech spike with Nick \+ James/);
    assert.match(stdout, /- \[x\] PRDs get a UX section going forward/);
    assert.match(stdout, /- \[ \] Confirm consolidation rules universal/);
  });

  it('AC-FF1.4: elevate never writes status:approved (staged_item_status unchanged)', () => {
    runCliRaw(['winddown', 'elevate', SLUG, 'ai_001'], { cwd: tmpDir });
    // ai_001 stays pending — elevation is not commit-readiness.
    assert.deepEqual(statusMap(tmpDir), { ai_001: 'pending', ai_002: 'pending', de_001: 'pending' });
    const raw = readFileSync(meetingPath(tmpDir), 'utf8');
    assert.match(raw, /^status: processed$/m); // meeting-level status also unchanged
    assert.doesNotMatch(raw, /ai_001: approved/);
  });

  it('AC-FF1.5a: unknown meeting → error + non-zero exit, no mutation', () => {
    const { code, stderr, stdout } = runCliRaw(
      ['winddown', 'elevate', 'does-not-exist', 'ai_001'],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    assert.match(stderr + stdout, /Meeting not found/);
  });

  it('AC-FF1.5b: unknown item id → error + non-zero exit, file unchanged', () => {
    const before = readFileSync(meetingPath(tmpDir), 'utf8');
    const { code, stderr, stdout } = runCliRaw(
      ['winddown', 'elevate', SLUG, 'ai_001', 'zz_999'],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    assert.match(stderr + stdout, /Unknown staged item id/);
    // Zero mutation: even the valid ai_001 must NOT have been written
    // (validation precedes any write).
    const after = readFileSync(meetingPath(tmpDir), 'utf8');
    assert.equal(after, before);
  });

  it('AC-FF1.6: AC-B2 invariant — elevate then `meeting approve` commits nothing', () => {
    runCliRaw(['winddown', 'elevate', SLUG, 'de_001'], { cwd: tmpDir });
    // A stray `arete meeting approve` (no --all) commits only items already at
    // status `approved`. Elevation left de_001 at `pending`, so nothing reaches
    // memory — only `winddown apply`'s checkbox-diff can promote it. (This is
    // the B-2 blanket-approval guard.)
    runCliRaw(['meeting', 'approve', SLUG, '--skip-qmd'], { cwd: tmpDir });
    const decisionsPath = join(tmpDir, '.arete', 'memory', 'items', 'decisions.md');
    let decisions = '';
    try {
      decisions = readFileSync(decisionsPath, 'utf8');
    } catch {
      decisions = '';
    }
    assert.doesNotMatch(decisions, /PRDs get a UX section going forward/);
  });
});
