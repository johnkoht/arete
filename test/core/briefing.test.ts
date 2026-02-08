/**
 * Tests for src/core/briefing.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { assembleBriefing } from '../../src/core/briefing.js';
import type { WorkspacePaths } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    cursor: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    skills: join(root, '.cursor', 'skills'),
    skillsCore: join(root, '.cursor', 'skills-core'),
    skillsLocal: join(root, '.cursor', 'skills-local'),
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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('briefing', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'briefing-test-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('assembleBriefing', () => {
    it('returns a briefing with all expected fields', () => {
      const result = assembleBriefing('create a PRD for search', paths);
      assert.equal(result.task, 'create a PRD for search');
      assert.ok(result.assembledAt.length > 0);
      assert.ok(['High', 'Medium', 'Low'].includes(result.confidence));
      assert.ok(result.context);
      assert.ok(result.memory);
      assert.ok(Array.isArray(result.entities));
      assert.ok(typeof result.markdown === 'string');
    });

    it('includes skill name in briefing when provided', () => {
      const result = assembleBriefing('create a PRD for search', paths, {
        skill: 'create-prd',
      });
      assert.equal(result.skill, 'create-prd');
      assert.ok(result.markdown.includes('create-prd'));
    });

    it('assembles context files from workspace', () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems for enterprise customers who need fast, accurate results.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nFocus on enterprise search solutions and improve retention metrics.');

      const result = assembleBriefing('search feature', paths, {
        primitives: ['Problem'],
      });
      assert.ok(result.context.files.length > 0);
      const biz = result.context.files.find(f => f.relativePath === 'context/business-overview.md');
      assert.ok(biz, 'Should include business-overview.md');
    });

    it('includes memory results in briefing', () => {
      writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-15: Use Elasticsearch for search\n\n**Decision**: We chose Elasticsearch.\n');

      const result = assembleBriefing('search technology', paths);
      assert.ok(result.memory.results.length >= 1);
      assert.ok(result.markdown.includes('Relevant Memory'));
    });

    it('resolves entities mentioned in the task', () => {
      writeFile(tmpDir, 'people/internal/jane-doe.md', '---\nname: "Jane Doe"\nemail: "jane@acme.com"\nrole: "PM"\ncategory: "internal"\n---\n\n# Jane Doe\n');

      const result = assembleBriefing('prep for meeting with Jane Doe', paths);
      assert.ok(result.entities.length >= 1);
      const jane = result.entities.find(e => e.name === 'Jane Doe');
      assert.ok(jane, 'Should resolve Jane Doe entity');
      assert.equal(jane!.type, 'person');
    });

    it('includes gaps in the markdown briefing', () => {
      const result = assembleBriefing('create a PRD', paths, {
        primitives: ['Problem', 'User'],
      });
      assert.ok(result.context.gaps.length > 0);
      assert.ok(result.markdown.includes('Gap'));
    });

    it('generates markdown with primitive sections', () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nOur main problem is enterprise onboarding friction causing customer churn.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins who manage team onboarding and need bulk import tools.');

      const result = assembleBriefing('onboarding improvements', paths, {
        primitives: ['Problem', 'User'],
      });

      assert.ok(result.markdown.includes('### Problem'));
      assert.ok(result.markdown.includes('### User'));
    });

    it('respects primitives option', () => {
      const result = assembleBriefing('market analysis', paths, {
        primitives: ['Market'],
      });
      assert.deepEqual(result.context.primitives, ['Market']);
    });

    it('uses all primitives when none specified', () => {
      const result = assembleBriefing('general task', paths);
      assert.equal(result.context.primitives.length, 5);
    });

    it('includes confidence in markdown', () => {
      const result = assembleBriefing('anything', paths);
      assert.ok(result.markdown.includes('**Confidence**:'));
    });

    it('includes assembledAt timestamp in markdown', () => {
      const result = assembleBriefing('anything', paths);
      assert.ok(result.markdown.includes('**Assembled**:'));
    });
  });
});
