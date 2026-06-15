/**
 * WS-1 (plan-context-injection) — selectProjectDocs unit tests.
 *
 * Deterministic, NO-LLM project-doc selection engine. Real temp-dir fixtures
 * via mkdtempSync + FileStorageAdapter (per brief-project.test.ts), with an
 * injected referenceDate so recency is deterministic. Covers AC1.1–1.4 plus
 * pre-mortem R5 (query enrichment), R11 (location-boost default), R12 (non-.md
 * inputs).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { selectProjectDocs } from '../../src/services/brief-assemblers.js';
import type { WorkspacePaths } from '../../src/models/index.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    managedSkills: join(root, '.arete', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

const REF = new Date('2026-06-14T00:00:00Z');

/** Write a project file and stamp its mtime (days before REF). */
function writeDoc(root: string, rel: string, content: string, daysOld = 0): void {
  const full = join(root, rel);
  mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
  const when = new Date(REF.getTime() - daysOld * 24 * 60 * 60 * 1000);
  utimesSync(full, when, when);
}

const storage = new FileStorageAdapter();

describe('selectProjectDocs (WS-1)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'proj-doc-sel-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC1.1: expands ≥1 root/README/outputs doc; lists every working/* and inputs/*.md', async () => {
    writeDoc(
      tmpDir,
      'projects/active/roadmap-proj/README.md',
      '# Roadmap Project\n\nThe Jira roadmap and Notion decision live here.\n',
      1,
    );
    writeDoc(
      tmpDir,
      'projects/active/roadmap-proj/working/capacity-notes.md',
      '# Capacity Notes\n\nDraft thinking on capacity.\n',
      2,
    );
    writeDoc(
      tmpDir,
      'projects/active/roadmap-proj/working/parity-draft.md',
      '# Parity Draft\n\nParity slice zero notes.\n',
      3,
    );

    const sel = await selectProjectDocs('roadmap-proj', paths, { storage }, {
      topic: 'Jira Roadmap',
      budgetChars: 12000,
      referenceDate: REF,
    });

    assert.ok(sel.expanded.length >= 1, 'at least one expanded doc');
    assert.ok(
      sel.expanded.some((d) => d.rel.endsWith('roadmap-proj/README.md')),
      `README should be expanded; got ${sel.expanded.map((d) => d.rel).join(', ')}`,
    );
    // Every working/* file listed with a non-empty title.
    const listedRels = sel.listed.map((l) => l.rel);
    assert.ok(listedRels.some((r) => r.endsWith('working/capacity-notes.md')));
    assert.ok(listedRels.some((r) => r.endsWith('working/parity-draft.md')));
    for (const l of sel.listed) assert.ok(l.title.length > 0, `listed title non-empty: ${l.rel}`);
  });

  it('AC1.2: project with NO outputs/ dir returns without error and selects highest-scoring root doc', async () => {
    writeDoc(
      tmpDir,
      'projects/active/no-outputs/README.md',
      '# Overview\n\nGeneral project summary describing scope and stakeholders.\n',
      1,
    );
    writeDoc(
      tmpDir,
      'projects/active/no-outputs/migration-plan.md',
      '# Migration Plan\n\nThe detailed migration plan content and rollout sequence.\n',
      0,
    );

    const sel = await selectProjectDocs('no-outputs', paths, { storage }, {
      topic: 'migration plan',
      budgetChars: 12000,
      referenceDate: REF,
    });

    assert.ok(sel.expanded.length >= 1);
    // migration-plan.md is both more recent and more relevant → top.
    assert.equal(sel.expanded[0].rel.split('/').pop(), 'migration-plan.md');
  });

  it('AC1.3: budgetChars=2000 + 5000-char root doc → doc in listed[], truncated, no mid-doc cut', async () => {
    const bigBody = 'x'.repeat(5000);
    writeDoc(
      tmpDir,
      'projects/active/big/README.md',
      `# Big\n\n${bigBody}\n`,
      0,
    );
    writeDoc(
      tmpDir,
      'projects/active/big/small.md',
      '# Small\n\nshort\n',
      1,
    );

    const sel = await selectProjectDocs('big', paths, { storage }, {
      topic: 'big',
      budgetChars: 2000,
      referenceDate: REF,
    });

    // The 5000-char doc cannot fit; the small one can.
    const bigListed = sel.listed.find((l) => l.rel.endsWith('big/README.md'));
    assert.ok(bigListed, 'oversized README demoted to listed');
    assert.equal(sel.truncated, true, 'truncated flag set');
    // No expanded body exceeds the budget (no mid-doc cut of an expanded doc).
    for (const d of sel.expanded) {
      assert.ok(d.body.length <= 2000, 'expanded body within budget (not mid-cut)');
      assert.ok(!d.rel.endsWith('big/README.md'), 'oversized doc not expanded');
    }
  });

  it('AC1.4: deterministic — identical inputs + referenceDate → byte-identical ordering', async () => {
    writeDoc(tmpDir, 'projects/active/det/README.md', '# Det\n\nalpha beta\n', 1);
    writeDoc(tmpDir, 'projects/active/det/outputs/synth.md', '# Synth\n\nalpha beta gamma\n', 1);
    writeDoc(tmpDir, 'projects/active/det/working/w1.md', '# W1\n\nalpha\n', 1);

    const opts = { topic: 'alpha beta', budgetChars: 12000, referenceDate: REF } as const;
    const a = await selectProjectDocs('det', paths, { storage }, opts);
    const b = await selectProjectDocs('det', paths, { storage }, opts);
    assert.deepEqual(
      a.expanded.map((d) => [d.rel, d.score]),
      b.expanded.map((d) => [d.rel, d.score]),
    );
    assert.deepEqual(a.listed.map((l) => l.rel), b.listed.map((l) => l.rel));
  });

  it('AC1.4 tie-break: equal score → locationBoost then mtime then lexical rel', async () => {
    // Two docs identical in content (so relevance + recency tie); with
    // locationBoost on, outputs/ must precede root.
    writeDoc(tmpDir, 'projects/active/tie/aaa.md', '# Doc\n\nsame body text\n', 5);
    writeDoc(tmpDir, 'projects/active/tie/outputs/zzz.md', '# Doc\n\nsame body text\n', 5);

    const sel = await selectProjectDocs('tie', paths, { storage }, {
      topic: 'same body text',
      budgetChars: 12000,
      locationBoost: true,
      referenceDate: REF,
    });
    assert.equal(sel.expanded[0].rel.split('/').slice(-2).join('/'), 'outputs/zzz.md');
  });

  it('AC-R11: default (no-boost) call ranks outputs/ above a more-recent working/ draft', async () => {
    // outputs synthesis is older but on-topic; working draft is newer but
    // off-topic. With expandWorking default false, working/ is never expanded;
    // outputs/ wins the expansion. (Default = NO location boost.)
    writeDoc(
      tmpDir,
      'projects/active/r11/README.md',
      '# R11\n\nunrelated readme content\n',
      10,
    );
    writeDoc(
      tmpDir,
      'projects/active/r11/outputs/roadmap-synthesis.md',
      '# Roadmap Synthesis\n\nNotion versus Jira roadmap decision and capacity.\n',
      4,
    );
    writeDoc(
      tmpDir,
      'projects/active/r11/working/scratch.md',
      '# Scratch\n\ntotally different topic shopping list\n',
      0,
    );

    const sel = await selectProjectDocs('r11', paths, { storage }, {
      topic: 'Notion Jira roadmap capacity',
      budgetChars: 12000,
      referenceDate: REF,
    });
    assert.equal(
      sel.expanded[0].rel.split('/').slice(-2).join('/'),
      'outputs/roadmap-synthesis.md',
    );
    // working/ scratch is listed, never expanded by default.
    assert.ok(sel.listed.some((l) => l.rel.endsWith('working/scratch.md')));
    assert.ok(!sel.expanded.some((d) => d.rel.endsWith('working/scratch.md')));
  });

  it('AC-R12: a .png/.csv in outputs/ is neither expanded nor causes error', async () => {
    writeDoc(tmpDir, 'projects/active/r12/README.md', '# R12\n\nroadmap text\n', 1);
    writeDoc(tmpDir, 'projects/active/r12/outputs/diagram.png', 'PNGDATA', 1);
    writeDoc(tmpDir, 'projects/active/r12/outputs/data.csv', 'a,b,c\n1,2,3', 1);
    writeDoc(tmpDir, 'projects/active/r12/outputs/notes.md', '# Notes\n\nroadmap synthesis\n', 1);

    const sel = await selectProjectDocs('r12', paths, { storage }, {
      topic: 'roadmap',
      budgetChars: 12000,
      referenceDate: REF,
    });
    const allRels = [...sel.expanded.map((d) => d.rel), ...sel.listed.map((l) => l.rel)];
    assert.ok(!allRels.some((r) => r.endsWith('.png')), 'no .png surfaced');
    assert.ok(!allRels.some((r) => r.endsWith('.csv')), 'no .csv surfaced');
    assert.ok(allRels.some((r) => r.endsWith('outputs/notes.md')), '.md still surfaced');
  });

  it('AC-R5: short title (≤2 content tokens), 3 docs where the correct doc is NOT most recent → relevance still wins', async () => {
    // Title "Jira Roadmap Sync" → tokens ~ [jira, roadmap, sync]. The correct
    // doc names jira+roadmap but is OLDER than two off-topic, more-recent docs.
    writeDoc(
      tmpDir,
      'projects/active/sync/README.md',
      '# Overview\n\nProject overview, no specifics.\n',
      0, // most recent, off-topic
    );
    writeDoc(
      tmpDir,
      'projects/active/sync/recent-standup.md',
      '# Standup\n\nDaily standup notes and blockers list.\n',
      0, // most recent, off-topic
    );
    writeDoc(
      tmpDir,
      'projects/active/sync/jira-roadmap.md',
      '# Jira Roadmap\n\nThe jira roadmap sync decision and slice zero plan.\n',
      9, // older, but the on-topic doc
    );

    const sel = await selectProjectDocs('sync', paths, { storage }, {
      topic: 'Jira Roadmap Sync',
      // R5: caller unions area/attendee tokens; here the title alone carries it.
      budgetChars: 12000,
      referenceDate: REF,
    });
    assert.equal(
      sel.expanded[0].rel.split('/').pop(),
      'jira-roadmap.md',
      `relevance should beat recency; top was ${sel.expanded[0].rel}`,
    );
  });

  it('README-only project: expands README, no listed', async () => {
    writeDoc(tmpDir, 'projects/active/solo/README.md', '# Solo\n\nonly file\n', 1);
    const sel = await selectProjectDocs('solo', paths, { storage }, {
      topic: 'solo',
      budgetChars: 12000,
      referenceDate: REF,
    });
    assert.equal(sel.expanded.length, 1);
    assert.ok(sel.expanded[0].rel.endsWith('solo/README.md'));
    assert.equal(sel.listed.length, 0);
  });

  it('empty/frontmatter-only working file: listed with a filename-derived title (no crash)', async () => {
    writeDoc(tmpDir, 'projects/active/fm/README.md', '# FM\n\nbody\n', 1);
    writeDoc(tmpDir, 'projects/active/fm/working/empty-note.md', '---\nstatus: draft\n---\n', 2);
    const sel = await selectProjectDocs('fm', paths, { storage }, {
      topic: 'fm',
      budgetChars: 12000,
      referenceDate: REF,
    });
    const fmNote = sel.listed.find((l) => l.rel.endsWith('working/empty-note.md'));
    assert.ok(fmNote, 'frontmatter-only working file is listed');
    assert.ok(fmNote!.title.length > 0, 'falls back to filename title');
  });

  it('nonexistent project returns empty selection without error', async () => {
    const sel = await selectProjectDocs('ghost', paths, { storage }, {
      topic: 'x',
      budgetChars: 12000,
      referenceDate: REF,
    });
    assert.deepEqual(sel.expanded, []);
    assert.deepEqual(sel.listed, []);
  });

  it('zero-result safety: low-relevance topic still expands the most-recent root doc + lowConfidence flag', async () => {
    writeDoc(tmpDir, 'projects/active/alpha/README.md', '# Heading\n\napple banana cherry\n', 2);
    writeDoc(tmpDir, 'projects/active/alpha/older.md', '# Older\n\napple\n', 8);
    const sel = await selectProjectDocs('alpha', paths, { storage }, {
      topic: 'zzzz qqqq wwww', // no overlap → relevance ~0
      budgetChars: 12000,
      referenceDate: REF,
    });
    assert.ok(sel.expanded.length >= 1, 'never empty when a doc exists');
    assert.equal(sel.lowConfidence, true, 'low-confidence surfaced');
  });
});
