import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createTestWorkspace } from './index.js';
import { seedRichWorkspaceScenario } from './scenarios/rich-workspace.js';

describe('test fixtures: createTestWorkspace', () => {
  it('creates deterministic files for people, meetings, projects, and memory', () => {
    const root = mkdtempSync(join(tmpdir(), 'fixture-workspace-'));

    try {
      const fixture = createTestWorkspace(root);
      seedRichWorkspaceScenario(fixture);

      const person = readFileSync(join(root, 'people', 'internal', 'jane-doe.md'), 'utf8');
      assert.ok(person.includes('Jane Doe'));

      const meeting = readFileSync(
        join(root, 'resources', 'meetings', '2026-01-15-auth-blocker.md'),
        'utf8',
      );
      assert.ok(meeting.includes('Auth Blocker'));

      const project = readFileSync(
        join(root, 'projects', 'active', 'onboarding-discovery', 'README.md'),
        'utf8',
      );
      assert.ok(project.includes('Onboarding Discovery'));

      const decisions = readFileSync(join(root, '.arete', 'memory', 'items', 'decisions.md'), 'utf8');
      assert.ok(decisions.includes('Proceed with onboarding v2 scope'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
