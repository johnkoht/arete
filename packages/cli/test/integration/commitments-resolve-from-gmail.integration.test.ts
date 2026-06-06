/**
 * Phase 11a CLI integration tests for `arete commitments resolve-from-gmail`.
 *
 * The Phase 11 auto-resolve pipeline ships GATED OFF behind
 * PHASE_11_AUTO_RESOLVE_ENABLED (default false) pending golden-pair
 * precision validation (AC3a). These tests verify the GATE behavior only:
 *   - default (env unset) → verb refuses with the gated message + exit 1
 *   - --json → structured { success:false, gated:true } payload
 *
 * **Critical**: NO LLM CALLS, NO Gmail fetch, NO production data writes. The
 * gated-OFF path never touches the pipeline; we deliberately do NOT test the
 * gated-ON path here (it would require a live LLM + Gmail Sent cache, which
 * the merge-prep invariants forbid).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCliRaw } from '../helpers.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function makeWorkspace(root: string): void {
  writeFile(root, 'arete.yaml', `schema: 2\nversion: 0.10.1\nide: claude\n`);
  writeFile(
    root,
    '.arete/config.json',
    JSON.stringify({ schema: 2, version: '0.10.1' }),
  );
}

describe('arete commitments resolve-from-gmail (Phase 11 — GATED OFF)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'arete-resolve-gmail-'));
    makeWorkspace(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses when PHASE_11_AUTO_RESOLVE_ENABLED is unset (default off)', () => {
    const { stdout, stderr, code } = runCliRaw(
      ['commitments', 'resolve-from-gmail'],
      { cwd: root, env: { PHASE_11_AUTO_RESOLVE_ENABLED: '' } },
    );
    assert.equal(code, 1, 'verb must exit non-zero when gated off');
    const combined = stdout + stderr;
    assert.match(combined, /gated off pending golden-pair validation/i);
    assert.match(combined, /PHASE_11_AUTO_RESOLVE_ENABLED=true/);
  });

  it('--json returns a structured gated refusal', () => {
    const { stdout, code } = runCliRaw(
      ['commitments', 'resolve-from-gmail', '--json'],
      { cwd: root, env: { PHASE_11_AUTO_RESOLVE_ENABLED: '' } },
    );
    assert.equal(code, 1);
    const payload = JSON.parse(stdout);
    assert.equal(payload.success, false);
    assert.equal(payload.gated, true);
    assert.match(payload.error, /gated off/i);
  });

  it('refuses for any non-"true" gate value (e.g. "1", "yes")', () => {
    for (const val of ['1', 'yes', 'TRUE', 'on']) {
      const { code, stdout, stderr } = runCliRaw(
        ['commitments', 'resolve-from-gmail'],
        { cwd: root, env: { PHASE_11_AUTO_RESOLVE_ENABLED: val } },
      );
      assert.equal(code, 1, `gate value "${val}" must NOT enable the verb (only exact "true")`);
      assert.match(stdout + stderr, /gated off/i);
    }
  });
});
