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

  describe('disambiguation: getting-started skill vs onboarding tool', () => {
    const GETTING_STARTED_SKILL: SkillCandidate = {
      id: 'getting-started',
      name: 'getting-started',
      description: 'Get started with Areté - conversational setup that bootstraps your workspace in 15-30 minutes',
      path: '/ws/.agents/skills/getting-started',
      triggers: ["Let's get started", "Help me set up Areté", "Help me setup arete", "Help me set up my workspace", "Set up Areté", "I'm new to Areté", "Get started", "Onboard me to Areté", "Getting started"],
      type: 'skill',
      work_type: 'operations',
      category: 'core',
    };

    const ONBOARDING_TOOL: SkillCandidate = {
      id: 'onboarding',
      name: 'onboarding',
      description: '30/60/90 day plan for thriving at a new job - learn, contribute, lead',
      path: '/ws/.cursor/tools/onboarding',
      triggers: ["I'm starting a new job", 'onboarding', '30/60/90', 'new role', 'ramp up'],
      type: 'tool',
      lifecycle: 'time-bound',
      duration: '90-150 days',
    };

    const STALE_ONBOARDING_SKILL: SkillCandidate = {
      id: 'onboarding',
      name: 'onboarding',
      description: 'Get started with Areté - conversational setup that bootstraps your workspace in 15-30 minutes',
      path: '/ws/.agents/skills/onboarding',
      triggers: ["Let's get started", "Help me set up Areté", "Onboard me", "I'm new to Areté", "Set up my workspace", "Get started with Areté"],
      type: 'skill',
      work_type: 'operations',
      category: 'core',
    };

    const DISAMBIGUATION_CANDIDATES = [GETTING_STARTED_SKILL, ONBOARDING_TOOL, ...SAMPLE_SKILLS];

    it('routes "help me setup arete" to getting-started skill', () => {
      const r = routeToSkill('help me setup arete', DISAMBIGUATION_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'getting-started');
      assert.equal(r!.type, 'skill');
      assert.equal(r!.action, 'load');
    });

    it('routes "I\'m starting a new job" to onboarding tool', () => {
      const r = routeToSkill("I'm starting a new job", DISAMBIGUATION_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'onboarding');
      assert.equal(r!.type, 'tool');
      assert.equal(r!.action, 'activate');
    });

    it('routes "onboarding at my new company" to onboarding tool', () => {
      const r = routeToSkill('onboarding at my new company', DISAMBIGUATION_CANDIDATES);
      assert.ok(r, 'Should route to something');
      assert.equal(r!.skill, 'onboarding');
      assert.equal(r!.type, 'tool');
      assert.equal(r!.action, 'activate');
    });

    describe('stale workspace with both onboarding skill and getting-started skill', () => {
      const STALE_CANDIDATES = [STALE_ONBOARDING_SKILL, GETTING_STARTED_SKILL, ONBOARDING_TOOL, ...SAMPLE_SKILLS];

      it('routes "help me setup arete" to getting-started skill (not stale onboarding)', () => {
        const r = routeToSkill('help me setup arete', STALE_CANDIDATES);
        assert.ok(r, 'Should route to something');
        assert.equal(r!.skill, 'getting-started');
        assert.equal(r!.type, 'skill');
        assert.ok(r!.path.includes('getting-started'), `Expected path to include getting-started, got ${r!.path}`);
      });

      it('routes "I\'m starting a new job" to onboarding tool (not stale onboarding skill)', () => {
        const r = routeToSkill("I'm starting a new job", STALE_CANDIDATES);
        assert.ok(r, 'Should route to something');
        assert.equal(r!.skill, 'onboarding');
        assert.equal(r!.type, 'tool');
        assert.equal(r!.action, 'activate');
      });
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

  // ---------------------------------------------------------------------------
  // Content ingestion routing tests
  // Tests for routing queries about adding/saving content to the workspace.
  // Fixtures use realistic metadata from actual SKILL.md files.
  // ---------------------------------------------------------------------------
  describe('routing: content ingestion queries', () => {
    // Realistic fixtures copied from packages/runtime/skills/*/SKILL.md
    const CONTENT_SKILLS: SkillCandidate[] = [
      {
        id: 'rapid-context-dump',
        name: 'rapid-context-dump',
        description: 'Quickly bootstrap workspace context from docs, website, or pasted content with review-before-promote workflow',
        path: '/ws/.agents/skills/rapid-context-dump',
        triggers: [
          'dump my context',
          'import my docs',
          'bootstrap context',
          'ingest my content',
          'extract context from',
          'read my website',
          'process my docs',
        ],
        work_type: 'activation',
        category: 'core',
      },
      {
        id: 'prepare-meeting-agenda',
        name: 'prepare-meeting-agenda',
        description: 'Create a structured meeting agenda with type-based sections and optional time allocation. Use when the user wants to build an agenda document for an upcoming meeting (leadership, customer, dev team, 1:1, or other).',
        path: '/ws/.agents/skills/prepare-meeting-agenda',
        triggers: [
          'meeting agenda',
          'create agenda',
          'prepare agenda',
          'agenda for',
          'build agenda',
          'create meeting agenda',
          'prepare meeting agenda',
        ],
        primitives: ['User', 'Problem', 'Solution'],
        work_type: 'planning',
        category: 'essential',
      },
      {
        id: 'save-meeting',
        name: 'save-meeting',
        description: 'Save pasted meeting content (summary, transcript, URL) to resources/meetings. Use when the user pastes meeting content and wants to save it, or says "save this meeting".',
        path: '/ws/.agents/skills/save-meeting',
        // Note: save-meeting has no explicit triggers in SKILL.md
        work_type: 'operations',
        category: 'essential',
      },
      {
        id: 'capture-conversation',
        name: 'capture-conversation',
        description: 'Capture a pasted conversation into a structured artifact with extracted insights. Use when the user pastes a conversation from Slack, Teams, email, or any source and wants to save it.',
        path: '/ws/.agents/skills/capture-conversation',
        triggers: [
          'capture this conversation',
          'save this conversation',
          'capture this slack thread',
          'save this discussion',
          'I have a conversation to capture',
        ],
        work_type: 'operations',
        category: 'essential',
      },
    ];

    describe('should route content ingestion queries to rapid-context-dump', () => {
      // These are the original failing queries from user reports
      it('routes "I have input data to add about Reserve, the product team, etc. Where should I add it?"', () => {
        const query = 'I have input data to add about Reserve, the product team, etc. Where should I add it?';
        const r = routeToSkill(query, CONTENT_SKILLS);
        // Should route to rapid-context-dump OR return null, but NOT prepare-meeting-agenda
        // The key assertion: must not false-positive to prepare-meeting-agenda
        if (r) {
          assert.equal(r.skill, 'rapid-context-dump', 'Should route to rapid-context-dump');
          assert.notEqual(r.skill, 'prepare-meeting-agenda', 'Must NOT route to prepare-meeting-agenda');
        }
        // null is acceptable if no confident match
      });

      it('routes "save a lengthy AI vision and roadmap document, summarize it, and include it in context"', () => {
        const query = 'save a lengthy AI vision and roadmap document, summarize it, and include it in context';
        const r = routeToSkill(query, CONTENT_SKILLS);
        // Should route to rapid-context-dump
        assert.ok(r, 'Should find a match');
        assert.equal(r!.skill, 'rapid-context-dump', 'Should route to rapid-context-dump');
        assert.notEqual(r!.skill, 'prepare-meeting-agenda', 'Must NOT route to prepare-meeting-agenda');
      });

      // Pattern-based variations to prevent overfitting
      it('routes "where should I put this content?" to rapid-context-dump', () => {
        const r = routeToSkill('where should I put this content?', CONTENT_SKILLS);
        if (r) {
          assert.equal(r.skill, 'rapid-context-dump');
        }
      });

      it('routes "add this document to my workspace context" to rapid-context-dump', () => {
        const r = routeToSkill('add this document to my workspace context', CONTENT_SKILLS);
        if (r) {
          assert.equal(r.skill, 'rapid-context-dump');
        }
      });

      it('routes "I need to import some docs about our product" to rapid-context-dump', () => {
        const r = routeToSkill('I need to import some docs about our product', CONTENT_SKILLS);
        assert.ok(r, 'Should find a match');
        assert.equal(r!.skill, 'rapid-context-dump');
      });
    });

    describe('should NOT false-positive to prepare-meeting-agenda', () => {
      // Queries that previously routed to prepare-meeting-agenda incorrectly
      // due to incidental word matches (e.g., "team" in description)
      it('does not route "input data about the team" to prepare-meeting-agenda', () => {
        const r = routeToSkill('input data about the team', CONTENT_SKILLS);
        if (r) {
          assert.notEqual(r.skill, 'prepare-meeting-agenda', 
            'Should not route to prepare-meeting-agenda based on incidental "team" match');
        }
      });

      it('does not route "save this document" to prepare-meeting-agenda', () => {
        const r = routeToSkill('save this document', CONTENT_SKILLS);
        if (r) {
          assert.notEqual(r.skill, 'prepare-meeting-agenda');
        }
      });

      it('does not route "where to add product context" to prepare-meeting-agenda', () => {
        const r = routeToSkill('where to add product context', CONTENT_SKILLS);
        if (r) {
          assert.notEqual(r.skill, 'prepare-meeting-agenda');
        }
      });
    });

    describe('should correctly disambiguate between related skills', () => {
      // Ensure trigger expansion doesn't steal from related skills
      it('routes "save this meeting" to save-meeting, not rapid-context-dump', () => {
        const r = routeToSkill('save this meeting', CONTENT_SKILLS);
        assert.ok(r, 'Should find a match');
        assert.equal(r!.skill, 'save-meeting', 'Should route to save-meeting');
        assert.notEqual(r!.skill, 'rapid-context-dump', 'Should not route to rapid-context-dump');
      });

      it('routes "capture this conversation" to capture-conversation, not rapid-context-dump', () => {
        const r = routeToSkill('capture this conversation', CONTENT_SKILLS);
        assert.ok(r, 'Should find a match');
        assert.equal(r!.skill, 'capture-conversation', 'Should route to capture-conversation');
      });

      it('routes "create a meeting agenda" to prepare-meeting-agenda', () => {
        const r = routeToSkill('create a meeting agenda', CONTENT_SKILLS);
        assert.ok(r, 'Should find a match');
        assert.equal(r!.skill, 'prepare-meeting-agenda', 'Should route to prepare-meeting-agenda');
      });

      it('routes "save this slack thread" to capture-conversation', () => {
        const r = routeToSkill('save this slack thread', CONTENT_SKILLS);
        assert.ok(r, 'Should find a match');
        // capture-conversation has "capture this slack thread" trigger
        assert.equal(r!.skill, 'capture-conversation');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Single-word routing regression tests
  // Ensure scoring changes don't break skills that rely on keyword matching.
  // These test that skills with distinctive names still route correctly.
  // ---------------------------------------------------------------------------
  describe('routing: single-word and keyword regression tests', () => {
    // Fixtures for skills that might be affected by scoring threshold changes
    const KEYWORD_SKILLS: SkillCandidate[] = [
      {
        id: 'discovery',
        name: 'discovery',
        description: 'Guide problem discovery and research synthesis. Use when the user wants to start discovery, understand a problem, research a topic, or validate assumptions.',
        path: '/ws/.agents/skills/discovery',
        // Note: discovery has no explicit triggers
        primitives: ['Problem', 'User'],
        work_type: 'discovery',
        category: 'default',
      },
      {
        id: 'construct-roadmap',
        name: 'construct-roadmap',
        description: 'Build and maintain product roadmaps. Use when the user wants to build, update, or plan a roadmap, do quarterly planning, or prioritize backlog.',
        path: '/ws/.agents/skills/construct-roadmap',
        // Note: construct-roadmap has no explicit triggers
        primitives: ['Solution', 'Market', 'Risk'],
        work_type: 'delivery',
        category: 'default',
      },
      {
        id: 'synthesize',
        name: 'synthesize',
        description: 'Process project inputs into insights and decisions. Use when the user wants to synthesize findings, process inputs, summarize learnings, or pull together research.',
        path: '/ws/.agents/skills/synthesize',
        // Note: synthesize has no explicit triggers
        primitives: ['Problem', 'User', 'Solution'],
        work_type: 'analysis',
        category: 'essential',
      },
      // Include a skill with triggers to ensure mixed behavior works
      ...SAMPLE_SKILLS,
    ];

    it('routes "discovery" to discovery skill', () => {
      const r = routeToSkill('discovery', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'discovery');
    });

    it('routes "start discovery for this problem" to discovery skill', () => {
      const r = routeToSkill('start discovery for this problem', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'discovery');
    });

    it('routes "roadmap planning" to construct-roadmap skill', () => {
      const r = routeToSkill('roadmap planning', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'construct-roadmap');
    });

    it('routes "build a roadmap" to construct-roadmap skill', () => {
      const r = routeToSkill('build a roadmap', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'construct-roadmap');
    });

    it('routes "synthesize" to synthesize skill', () => {
      const r = routeToSkill('synthesize', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'synthesize');
    });

    it('routes "synthesize my findings" to synthesize skill', () => {
      const r = routeToSkill('synthesize my findings', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'synthesize');
    });

    // Ensure existing trigger-based routing still works alongside keyword matching
    it('still routes "prep for meeting" to meeting-prep (trigger-based)', () => {
      const r = routeToSkill('prep for meeting', KEYWORD_SKILLS);
      assert.ok(r, 'Should find a match');
      assert.equal(r!.skill, 'meeting-prep');
    });
  });
});
