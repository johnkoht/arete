/**
 * WS-2/WS-3 (plan-context-injection) — assemblePlanContext + extractOpenQuestions
 * unit tests. Deterministic via injected `referenceDate` and FileStorageAdapter
 * temp fixtures (per brief-project.test.ts). NO LLM/network.
 *
 * Covers the openQuestions section extraction (R7), the frozen bundle shape,
 * --day area scoping (AC3.1), and the --day fallback / explicit-reason (R13).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { AreaMemoryService } from '../../src/services/area-memory.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import { extractOpenQuestions } from '../../src/services/plan-context.js';
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

function writeFile(root: string, rel: string, content: string, mtime?: Date): void {
  const full = join(root, rel);
  mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
  if (mtime) utimesSync(full, mtime, mtime);
}

function buildIntel(root: string): IntelligenceService {
  const storage = new FileStorageAdapter();
  const search = getSearchProvider(root);
  const context = new ContextService(storage, search);
  const memory = new MemoryService(storage, search);
  const entity = new EntityService(storage);
  const commitments = new CommitmentsService(storage, root);
  const topicMemory = new TopicMemoryService(storage, search);
  const areaParser = new AreaParserService(storage, root);
  const areaMemory = new AreaMemoryService(storage, areaParser, commitments, memory, topicMemory);
  const intelligence = new IntelligenceService(context, memory, entity);
  intelligence.setBriefDependencies({
    commitments,
    topicMemory,
    areaMemory,
    areaParser,
    storage,
    searchProvider: search,
  });
  return intelligence;
}

describe('extractOpenQuestions (R7)', () => {
  it('extracts bullets from the Open Questions section, stripping list markers', () => {
    const body = `# Doc\n\n## Background\nStuff.\n\n## Open Questions\n- Should we shard?\n- [ ] What migration order?\n1. Final cutover date?\n\n## Next\nMore.\n`;
    const qs = extractOpenQuestions(body);
    assert.deepEqual(qs, ['Should we shard?', 'What migration order?', 'Final cutover date?']);
  });

  it('matches the heading case-insensitively and stops at the next same-depth heading', () => {
    const body = `## OPEN QUESTIONS\n- Q1\n### sub\n- Q2\n## Other\n- not a question\n`;
    assert.deepEqual(extractOpenQuestions(body), ['Q1', 'Q2']);
  });

  it('returns [] when there is no Open Questions section', () => {
    assert.deepEqual(extractOpenQuestions('# Doc\n\n## Background\nNo questions here.\n'), []);
  });
});

describe('IntelligenceService.assemblePlanContext', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let intel: IntelligenceService;
  const REF = new Date('2026-06-15T12:00:00Z');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plan-context-'));
    paths = makePaths(tmpDir);
    intel = buildIntel(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC2.1: --week bundle carries the frozen shape with source-tagged entries', async () => {
    writeFile(
      tmpDir,
      'projects/active/alpha/README.md',
      `---\nname: Alpha\narea: platform\nstatus: active\n---\n\n# Alpha\n\n## Background\nBuilding alpha.\n\n## Open Questions\n- Should alpha ship first?\n`,
    );
    const bundle = await intel.assemblePlanContext('week', paths, { referenceDate: REF });
    assert.equal(bundle.mode, 'week');
    assert.deepEqual(
      Object.keys(bundle).filter((k) => k !== 'reason').sort(),
      ['generatedAt', 'goals', 'lastWeek', 'mode', 'projects', 'topics', 'weekMemory'].sort(),
    );
    assert.equal(bundle.generatedAt, REF.toISOString());
    const alpha = bundle.projects.find((p) => p.slug === 'alpha');
    assert.ok(alpha);
    assert.equal(alpha.source, 'project');
    assert.equal(alpha.status, 'active');
    assert.ok(alpha.selectedDocs.some((d) => !d.listed), '≥1 expanded doc');
    assert.ok(alpha.openQuestions.some((q) => /ship first/i.test(q)));
    // Additive, non-breaking: with no now/week-memory.md the field is [].
    assert.deepEqual(bundle.weekMemory, []);
  });

  it('weekMemory: active entries surface in the bundle, resolved entries are excluded', async () => {
    writeFile(tmpDir, 'projects/active/alpha/README.md', `---\nname: Alpha\nstatus: active\n---\n# Alpha\n`);
    // Seed the live store via the real frontmatter shape the core read parses.
    writeFile(
      tmpDir,
      'now/week-memory.md',
      `---\nweek: 2026-W25\nentries:\n` +
        `  - id: aaaa1111\n    type: framing-override\n    statement: Ship gate moved to Friday\n    why: John said the demo slipped\n    status: active\n    created: '2026-06-15T09:00:00.000Z'\n    week: 2026-W25\n` +
        `  - id: bbbb2222\n    type: deprioritization\n    statement: Pause the billing refactor\n    why: Resolved on Monday\n    status: resolved\n    created: '2026-06-15T10:00:00.000Z'\n    week: 2026-W25\n` +
        `---\n\n# Week Memory\n`,
    );
    const bundle = await intel.assemblePlanContext('week', paths, { referenceDate: REF });
    assert.deepEqual(bundle.weekMemory.map((e) => e.id), ['aaaa1111']);
    assert.equal(bundle.weekMemory[0].type, 'framing-override');
    assert.ok(bundle.weekMemory.every((e) => e.status === 'active'));

    // --day surfaces the same active set (no area-filter).
    const dayBundle = await intel.assemblePlanContext('day', paths, { referenceDate: REF });
    assert.deepEqual(dayBundle.weekMemory.map((e) => e.id), ['aaaa1111']);
  });

  it('AC3.1: --day scopes projects to today\'s areas via the meeting index', async () => {
    writeFile(tmpDir, 'projects/active/p1/README.md', `---\nname: P1\narea: platform\nstatus: active\n---\n# P1\n`);
    writeFile(tmpDir, 'projects/active/p2/README.md', `---\nname: P2\narea: billing\nstatus: active\n---\n# P2\n`);
    writeFile(
      tmpDir,
      'resources/meetings/2026-06-15-sync.md',
      `---\ntitle: Sync\ndate: 2026-06-15\narea: platform\n---\n## Summary\nx\n`,
    );
    const bundle = await intel.assemblePlanContext('day', paths, { referenceDate: REF });
    assert.deepEqual(bundle.projects.map((p) => p.slug), ['p1']);
    assert.equal(bundle.reason, undefined);
  });

  it('AC-R13: --day with no area today falls back to recently-active projects with a reason', async () => {
    // Project edited "today" (recent) but no meeting today.
    writeFile(
      tmpDir,
      'projects/active/recent/README.md',
      `---\nname: Recent\narea: platform\nstatus: active\n---\n# Recent\n`,
      REF,
    );
    const bundle = await intel.assemblePlanContext('day', paths, { referenceDate: REF });
    assert.equal(bundle.reason, 'recent-active-fallback');
    assert.ok(bundle.projects.some((p) => p.slug === 'recent'));
  });

  it('AC-R13: --day with no area and no recent edits returns explicit no-area-today, never silent empty', async () => {
    writeFile(
      tmpDir,
      'projects/active/stale/README.md',
      `---\nname: Stale\narea: platform\nstatus: active\n---\n# Stale\n`,
      new Date('2026-01-01T00:00:00Z'),
    );
    const bundle = await intel.assemblePlanContext('day', paths, { referenceDate: REF });
    assert.equal(bundle.projects.length, 0);
    assert.equal(bundle.reason, 'no-area-today');
    assert.ok(!Number.isNaN(Date.parse(bundle.generatedAt)));
  });

  it('AC2.3: lastWeek is null when now/week.md is absent', async () => {
    writeFile(tmpDir, 'projects/active/a/README.md', `---\nname: A\nstatus: active\n---\n# A\n`);
    const bundle = await intel.assemblePlanContext('week', paths, { referenceDate: REF });
    assert.equal(bundle.lastWeek, null);
  });
});
