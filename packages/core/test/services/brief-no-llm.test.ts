/**
 * Phase 9 — AC7 invariant: NO LLM in `assembleBriefFor*` methods.
 *
 * Two-pronged check:
 *  1. Structural grep guard — scan brief-assemblers.ts source for forbidden
 *     symbols (`aiService.call`, `callLLM`, `AIService` import). Belt-and-
 *     braces enforcement; cheap to run.
 *  2. Runtime invariant — instantiate IntelligenceService with no AIService,
 *     call each assembleBriefFor* method against a tiny fixture, assert
 *     none throw.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
import type { WorkspacePaths } from '../../src/models/index.js';

const ASSEMBLERS_PATH = join(
  process.cwd(),
  'src',
  'services',
  'brief-assemblers.ts',
);

describe('AC7: brief verb is LLM-free', () => {
  it('grep guard — brief-assemblers.ts contains no forbidden LLM symbols (code-shape only, docstrings ignored)', () => {
    const source = readFileSync(ASSEMBLERS_PATH, 'utf8');
    // Strip block comments and line comments before scanning so the
    // policy-mention prose ("NO AIService injection") doesn't false-trigger.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const forbidden = [
      /\bAIService\b/, // type import or call
      /\baiService\./, // instance use
      /\bcallLLM\(/, // function invocation
      /from\s+['"][^'"]*services\/ai[^'"]*['"]/, // import path
    ];
    for (const re of forbidden) {
      const m = stripped.match(re);
      assert.equal(
        m,
        null,
        `brief-assemblers.ts code must not reference ${re} (matched: "${m?.[0]}")`,
      );
    }
  });

  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-no-llm-'));
    paths = makePaths(tmpDir);
    // Minimal workspace — exercise each mode against empty/sparse fixture
    writeFileSync(join(tmpDir, '.arete'), '', 'utf8');
    rmSync(join(tmpDir, '.arete'));
    mkdirSync(join(tmpDir, '.arete'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.arete/commitments.json'),
      JSON.stringify({ commitments: [] }),
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runtime invariant — all four assembleBriefFor* methods complete without an AIService', async () => {
    // Construct IntelligenceService with NO AIService — also no email provider.
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);
    const commitments = new CommitmentsService(storage, tmpDir);
    const topicMemory = new TopicMemoryService(storage, search);
    const areaParser = new AreaParserService(storage, tmpDir);
    const areaMemory = new AreaMemoryService(
      storage,
      areaParser,
      commitments,
      memory,
      topicMemory,
    );

    const intel = new IntelligenceService(context, memory, entity);
    intel.setBriefDependencies({
      commitments,
      topicMemory,
      areaMemory,
      areaParser,
      storage,
      searchProvider: search,
    });

    // None of these should throw.
    const p = await intel.assembleBriefForPerson('any-slug', paths);
    assert.equal(p.mode, 'person');

    const pr = await intel.assembleBriefForProject('any-project', paths);
    assert.equal(pr.mode, 'project');

    const a = await intel.assembleBriefForArea('any-area', paths);
    assert.equal(a.mode, 'area');

    const m = await intel.assembleBriefForMeeting('Some title', paths);
    assert.equal(m.mode, 'meeting');
    // No calendar fetch in the verb itself — unresolved is the expected outcome
    assert.equal(m.metadata.unresolved, true);
  });
});

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
