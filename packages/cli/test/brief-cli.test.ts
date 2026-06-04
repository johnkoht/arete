/**
 * Phase 9 — `arete brief` CLI integration tests.
 *
 * Covers:
 *  - AC4 typed-mode markdown structure (person) + AC6 JSON parity
 *  - AC8 mutual exclusion (zero-mode + two-mode exit-1 paths)
 *  - AC10c telemetry (invocation log written to dev/diary/brief-invocations.log)
 *  - M4 unknown-project-slug error with Levenshtein suggestion
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli, runCliRaw } from './helpers.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function makeMinimalWorkspace(root: string): void {
  // arete.yaml — minimal so workspace.findRoot resolves
  writeFile(
    root,
    'arete.yaml',
    `schema: 2
version: 0.10.1
ide: claude
`,
  );
  writeFile(root, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
}

describe('arete brief CLI (Phase 9 typed modes)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arete-brief-cli-'));
    makeMinimalWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC8: zero-mode exits 1 with the required-mode error message', () => {
    const { stdout, stderr, code } = runCliRaw(['brief'], { cwd: tmpDir });
    assert.equal(code, 1, `expected exit 1; stdout=${stdout} stderr=${stderr}`);
    const out = (stdout + stderr).toLowerCase();
    assert.ok(
      out.includes('exactly one of --for/--person/--project/--area/--meeting required'),
      `expected error substring; got: ${out}`,
    );
  });

  it('AC8: two-mode exits 1 with the flags listed', () => {
    const { stdout, stderr, code } = runCliRaw(
      ['brief', '--person', 'jane', '--area', 'foo'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const out = (stdout + stderr).toLowerCase();
    assert.ok(
      out.includes('exactly one of --for/--person/--project/--area/--meeting required (got:'),
      `expected error substring; got: ${out}`,
    );
    assert.ok(/--person/.test(out));
    assert.ok(/--area/.test(out));
  });

  it('AC4 + AC6: --person --json emits structured object without markdown field; --person without --json emits markdown', () => {
    writeFile(
      tmpDir,
      'people/internal/jane-smith.md',
      `---
name: Jane Smith
role: PM
---

# Jane Smith
`,
    );

    // JSON mode
    const json = runCli(['brief', '--person', 'jane-smith', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.equal(parsed.mode, 'person');
    assert.equal(parsed.subjectSlug, 'jane-smith');
    assert.ok(Array.isArray(parsed.sections));
    assert.ok(Array.isArray(parsed.sources));
    assert.equal('markdown' in parsed, false, 'JSON output must NOT contain a markdown field');

    // Markdown mode
    const md = runCli(['brief', '--person', 'jane-smith'], { cwd: tmpDir });
    assert.ok(md.startsWith('# Brief: Jane Smith'));
    assert.ok(/Role:/.test(md));
  });

  it('AC10c: --person/--area/--meeting invocations append a line each to dev/diary/brief-invocations.log', () => {
    writeFile(
      tmpDir,
      'people/internal/jane-smith.md',
      `---
name: Jane Smith
---
# Jane
`,
    );
    runCli(['brief', '--person', 'jane-smith', '--json'], { cwd: tmpDir });
    runCli(['brief', '--meeting', 'Random title', '--json'], { cwd: tmpDir });
    runCli(['brief', '--area', 'no-such-area', '--json'], { cwd: tmpDir });

    const logPath = join(tmpDir, 'dev', 'diary', 'brief-invocations.log');
    assert.ok(existsSync(logPath), 'invocation log should exist');
    const log = readFileSync(logPath, 'utf8');
    const lines = log.split('\n').filter((l) => l.length > 0);
    assert.equal(lines.length, 3, `expected 3 invocation log lines; got ${lines.length}: ${log}`);
    assert.ok(lines[0].includes('--person'));
    assert.ok(lines[1].includes('--meeting'));
    assert.ok(lines[2].includes('--area'));
    // Format: <ISO> <mode> <quoted-input>
    for (const line of lines) {
      assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('M4: --meeting --project with unknown slug errors with closest-match suggestion and exits 1', () => {
    // Set up an active project so a Levenshtein suggestion can be made.
    writeFile(
      tmpDir,
      'projects/active/glance-2-mvp/README.md',
      `---
name: Glance 2 MVP
area: glance-modernization
---
# Glance 2 MVP
`,
    );
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-15
attendee_ids: [john, lindsay-gray]
---
# Meeting
`,
    );
    const { stdout, stderr, code } = runCliRaw(
      ['brief', '--meeting', '2026-05-15-john-lindsay-11', '--project', 'glance-2', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1, `expected exit 1; stdout=${stdout} stderr=${stderr}`);
    const combined = stdout + stderr;
    assert.ok(/project 'glance-2' not found/i.test(combined), `missing error message; got: ${combined}`);
    assert.ok(/glance-2-mvp/.test(combined), 'closest-match suggestion should be glance-2-mvp');
  });
});
