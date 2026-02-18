import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCli } from '../helpers.js';
import { createIntegrationSandbox, installWorkspace } from './helpers.js';

describe('integration: people intelligence digest', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-people-intelligence');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('classifies with unknown-queue defaults, contract hints, and digest metrics', () => {
    const workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');

    mkdirSync(join(workspace, 'context'), { recursive: true });
    mkdirSync(join(workspace, 'inputs'), { recursive: true });

    writeFileSync(
      join(workspace, 'context', 'profile.md'),
      `---\nname: "Jane Doe"\nemail: "jane@acme.com"\ncompany: "Acme"\nwebsite: "https://acme.com"\n---\n`,
      'utf8',
    );
    writeFileSync(
      join(workspace, 'context', 'domain-hints.md'),
      `---\ndomains:\n  - acme.com\n---\n`,
      'utf8',
    );

    writeFileSync(
      join(workspace, 'inputs', 'people-candidates.json'),
      JSON.stringify(
        [
          {
            name: 'Sam Internal',
            email: 'sam@acme.com',
            text: 'internal planning sync attendee',
            source: 'meeting-1.md',
          },
          {
            name: 'Mystery Contact',
            text: 'quick mention without enough signal',
            source: 'meeting-2.md',
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    const output = runCli(
      [
        'people',
        'intelligence',
        'digest',
        '--input',
        'inputs/people-candidates.json',
        '--json',
      ],
      { cwd: workspace },
    );

    const result = JSON.parse(output) as {
      success: boolean;
      mode: string;
      totalCandidates: number;
      unknownQueueCount: number;
      suggestions: Array<{
        candidate: { name?: string };
        recommendation: { affiliation: string; category: string };
        status: string;
      }>;
      metrics: {
        triageBurdenMinutes: number;
        unknownQueueRate: number;
      };
    };

    assert.equal(result.success, true);
    assert.equal(result.mode, 'digest');
    assert.equal(result.totalCandidates, 2);
    assert.equal(result.unknownQueueCount, 1);

    const internal = result.suggestions.find((s) => s.candidate.name === 'Sam Internal');
    assert.ok(internal, 'expected internal suggestion');
    assert.equal(internal?.recommendation.affiliation, 'internal');
    assert.equal(internal?.recommendation.category, 'internal');
    assert.equal(internal?.status, 'recommended');

    const unknown = result.suggestions.find((s) => s.candidate.name === 'Mystery Contact');
    assert.ok(unknown, 'expected unknown suggestion');
    assert.equal(unknown?.recommendation.category, 'unknown_queue');

    assert.ok(result.metrics.triageBurdenMinutes >= 5);
    assert.ok(result.metrics.unknownQueueRate > 0);
  });

  it('preserves backward-compatible unknown-queue behavior with toggles disabled and sparse input', () => {
    const workspace = join(sandboxRoot, 'cursor-fallback');
    installWorkspace(workspace, 'cursor');

    mkdirSync(join(workspace, 'inputs'), { recursive: true });
    writeFileSync(
      join(workspace, 'inputs', 'people-candidates.json'),
      JSON.stringify(
        [
          {
            name: 'Sparse Mention',
            text: 'brief mention',
            source: 'meeting-fallback.md',
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    const output = runCli(
      [
        'people',
        'intelligence',
        'digest',
        '--input',
        'inputs/people-candidates.json',
        '--json',
      ],
      { cwd: workspace },
    );

    const result = JSON.parse(output) as {
      success: boolean;
      unknownQueueCount: number;
      suggestions: Array<{
        recommendation: { category: string };
        enrichmentApplied: boolean;
      }>;
      policy: {
        features: {
          enableExtractionTuning: boolean;
          enableEnrichment: boolean;
        };
      };
    };

    assert.equal(result.success, true);
    assert.equal(result.policy.features.enableExtractionTuning, false);
    assert.equal(result.policy.features.enableEnrichment, false);
    assert.equal(result.unknownQueueCount, 1);
    assert.equal(result.suggestions[0].recommendation.category, 'unknown_queue');
    assert.equal(result.suggestions[0].enrichmentApplied, false);
  });
});
