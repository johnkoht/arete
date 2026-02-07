import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeToSkill } from '../../src/core/skill-router.js';

describe('skill-router', () => {
  const skills = [
    {
      id: 'meeting-prep',
      name: 'meeting-prep',
      description: 'Build a prep brief. Use when the user wants to prepare for a meeting, get context before a call.',
      path: '/ws/.cursor/skills-core/meeting-prep',
      triggers: ['meeting prep', 'prep for meeting', 'call with']
    },
    {
      id: 'daily-plan',
      name: 'daily-plan',
      description: 'Surface today\'s focus and meeting context. Use when the user wants a daily plan or what\'s on my plate today.',
      path: '/ws/.cursor/skills-core/daily-plan'
    },
    {
      id: 'synthesize',
      name: 'synthesize',
      description: 'Process project inputs into insights. Use when the user wants to synthesize findings or pull together research.',
      path: '/ws/.cursor/skills-core/synthesize'
    }
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
});
