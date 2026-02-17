import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { runCli } from '../helpers.js';
import {
  createIntegrationSandbox,
  installWorkspace,
  seedWorkspaceFromFixtures,
} from './helpers.js';

describe('integration: seeded people workflow regression', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-seeded-people');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('supports seeded people workflows on two fresh runs (deterministic regression guard)', () => {
    for (let run = 1; run <= 2; run++) {
      const workspace = join(sandboxRoot, `cursor-run-${run}`);
      installWorkspace(workspace, 'cursor');
      seedWorkspaceFromFixtures(workspace);

      const meetingsDir = join(workspace, 'resources', 'meetings');
      const meetings = readdirSync(meetingsDir).filter((name) => name.endsWith('.md'));
      assert.ok(meetings.length > 0, 'seeded meetings should exist');

      const peopleListOutput = runCli(['people', 'list', '--json'], { cwd: workspace });
      const peopleList = JSON.parse(peopleListOutput) as {
        success: boolean;
        count: number;
        people: Array<{ slug: string }>;
      };
      assert.equal(peopleList.success, true);
      assert.ok(peopleList.count > 0, 'seeded people list should not be empty');
      assert.ok(
        peopleList.people.some((person) => person.slug === 'jane-doe'),
        'seeded people should include jane-doe',
      );

      const showOutput = runCli(['people', 'show', 'jane-doe', '--json'], {
        cwd: workspace,
      });
      const showResult = JSON.parse(showOutput) as {
        success: boolean;
        person: { slug: string; category: string };
      };
      assert.equal(showResult.success, true);
      assert.equal(showResult.person.slug, 'jane-doe');

      const indexOutput = runCli(['people', 'index', '--json'], { cwd: workspace });
      const indexResult = JSON.parse(indexOutput) as {
        success: boolean;
        path: string;
        count: number;
      };
      assert.equal(indexResult.success, true);
      assert.ok(indexResult.count > 0, 'index should include seeded people');
      assert.equal(existsSync(join(workspace, 'people', 'index.md')), true);
    }
  });
});
