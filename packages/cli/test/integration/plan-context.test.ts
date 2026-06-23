/**
 * WS-2 / WS-3 (plan-context-injection) — `arete plan-context` integration test
 * (T4, T5).
 *
 * A temp workspace exercises the `--week` and `--day` aggregator end-to-end via
 * the CLI binary (no body parsing in the command — the bundle comes wholly from
 * `IntelligenceService.assemblePlanContext`). Covers AC2.1–AC2.4, AC-R9,
 * AC3.1, AC3.2, AC-R13. The frozen `--json` shape is snapshot-asserted (skill
 * consumer contract — pre-mortem R7/CR-8).
 *
 * Runs in CI; does NOT touch ~/code/arete-reserv.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { runCli, runCliRaw } from '../helpers.js';
import { createIntegrationSandbox, installWorkspace } from './helpers.js';

interface SelectedDoc {
  slug: string;
  rel: string;
  heading: string;
  score: number;
  provenance: string;
  listed: boolean;
}
interface WhatsNew {
  since: string | null;
  meetings: number;
  commitments: number;
  topics: number;
}
interface ContextProject {
  slug: string;
  status: string | null;
  whatsNew: WhatsNew | null;
  selectedDocs: SelectedDoc[];
  openQuestions: string[];
  source: string;
  lowConfidence?: boolean;
}
interface PlanContextResult {
  success: boolean;
  mode: string;
  projects: ContextProject[];
  topics: Array<{ slug: string; area?: string; status: string; summary: string; source: string }>;
  goals: Array<{ rel: string; title: string; source: string }>;
  lastWeek: string | null;
  weekMemory: Array<{ id: string; type: string; statement: string; status: string }>;
  generatedAt: string;
  reason?: string;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('integration: arete plan-context (WS-2/WS-3)', () => {
  let sandboxRoot: string;
  let workspace: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-plan-context');
    workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  function write(rel: string, content: string, mtime?: Date): void {
    const full = join(workspace, rel);
    mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, content, 'utf8');
    if (mtime) utimesSync(full, mtime, mtime);
  }

  function writeCommitments(commitments: unknown[]): void {
    write('.arete/commitments.json', JSON.stringify({ commitments }, null, 2));
  }

  // ---- AC2.1 + AC-R9: frozen schema + shared-budget ≥1 expanded ----------
  it('AC2.1/AC-R9: --week --json returns the frozen bundle shape; shared budget expands ≥1 doc per project', () => {
    // Two projects, each with a doc larger than half the shared budget (R9).
    const bigBody = 'x'.repeat(5000);
    write(
      'projects/active/alpha/README.md',
      `---\nname: Alpha\narea: platform\nstatus: active\n---\n\n# Alpha\n\n## Background\n${bigBody}\n`,
    );
    write(
      'projects/active/beta/README.md',
      `---\nname: Beta\narea: platform\nstatus: active\n---\n\n# Beta\n\n## Background\n${bigBody}\n`,
    );

    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.equal(result.success, true);
    assert.equal(result.mode, 'week');

    // Frozen top-level shape (skill-consumer contract).
    assert.deepEqual(
      Object.keys(result).sort(),
      ['generatedAt', 'goals', 'lastWeek', 'mode', 'projects', 'success', 'topics', 'weekMemory'].sort(),
    );
    // Additive, non-breaking: absent now/week-memory.md → [] flows through CLI.
    assert.deepEqual(result.weekMemory, []);
    // Frozen per-project entry shape.
    assert.ok(result.projects.length >= 2);
    for (const p of result.projects) {
      assert.deepEqual(
        Object.keys(p).filter((k) => k !== 'lowConfidence').sort(),
        ['openQuestions', 'selectedDocs', 'slug', 'source', 'status', 'whatsNew'].sort(),
      );
      assert.equal(p.source, 'project');
    }
    // AC-R9: each project expands ≥1 doc despite the shared budget (never
    // all-listed when ≥1 fits) — selectProjectDocs zero-result safety.
    for (const p of result.projects) {
      const expanded = p.selectedDocs.filter((d) => !d.listed);
      assert.ok(
        expanded.length >= 1,
        `expected ≥1 expanded doc for ${p.slug}; got ${JSON.stringify(p.selectedDocs)}`,
      );
    }
    // generatedAt is a valid ISO timestamp.
    assert.ok(!Number.isNaN(Date.parse(result.generatedAt)));
  });

  // ---- AC2.2: blocked project with an open commitment, source-tagged -----
  it('AC2.2: a blocked project with ≥1 open commitment appears with status + ≥1 open item, source-tagged', () => {
    // README backdated so a now-created commitment counts as "new" in whatsNew.
    write(
      'projects/active/gamma/README.md',
      `---\nname: Gamma\narea: billing\nstatus: blocked\n---\n\n# Gamma\n\n## Background\nBlocked on a vendor decision.\n`,
      daysAgo(30),
    );
    writeCommitments([
      {
        id: 'c1',
        text: 'Resolve vendor SOW before launch',
        direction: 'i_owe_them',
        personSlug: 'someone',
        personName: 'Someone',
        source: 'manual',
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        status: 'open',
        resolvedAt: null,
        projectSlug: 'gamma',
        area: 'billing',
      },
    ]);

    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    const gamma = result.projects.find((p) => p.slug === 'gamma');
    assert.ok(gamma, 'gamma project present');
    assert.equal(gamma.status, 'blocked');
    assert.equal(gamma.source, 'project');
    assert.ok(gamma.whatsNew, 'whatsNew present');
    assert.ok(
      gamma.whatsNew.commitments >= 1,
      `expected ≥1 open commitment surfaced; got ${gamma.whatsNew.commitments}`,
    );
  });

  // ---- AC2.3: lastWeek present / absent ----------------------------------
  it('AC2.3: lastWeek carries prior now/week.md content when present', () => {
    write('projects/active/alpha/README.md', `---\nname: Alpha\nstatus: active\n---\n\n# Alpha\n`);
    write('now/week.md', '# Week of 2026-06-08\n\n- Ship the thing\n');
    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.ok(result.lastWeek && result.lastWeek.includes('Ship the thing'));
  });

  it('AC2.3: lastWeek is null when now/week.md is absent (no error)', () => {
    write('projects/active/alpha/README.md', `---\nname: Alpha\nstatus: active\n---\n\n# Alpha\n`);
    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.equal(result.success, true);
    assert.equal(result.lastWeek, null);
  });

  // ---- AC2.4: quiet-but-active project (>14d unedited) still appears ------
  it('AC2.4: an active project unedited >14d still appears in projects[]', () => {
    write(
      'projects/active/quiet/README.md',
      `---\nname: Quiet\narea: ops\nstatus: active\n---\n\n# Quiet\n\n## Background\nLong-running but still open.\n`,
      daysAgo(20),
    );
    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.ok(
      result.projects.some((p) => p.slug === 'quiet'),
      'quiet active project not dropped despite 20d since edit',
    );
  });

  // ---- AC: openQuestions[] derived from the doc's Open Questions section --
  it('R7: openQuestions[] is extracted from an expanded doc Open Questions section', () => {
    write(
      'projects/active/delta/README.md',
      `---\nname: Delta\narea: platform\nstatus: active\n---\n\n# Delta\n\n## Background\nBuilding delta.\n\n## Open Questions\n- Should we shard the writes?\n- What is the migration order?\n`,
    );
    const out = runCli(['plan-context', '--week', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    const delta = result.projects.find((p) => p.slug === 'delta');
    assert.ok(delta);
    assert.ok(
      delta.openQuestions.some((q) => /shard the writes/i.test(q)),
      `expected open question extracted; got ${JSON.stringify(delta.openQuestions)}`,
    );
    assert.ok(
      delta.openQuestions.some((q) => /migration order/i.test(q)),
    );
  });

  // ---- AC3.1: --day filters to today's areas -----------------------------
  it('AC3.1: --day scopes projects to today\'s areas (calendar touches 1 area)', () => {
    const today = new Date().toISOString().slice(0, 10);
    // 3 projects across 2 areas.
    write('projects/active/p-plat/README.md', `---\nname: P Plat\narea: platform\nstatus: active\n---\n\n# P Plat\n`);
    write('projects/active/p-plat2/README.md', `---\nname: P Plat2\narea: platform\nstatus: active\n---\n\n# P Plat2\n`);
    write('projects/active/p-bill/README.md', `---\nname: P Bill\narea: billing\nstatus: active\n---\n\n# P Bill\n`);
    // A meeting today in the platform area only.
    write(
      `resources/meetings/${today}-platform-sync.md`,
      `---\ntitle: Platform Sync\ndate: ${today}\narea: platform\n---\n\n## Summary\nSynced.\n`,
    );

    const out = runCli(['plan-context', '--day', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.equal(result.mode, 'day');
    const slugs = result.projects.map((p) => p.slug).sort();
    assert.deepEqual(slugs, ['p-plat', 'p-plat2'], `only platform projects; got ${slugs.join(',')}`);
  });

  // ---- AC3.2 / AC-R13: no project-bearing area today --------------------
  it('AC3.2/AC-R13: --day with no area today returns a non-empty-reasoned bundle, never silent empty', () => {
    const today = new Date().toISOString().slice(0, 10);
    // Project edited TODAY (recent) but no meeting today → recent-active fallback.
    write(
      'projects/active/recent/README.md',
      `---\nname: Recent\narea: platform\nstatus: active\n---\n\n# Recent\n`,
    );
    // No meeting dated today at all.
    write(
      `resources/meetings/${today.replace(/\d{2}$/, '01')}-old.md`,
      `---\ntitle: Old\ndate: 2000-01-01\narea: platform\n---\n\n## Summary\nOld.\n`,
    );

    const out = runCli(['plan-context', '--day', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.equal(result.success, true);
    assert.ok(!Number.isNaN(Date.parse(result.generatedAt)), 'generatedAt populated');
    // Either recent-active projects surfaced (with a reason) OR an explicit
    // empty reason — never a silent empty bundle.
    if (result.projects.length === 0) {
      assert.equal(result.reason, 'no-area-today');
    } else {
      assert.equal(result.reason, 'recent-active-fallback');
      assert.ok(result.projects.some((p) => p.slug === 'recent'));
    }
  });

  // ---- --project single-project scope ------------------------------------
  it('--project <slug> returns a single-project bundle (AGENTS.md current-state source)', () => {
    write(
      'projects/active/solo/README.md',
      `---\nname: Solo\narea: platform\nstatus: active\n---\n\n# Solo\n\n## Background\nThe solo project.\n\n## Open Questions\n- Ship date?\n`,
    );
    write('projects/active/other/README.md', `---\nname: Other\nstatus: active\n---\n# Other\n`);
    const out = runCli(['plan-context', '--project', 'solo', '--json'], { cwd: workspace });
    const result = JSON.parse(out) as PlanContextResult;
    assert.equal(result.success, true);
    assert.equal(result.mode, 'project');
    assert.deepEqual(result.projects.map((p) => p.slug), ['solo']);
    const solo = result.projects[0];
    assert.ok(solo.selectedDocs.some((d) => !d.listed));
    assert.ok(solo.openQuestions.some((q) => /ship date/i.test(q)));
  });

  // ---- mode validation ---------------------------------------------------
  it('rejects --week and --day together', () => {
    const { stdout, code } = runCliRaw(['plan-context', '--week', '--day', '--json'], {
      cwd: workspace,
    });
    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /exactly one/i);
  });
});
