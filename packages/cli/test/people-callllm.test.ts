/**
 * Phase 9 AC8a — `arete people memory refresh` callLLM wiring tests.
 *
 * Covers:
 *  - --no-llm flag skips LLM (no API key required for test) and completes
 *    successfully — signal-based memory still populates.
 *  - --snapshot-path writes a pre-refresh snapshot of AUTO_PERSON_MEMORY
 *    blocks BEFORE any refresh write happens.
 *
 * NOTE: We do NOT test the positive callLLM path here — that would require
 * a configured AIService + API key + network. That's exercised via the
 * 9B one-shot refresh (build step 14a) and verified by sampling person
 * files for newly populated Stances.
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

function makeWorkspace(root: string): void {
  writeFile(
    root,
    'arete.yaml',
    `schema: 2
version: 0.10.1
ide: claude
`,
  );
  writeFile(root, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
  writeFile(
    root,
    'people/internal/jane-smith.md',
    `---
name: Jane Smith
role: PM
---

# Jane Smith

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

Last refreshed: 2025-01-01

### Stances
- **existing-stance** — neutral: previously seeded stance (from: old.md, 2025-01-01)
<!-- AUTO_PERSON_MEMORY:END -->
`,
  );
}

describe('arete people memory refresh — callLLM wiring (AC8a)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-callllm-'));
    makeWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--no-llm completes successfully without invoking the LLM', () => {
    // No API key configured; --no-llm should still succeed.
    const { stdout, stderr, code } = runCliRaw(
      ['people', 'memory', 'refresh', '--no-llm', '--skip-qmd', '--json'],
      { cwd: tmpDir, env: { ARETE_NO_LLM: '1' } },
    );
    assert.equal(code, 0, `expected exit 0; stderr=${stderr} stdout=${stdout}`);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    assert.equal(parsed.success, true);
  });

  it('--snapshot-path writes the pre-refresh snapshot before any refresh runs', () => {
    const snapshotPath = 'dev/work/snapshots/test-snap.json';
    runCli(
      [
        'people',
        'memory',
        'refresh',
        '--no-llm',
        '--skip-qmd',
        '--snapshot-path',
        snapshotPath,
        '--json',
      ],
      { cwd: tmpDir, env: { ARETE_NO_LLM: '1' } },
    );
    const fullPath = join(tmpDir, snapshotPath);
    assert.ok(existsSync(fullPath), `snapshot should be written at ${fullPath}`);
    const json = JSON.parse(readFileSync(fullPath, 'utf8')) as {
      snapshotAt: string;
      blocks: Array<{ path: string; relativePath: string; block: string | null }>;
    };
    assert.ok(json.snapshotAt);
    assert.ok(Array.isArray(json.blocks));
    assert.equal(json.blocks.length, 1, 'expected 1 person file in snapshot');
    const entry = json.blocks[0];
    assert.ok(entry.relativePath.includes('jane-smith.md'));
    assert.ok(entry.block && entry.block.includes('AUTO_PERSON_MEMORY:START'));
    assert.ok(entry.block && entry.block.includes('existing-stance'));
  });
});
