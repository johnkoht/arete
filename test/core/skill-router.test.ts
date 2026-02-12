import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeToSkill } from '../../src/core/skill-router.js';
import type { SkillCandidate } from '../../src/core/skill-router.js';

describe('skill-router', () => {
  const skills: SkillCandidate[] = [
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
      description: 'Surface today\'s focus and meeting context. Use when the user wants a daily plan or what\'s on my plate today.',
      path: '/ws/.agents/skills/daily-plan',
      work_type: 'planning',
      category: 'default',
    },
    {
      id: 'synthesize',
      name: 'synthesize',
      description: 'Process project inputs into insights. Use when the user wants to synthesize findings or pull together research.',
      path: '/ws/.agents/skills/synthesize',
      primitives: ['Problem', 'User', 'Solution'],
      work_type: 'analysis',
      category: 'default',
    },
    {
      id: 'workspace-tour',
      name: 'workspace-tour',
      description: 'Orient users to the Areté PM workspace. Use when the user asks for a tour, how the workspace works, what they can do, or says they\'re new.',
      path: '/ws/.agents/skills/workspace-tour',
      triggers: ['give me a tour', 'tour of', 'how does this work', 'what can I do here', "I'm new here"],
      work_type: 'operations',
      category: 'essential',
    },
    {
      id: 'prepare-meeting-agenda',
      name: 'prepare-meeting-agenda',
      description: 'Create a structured meeting agenda with type-based sections. Use when the user wants to build an agenda document.',
      path: '/ws/.agents/skills/prepare-meeting-agenda',
      triggers: ['meeting agenda', 'create agenda', 'prepare agenda', 'agenda for', 'build agenda', 'create meeting agenda', 'prepare meeting agenda'],
      primitives: ['User', 'Problem', 'Solution'],
      work_type: 'planning',
      category: 'essential',
    },
  ];

  it('routes "prep me for my meeting with Jane" to meeting-prep', () => {
    const r = routeToSkill('prep me for my meeting with Jane', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'meeting-prep');
    assert.ok(r!.path.includes('meeting-prep'));
  });

  it('routes "meeting prep for Product Review" to meeting-prep', () => {
    const r = routeToSkill('meeting prep for Product Review', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'meeting-prep');
  });

  it('routes "call with Acme" to meeting-prep via triggers', () => {
    const r = routeToSkill('call with Acme', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'meeting-prep');
  });

  it('routes "what\'s on my plate today" to daily-plan', () => {
    const r = routeToSkill("what's on my plate today", skills);
    assert.ok(r);
    assert.equal(r!.skill, 'daily-plan');
  });

  it('routes "synthesize findings" to synthesize', () => {
    const r = routeToSkill('synthesize findings', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'synthesize');
  });

  it('routes tour/orientation queries to workspace-tour', () => {
    const queries = [
      'Can you give me a tour of arete workspace?',
      'give me a tour of the workspace',
      'how does this work',
      'what can I do here',
    ];
    for (const q of queries) {
      const r = routeToSkill(q, skills);
      assert.ok(r, `Expected a match for: ${q}`);
      assert.equal(r!.skill, 'workspace-tour', `Expected workspace-tour for: ${q}`);
    }
  });

  it('returns null for empty query', () => {
    assert.equal(routeToSkill('', skills), null);
    assert.equal(routeToSkill('   ', skills), null);
  });

  it('returns null for unrelated query', () => {
    const r = routeToSkill('what is the weather', skills);
    assert.equal(r, null);
  });

  it('routes all three meeting-prep phrasings to meeting-prep', () => {
    const queries = [
      'prep me for my meeting with jane',
      'i have a meeting withi jane tmorrow cna you help me prep',
      'meeting prep for meeting with jane'
    ];
    for (const q of queries) {
      const r = routeToSkill(q, skills);
      assert.ok(r, `Expected a match for: ${q}`);
      assert.equal(r!.skill, 'meeting-prep', `Expected meeting-prep for: ${q}`);
    }
  });

  it('routes "weekly plan" and "plan my week" to week-plan', () => {
    const skillsWithWeekPlan: SkillCandidate[] = [
      ...skills,
      {
        id: 'week-plan',
        name: 'week-plan',
        description: 'Plan the week and set weekly priorities.',
        path: '/ws/.agents/skills/week-plan',
        triggers: ['weekly plan', 'plan my week', 'plan the week', 'week planning'],
        work_type: 'planning',
        category: 'essential',
      },
    ];
    for (const q of ['weekly plan', 'plan my week', 'plan the week']) {
      const r = routeToSkill(q, skillsWithWeekPlan);
      assert.ok(r, `Expected a match for: ${q}`);
      assert.equal(r!.skill, 'week-plan', `Expected week-plan for: ${q}`);
    }
  });

  it('routes "create meeting agenda" and "prepare agenda" to prepare-meeting-agenda', () => {
    const agendaQueries = [
      'create meeting agenda',
      'prepare agenda for the leadership sync',
      'create an agenda for my 1:1 with Jane',
      'build agenda for customer call',
    ];
    for (const q of agendaQueries) {
      const r = routeToSkill(q, skills);
      assert.ok(r, `Expected a match for: ${q}`);
      assert.equal(r!.skill, 'prepare-meeting-agenda', `Expected prepare-meeting-agenda for: ${q}`);
    }
  });

  it('routes "prepare a meeting agenda for the kickoff call" to prepare-meeting-agenda not meeting-prep', () => {
    const r = routeToSkill('prepare a meeting agenda for the kickoff call tomorrow', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'prepare-meeting-agenda', 'agenda creation should route to prepare-meeting-agenda, not meeting-prep');
  });

  it('routes "prep for meeting with X" to meeting-prep not prepare-meeting-agenda', () => {
    const r = routeToSkill('prep for meeting with Jane', skills);
    assert.ok(r);
    assert.equal(r!.skill, 'meeting-prep');
  });

  // Phase 3: Extended frontmatter tests

  it('includes primitives in routing response', () => {
    const r = routeToSkill('prep me for my meeting', skills);
    assert.ok(r);
    assert.deepEqual(r!.primitives, ['User']);
  });

  it('includes work_type in routing response', () => {
    const r = routeToSkill('synthesize findings', skills);
    assert.ok(r);
    assert.equal(r!.work_type, 'analysis');
  });

  it('includes category in routing response', () => {
    const r = routeToSkill('daily plan', skills);
    assert.ok(r);
    assert.equal(r!.category, 'default');
  });

  it('boosts skills matching work_type keywords', () => {
    // "I want to do some analysis" should match synthesize via work_type
    const analysisSkills: SkillCandidate[] = [
      {
        id: 'synthesize',
        name: 'synthesize',
        description: 'Process inputs into insights.',
        path: '/ws/.agents/skills/synthesize',
        work_type: 'analysis',
      },
      {
        id: 'save-meeting',
        name: 'save-meeting',
        description: 'Save meeting content.',
        path: '/ws/.agents/skills/save-meeting',
        work_type: 'operations',
      },
    ];
    const r = routeToSkill('analyze my research data', analysisSkills);
    assert.ok(r);
    assert.equal(r!.skill, 'synthesize');
  });

  it('prefers essential skills over community in ties', () => {
    const tiedSkills: SkillCandidate[] = [
      {
        id: 'core-prd',
        name: 'core-prd',
        description: 'Create a PRD for product requirements.',
        path: '/ws/.agents/skills/core-prd',
        category: 'essential',
      },
      {
        id: 'community-prd',
        name: 'community-prd',
        description: 'Create a PRD for product requirements.',
        path: '/ws/.agents/skills/community-prd',
        category: 'community',
      },
    ];
    const r = routeToSkill('create a prd', tiedSkills);
    assert.ok(r);
    assert.equal(r!.skill, 'core-prd');
  });

  it('includes requires_briefing in routing response', () => {
    const skillsWithBriefing: SkillCandidate[] = [
      {
        id: 'community-prd',
        name: 'community-prd',
        description: 'Create a PRD for product requirements.',
        path: '/ws/.agents/skills/community-prd',
        category: 'community',
        requires_briefing: true,
      },
    ];
    const r = routeToSkill('create a prd', skillsWithBriefing);
    assert.ok(r);
    assert.equal(r!.requires_briefing, true);
  });
});
