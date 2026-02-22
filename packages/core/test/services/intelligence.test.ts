/**
 * Tests for IntelligenceService via compat assembleBriefing and routeToSkill.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assembleBriefing, routeToSkill } from '../../src/compat/intelligence.js';
import type { WorkspacePaths, SkillCandidate } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
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

const SAMPLE_SKILLS: SkillCandidate[] = [
  {
    id: 'meeting-prep',
    name: 'meeting-prep',
    description: 'Build a prep brief. Use when the user wants to prepare for a meeting, get context before a call.',
    path: '/ws/.agents/skills/meeting-prep',
    triggers: ['meeting prep', 'prep for meeting', 'call with'],
    primitives: ['User'],
    work_type: 'operations',
    category: 'default',
  },
  {
    id: 'daily-plan',
    name: 'daily-plan',
    description: "Surface today's focus and meeting context. Use when the user wants a daily plan or what's on my plate today.",
    path: '/ws/.agents/skills/daily-plan',
    work_type: 'planning',
    category: 'default',
  },
  {
    id: 'workspace-tour',
    name: 'workspace-tour',
    description: 'Orient users to the Areté PM workspace. Use when the user asks for a tour, how the workspace works.',
    path: '/ws/.agents/skills/workspace-tour',
    triggers: ['give me a tour', 'tour of', 'how does this work'],
    work_type: 'operations',
    category: 'essential',
  },
];

// ---------------------------------------------------------------------------
// assembleBriefing tests
// ---------------------------------------------------------------------------

describe('IntelligenceService (via compat)', () => {
  describe('assembleBriefing', () => {
    let tmpDir: string;
    let paths: WorkspacePaths;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'intel-brief-'));
      paths = makePaths(tmpDir);
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

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
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems for enterprise customers.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nFocus on enterprise search solutions.');

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

    it('respects primitives option', async () => {
      const result = await assembleBriefing('market analysis', paths, {
        primitives: ['Market'],
      });
      assert.deepEqual(result.context.primitives, ['Market']);
    });
  });

  describe('routeToSkill', () => {
    it('routes "prep me for my meeting with Jane" to meeting-prep', () => {
      const r = routeToSkill('prep me for my meeting with Jane', SAMPLE_SKILLS);
      assert.ok(r);
      assert.equal(r!.skill, 'meeting-prep');
      assert.ok(r!.path.includes('meeting-prep'));
    });

    it('routes "what\'s on my plate today" to daily-plan', () => {
      const r = routeToSkill("what's on my plate today", SAMPLE_SKILLS);
      assert.ok(r);
      assert.equal(r!.skill, 'daily-plan');
    });

    it('routes tour queries to workspace-tour', () => {
      const r = routeToSkill('give me a tour of the workspace', SAMPLE_SKILLS);
      assert.ok(r);
      assert.equal(r!.skill, 'workspace-tour');
    });

    it('returns null for empty query', () => {
      assert.equal(routeToSkill('', SAMPLE_SKILLS), null);
      assert.equal(routeToSkill('   ', SAMPLE_SKILLS), null);
    });

    it('returns null for unrelated query', () => {
      const r = routeToSkill('what is the weather', SAMPLE_SKILLS);
      assert.equal(r, null);
    });

    it('includes primitives and work_type in routing response', () => {
      const r = routeToSkill('prep me for my meeting', SAMPLE_SKILLS);
      assert.ok(r);
      assert.deepEqual(r!.primitives, ['User']);
      assert.equal(r!.work_type, 'operations');
    });

    it('includes type=skill and action=load for skills', () => {
      const r = routeToSkill('daily plan', SAMPLE_SKILLS);
      assert.ok(r);
      assert.equal(r!.type, 'skill');
      assert.equal(r!.action, 'load');
    });

    it('routes tools with type=tool and action=activate', () => {
      const tools: SkillCandidate[] = [
        {
          id: 'onboarding',
          name: 'onboarding',
          description: '30/60/90 day plan for new job',
          path: '/ws/.cursor/tools/onboarding',
          type: 'tool',
          lifecycle: 'time-bound',
          duration: '90-150 days',
          triggers: ["I'm starting a new job", 'onboarding'],
          work_type: 'planning',
          category: 'default',
        },
      ];
      const r = routeToSkill("I'm starting a new job", tools);
      assert.ok(r);
      assert.equal(r!.skill, 'onboarding');
      assert.equal(r!.type, 'tool');
      assert.equal(r!.action, 'activate');
      assert.equal(r!.lifecycle, 'time-bound');
    });
  });

  describe('routeToSkill with mixed skills + tools', () => {
    const SAMPLE_TOOLS: SkillCandidate[] = [
      {
        id: 'onboarding',
        name: 'onboarding',
        description: '30/60/90 day plan for thriving at a new job - learn, contribute, lead',
        path: '/ws/.cursor/tools/onboarding',
        triggers: ["I'm starting a new job", 'onboarding', '30/60/90', 'new role', 'ramp up'],
        type: 'tool',
        lifecycle: 'time-bound',
        duration: '90-150 days',
      },
    ];

    const MIXED_CANDIDATES = [...SAMPLE_SKILLS, ...SAMPLE_TOOLS];

    it('routes "I\'m starting a new job" to onboarding tool over skills', () => {
      const r = routeToSkill("I'm starting a new job", MIXED_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'onboarding');
      assert.equal(r!.type, 'tool');
      assert.equal(r!.action, 'activate');
      assert.equal(r!.lifecycle, 'time-bound');
      assert.equal(r!.duration, '90-150 days');
    });

    it('routes "prep for meeting with Jane" to meeting-prep skill (not affected by tools)', () => {
      const r = routeToSkill('prep for meeting with Jane', MIXED_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'meeting-prep');
      assert.equal(r!.type, 'skill');
      assert.equal(r!.action, 'load');
    });

    it('routes "give me a tour" to workspace-tour skill (no regression)', () => {
      const r = routeToSkill('give me a tour', MIXED_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'workspace-tour');
      assert.equal(r!.type, 'skill');
      assert.equal(r!.action, 'load');
    });
  });
});
