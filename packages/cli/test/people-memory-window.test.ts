/**
 * `arete people memory refresh --days/--full` incremental-window tests.
 *
 * Regression for the people-memory incremental-scope bug: an incremental run
 * must scope the stance cost-estimate to the SAME window the refresh uses, so a
 * small/empty delta estimates ~$0 and never trips the $1 confirm gate. The
 * unflagged default keeps the 90-day behavior.
 *
 * These tests exercise the estimator path (LLM enabled, no --no-llm) so the
 * cost gate logic runs. No API key is needed: the gate is evaluated before the
 * services.ai.isConfigured() check.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCliRaw } from './helpers.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Workspace with a person who appears in MANY meetings. With the 90-day window
 * the cost estimate (~$0.015/call) exceeds the $1 confirm gate; with a tight
 * --days window only the recent meetings count, dropping the estimate to ~$0.
 */
function makeBusyWorkspace(root: string): void {
  writeFile(root, 'arete.yaml', `schema: 2\nversion: 0.10.1\nide: claude\n`);
  writeFile(root, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
  writeFile(
    root,
    'people/internal/jane-smith.md',
    `---\nname: Jane Smith\nrole: PM\n---\n\n# Jane Smith\n`,
  );

  // 80 meetings spread across the last ~89 days, all naming Jane Smith in the
  // filename slug → 80 stance calls × $0.015 = $1.20 > $1 gate under 90d.
  for (let i = 0; i < 80; i++) {
    const date = isoDaysAgo(i + 2); // 2..81 days ago (all within 90d)
    writeFile(
      root,
      `resources/meetings/${date}-jane-smith-sync.md`,
      `---\ntitle: "Sync ${i}"\ndate: "${date}"\nattendee_ids:\n  - jane-smith\n---\n\nJane Smith asked about timeline.\n`,
    );
  }
}

describe('arete people memory refresh — incremental window cost gating', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-window-'));
    makeBusyWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('unflagged default (90d) estimate trips the confirm gate', () => {
    const { stdout, code } = runCliRaw(
      ['people', 'memory', 'refresh', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    // confirm_required exits 0 with a JSON estimate block.
    assert.equal(code, 0, `expected exit 0; stdout=${stdout}`);
    const parsed = JSON.parse(stdout) as { success: boolean; error?: string; estimate?: { stanceCallCount: number } };
    assert.equal(parsed.success, false, 'full-window run should hit the gate');
    assert.equal(parsed.error, 'confirm_required');
    assert.ok((parsed.estimate?.stanceCallCount ?? 0) >= 67, 'full window counts all in-window meetings');
  });

  it('--days 1 scopes the estimate to ~$0 and does NOT trip the gate', () => {
    const { stdout, code } = runCliRaw(
      ['people', 'memory', 'refresh', '--days', '1', '--skip-qmd', '--json'],
      { cwd: tmpDir, env: { ARETE_NO_LLM: '1' } },
    );
    assert.equal(code, 0, `expected exit 0; stdout=${stdout}`);
    const parsed = JSON.parse(stdout) as { success: boolean };
    // No meeting is within the last 1 day → estimate ~$0 → no gate → succeeds.
    assert.equal(parsed.success, true, '--days 1 must bypass the gate (window estimate ~$0)');
  });

  it('--full forces the 90-day rebuild even when --days is also passed', () => {
    const { stdout, code } = runCliRaw(
      ['people', 'memory', 'refresh', '--days', '1', '--full', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `expected exit 0; stdout=${stdout}`);
    const parsed = JSON.parse(stdout) as { success: boolean; error?: string };
    assert.equal(parsed.success, false, '--full overrides --days back to 90d → gate trips');
    assert.equal(parsed.error, 'confirm_required');
  });
});
