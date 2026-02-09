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
    it('returns a briefing with all expected fields', async () => {
      const result = await assembleBriefing('create a PRD for search', paths);
      assert.equal(result.task, 'create a PRD for search');
      assert.ok(result.assembledAt.length > 0);
      assert.ok(['High', 'Medium', 'Low'].includes(result.confidence));
      assert.ok(result.context);
      assert.ok(result.memory);
      assert.ok(Array.isArray(result.entities));
      assert.ok(typeof result.markdown === 'string');
    });

    it('includes skill name in briefing when provided', async () => {
      const result = await assembleBriefing('create a PRD for search', paths, {
        skill: 'create-prd',
      });
      assert.equal(result.skill, 'create-prd');
      assert.ok(result.markdown.includes('create-prd'));
    });

    it('assembles context files from workspace', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems for enterprise customers who need fast, accurate results.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nFocus on enterprise search solutions and improve retention metrics.');

      const result = await assembleBriefing('search feature', paths, {
        primitives: ['Problem'],
      });
      assert.ok(result.context.files.length > 0);
      const biz = result.context.files.find(f => f.relativePath === 'context/business-overview.md');
      assert.ok(biz, 'Should include business-overview.md');
    });

    it('includes memory results in briefing', async () => {
      writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-15: Use Elasticsearch for search\n\n**Decision**: We chose Elasticsearch.\n');

      const result = await assembleBriefing('search technology', paths);
      assert.ok(result.memory.results.length >= 1);
      assert.ok(result.markdown.includes('Relevant Memory'));
    });

    it('resolves entities mentioned in the task', async () => {
      writeFile(tmpDir, 'people/internal/jane-doe.md', '---\nname: "Jane Doe"\nemail: "jane@acme.com"\nrole: "PM"\ncategory: "internal"\n---\n\n# Jane Doe\n');

      const result = await assembleBriefing('prep for meeting with Jane Doe', paths);
      assert.ok(result.entities.length >= 1);
      const jane = result.entities.find(e => e.name === 'Jane Doe');
      assert.ok(jane, 'Should resolve Jane Doe entity');
      assert.equal(jane!.type, 'person');
    });

    it('includes gaps in the markdown briefing', async () => {
      const result = await assembleBriefing('create a PRD', paths, {
        primitives: ['Problem', 'User'],
      });
      assert.ok(result.context.gaps.length > 0);
      assert.ok(result.markdown.includes('Gap'));
    });

    it('generates markdown with primitive sections', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nOur main problem is enterprise onboarding friction causing customer churn.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins who manage team onboarding and need bulk import tools.');

      const result = await assembleBriefing('onboarding improvements', paths, {
        primitives: ['Problem', 'User'],
      });

      assert.ok(result.markdown.includes('### Problem'));
      assert.ok(result.markdown.includes('### User'));
    });

    it('respects primitives option', async () => {
      const result = await assembleBriefing('market analysis', paths, {
        primitives: ['Market'],
      });
      assert.deepEqual(result.context.primitives, ['Market']);
    });

    it('uses all primitives when none specified', async () => {
      const result = await assembleBriefing('general task', paths);
      assert.equal(result.context.primitives.length, 5);
    });

    it('includes confidence in markdown', async () => {
      const result = await assembleBriefing('anything', paths);
      assert.ok(result.markdown.includes('**Confidence**:'));
    });

    it('includes assembledAt timestamp in markdown', async () => {
      const result = await assembleBriefing('anything', paths);
      assert.ok(result.markdown.includes('**Assembled**:'));
    });

    it('includes relevance scores in markdown for files', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems for enterprise customers.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nFocus on enterprise search solutions.');

      const result = await assembleBriefing('search feature', paths, {
        primitives: ['Problem'],
      });

      // Files from context injection now have relevanceScore (at least staticScore = 0.5)
      assert.ok(result.markdown.includes('(relevance:'), 'Should include relevance score in markdown');
    });

    it('includes scores in markdown for memory results', async () => {
      writeFile(tmpDir, '.arete/memory/items/decisions.md', '### 2026-01-15: Use Elasticsearch for search\n\n**Decision**: We chose Elasticsearch for better performance.\n');

      const result = await assembleBriefing('search technology', paths);
      
      if (result.memory.results.length > 0) {
        // Memory results should have scores
        assert.ok(result.memory.results[0].score !== undefined, 'Memory result should have score');
        // Check if markdown includes score (only if memory results were found)
        if (result.markdown.includes('Relevant Memory')) {
          assert.ok(result.markdown.includes('(score:'), 'Should include score in markdown for memory results');
        }
      }
    });

    it('sorts files by relevance score descending within primitives', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve enterprise problems with search and discovery tools.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins who need search capabilities.');

      const result = await assembleBriefing('search feature', paths, {
        primitives: ['Problem', 'User'],
      });

      // Verify files have relevance scores
      const filesWithScores = result.context.files.filter(f => f.relevanceScore !== undefined);
      assert.ok(filesWithScores.length > 0, 'Should have files with relevance scores');

      // Check markdown output: extract relevance scores in order for each primitive section
      const problemSection = result.markdown.match(/### Problem\n([\s\S]*?)(?=\n###|$)/);
      if (problemSection) {
        const scoreMatches = problemSection[0].matchAll(/relevance: ([\d.]+)/g);
        const scores = Array.from(scoreMatches).map(m => parseFloat(m[1]));
        if (scores.length > 1) {
          // Verify scores are in descending order
          for (let i = 1; i < scores.length; i++) {
            assert.ok(scores[i - 1] >= scores[i], `Scores should be descending: ${scores[i - 1]} >= ${scores[i]}`);
          }
        }
      }
    });

    it('includes low confidence note in gaps when confidence is Low', async () => {
      // Create minimal context to trigger Low confidence
      const result = await assembleBriefing('very specific obscure task', paths, {
        primitives: ['Problem', 'User', 'Solution', 'Market', 'Risk'],
      });

      if (result.confidence === 'Low' && result.context.gaps.length > 0) {
        assert.ok(result.markdown.includes('Low confidence indicates'), 'Should include note about low confidence');
      }
    });

    it('notes when SearchProvider found no relevant content', async () => {
      // Empty workspace, no files => gaps for all primitives => Low confidence
      const result = await assembleBriefing('create a new feature', paths, {
        primitives: ['Problem', 'User'],
      });

      // Should have gaps and likely Low confidence
      assert.ok(result.context.gaps.length > 0, 'Should have gaps in empty workspace');
      if (result.confidence === 'Low') {
        assert.ok(result.markdown.includes('semantic search found limited relevant content'), 'Should note limited content found');
      }
    });
  });
});
