import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectOverlapRoleFromCandidates } from '../../src/commands/skill.js';

describe('detectOverlapRoleFromCandidates', () => {
  const baseCandidates = [
    { id: 'create-prd', workType: 'definition' },
    { id: 'discovery', workType: 'discovery' },
    { id: 'week-plan', workType: 'planning' },
  ] as const;

  it('matches by direct id variants (prd -> create-prd)', () => {
    const role = detectOverlapRoleFromCandidates(
      'prd',
      'A skill to draft product requirements docs',
      undefined,
      [...baseCandidates],
    );

    assert.equal(role, 'create-prd');
  });

  it('matches by strong keyword in description', () => {
    const role = detectOverlapRoleFromCandidates(
      'writing-prds',
      'Generate PRDs and product requirements quickly',
      undefined,
      [...baseCandidates],
    );

    assert.equal(role, 'create-prd');
  });

  it('matches by work type when specific', () => {
    const role = detectOverlapRoleFromCandidates(
      'customer-research-assistant',
      'Helps run user interviews',
      'discovery',
      [...baseCandidates],
    );

    assert.equal(role, 'discovery');
  });
});
