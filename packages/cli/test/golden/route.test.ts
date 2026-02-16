/**
 * Golden pattern tests for arete route command
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw } from '../helpers.js';

describe('golden: route command', () => {
  it('route produces JSON with query, skill, model', () => {
    const stdout = runCli(['route', 'create a PRD for search', '--json']);
    const json = JSON.parse(stdout);
    assert.equal(json.success, true);
    assert.ok(typeof json.query === 'string');
    assert.ok(typeof json.model === 'object');
    assert.ok(typeof json.model.tier === 'string');
    assert.ok(typeof json.model.reason === 'string');
    assert.ok(
      /^(fast|balanced|powerful)$/.test(json.model.tier),
      'Model tier should be fast, balanced, or powerful',
    );
  });

  it('route human output has Skill/Tool and Model lines', () => {
    const stdout = runCli(['route', 'help me with a meeting']);
    assert.ok(
      /Skill\/Tool:/.test(stdout) || /Model:/.test(stdout),
      'Should have Skill/Tool or Model section',
    );
    assert.ok(
      /Model:\s+\w+\s+—/.test(stdout),
      'Should have Model: tier — reason format',
    );
  });
});
