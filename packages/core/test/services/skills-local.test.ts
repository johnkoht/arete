/**
 * Tests for skills-local seeding (Phase 2 — APPEND-file convention).
 *
 * Covers:
 * - Seeds all five Phase 2 chef-orchestrator skill templates on a fresh workspace
 * - Idempotent — re-running preserves existing files verbatim
 * - Non-default skill list works (test override)
 * - Template includes the skill display name and the "your context" heading
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  seedSkillsLocal,
  renderSkillsLocalTemplate,
  PHASE_2_CHEF_ORCHESTRATOR_SKILLS,
} from '../../src/services/skills-local.js';

describe('renderSkillsLocalTemplate', () => {
  it('includes the skill name in the heading (display-cased)', () => {
    const out = renderSkillsLocalTemplate('daily-winddown');
    assert.match(out, /^# Daily Winddown — your context/);
  });

  it('handles single-word skill slugs', () => {
    const out = renderSkillsLocalTemplate('foo');
    assert.match(out, /^# Foo — your context/);
  });

  it('handles multi-hyphen skill slugs', () => {
    const out = renderSkillsLocalTemplate('weekly-winddown');
    assert.match(out, /^# Weekly Winddown — your context/);
  });

  it('references the skill slug in the body for clarity', () => {
    const out = renderSkillsLocalTemplate('process-meetings');
    assert.match(out, /every `process-meetings`\s+run/);
  });

  it('includes the standard sections', () => {
    const out = renderSkillsLocalTemplate('meeting-prep');
    assert.match(out, /## My MCPs and how I use them/);
    assert.match(out, /## Active initiatives/);
    assert.match(out, /## People to watch/);
    assert.match(out, /## Cross-references/);
    assert.match(out, /## Action verbs/);
  });
});

describe('seedSkillsLocal', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'skills-local-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seeds all five Phase 2 skill templates on a fresh workspace', async () => {
    const result = await seedSkillsLocal(storage, tmpDir);
    assert.equal(result.added.length, 5);
    assert.equal(result.preserved.length, 0);
    for (const slug of PHASE_2_CHEF_ORCHESTRATOR_SKILLS) {
      const file = join(tmpDir, '.arete', 'skills-local', `${slug}.md`);
      assert.ok(existsSync(file), `expected ${slug}.md to exist`);
    }
  });

  it('preserves existing user content (idempotent)', async () => {
    const userContent = '# Daily Winddown — your context\n\nMy custom notes.\n';
    mkdirSync(join(tmpDir, '.arete', 'skills-local'), { recursive: true });
    writeFileSync(join(tmpDir, '.arete', 'skills-local', 'daily-winddown.md'), userContent);

    const result = await seedSkillsLocal(storage, tmpDir);

    // daily-winddown is preserved
    assert.ok(result.preserved.includes('.arete/skills-local/daily-winddown.md'));
    const after = readFileSync(
      join(tmpDir, '.arete', 'skills-local', 'daily-winddown.md'),
      'utf8',
    );
    assert.equal(after, userContent, 'existing file must be preserved verbatim');

    // The other four are still seeded
    assert.equal(result.added.length, 4);
  });

  it('is fully idempotent on second run', async () => {
    const first = await seedSkillsLocal(storage, tmpDir);
    assert.equal(first.added.length, 5);

    const second = await seedSkillsLocal(storage, tmpDir);
    assert.equal(second.added.length, 0);
    assert.equal(second.preserved.length, 5);
  });

  it('respects skills override option', async () => {
    const result = await seedSkillsLocal(storage, tmpDir, {
      skills: ['daily-winddown'],
    });
    assert.equal(result.added.length, 1);
    assert.ok(result.added[0].endsWith('daily-winddown.md'));

    // Other four files should NOT exist
    for (const slug of PHASE_2_CHEF_ORCHESTRATOR_SKILLS) {
      if (slug === 'daily-winddown') continue;
      const file = join(tmpDir, '.arete', 'skills-local', `${slug}.md`);
      assert.ok(!existsSync(file), `${slug}.md should not be seeded`);
    }
  });

  it('handles empty file (treats as existing user content)', async () => {
    mkdirSync(join(tmpDir, '.arete', 'skills-local'), { recursive: true });
    writeFileSync(join(tmpDir, '.arete', 'skills-local', 'daily-winddown.md'), '');

    const result = await seedSkillsLocal(storage, tmpDir);

    // Empty file is preserved (existence is the gate, not content)
    assert.ok(result.preserved.includes('.arete/skills-local/daily-winddown.md'));
    const after = readFileSync(
      join(tmpDir, '.arete', 'skills-local', 'daily-winddown.md'),
      'utf8',
    );
    assert.equal(after, '', 'empty file must be preserved');
  });

  it('writes the rendered template content for new files', async () => {
    await seedSkillsLocal(storage, tmpDir, { skills: ['week-plan'] });
    const content = readFileSync(
      join(tmpDir, '.arete', 'skills-local', 'week-plan.md'),
      'utf8',
    );
    assert.match(content, /^# Week Plan — your context/);
    assert.match(content, /every `week-plan`\s+run/);
  });
});
