import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask } from '../../src/core/model-router.js';

describe('model-router', () => {
  it('classifies simple lookups as fast', () => {
    const r = classifyTask('what is my status');
    assert.equal(r.tier, 'fast');
    assert.ok(r.reason.length > 0);
  });

  it('classifies "list tasks" as fast', () => {
    const r = classifyTask('list tasks');
    assert.equal(r.tier, 'fast');
  });

  it('classifies analysis as powerful', () => {
    const r = classifyTask('analyze the competitive landscape');
    assert.equal(r.tier, 'powerful');
  });

  it('classifies planning as powerful', () => {
    const r = classifyTask('plan the quarter and prioritize roadmap');
    assert.equal(r.tier, 'powerful');
  });

  it('classifies writing/PRD as powerful', () => {
    const r = classifyTask('write a PRD for onboarding v2');
    assert.equal(r.tier, 'powerful');
  });

  it('classifies long prompt as powerful', () => {
    const r = classifyTask('a'.repeat(250));
    assert.equal(r.tier, 'powerful');
  });

  it('classifies generic short prompt as balanced', () => {
    const r = classifyTask('help me with something');
    assert.equal(r.tier, 'balanced');
  });
});
