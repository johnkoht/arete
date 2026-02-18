import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCli } from '../helpers.js';
import { createIntegrationSandbox, installWorkspace } from './helpers.js';

describe('integration: meeting process with people intelligence', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-meeting-process');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('processes latest meeting and writes attendee_ids while preserving unknown queue behavior', () => {
    const workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');

    mkdirSync(join(workspace, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(workspace, 'context'), { recursive: true });

    writeFileSync(
      join(workspace, 'context', 'domain-hints.md'),
      `---\ndomains:\n  - acme.com\n---\n`,
      'utf8',
    );

    const meetingPath = join(workspace, 'resources', 'meetings', '2026-02-20-sync.md');
    writeFileSync(
      meetingPath,
      `---\ntitle: "Sync"\ndate: "2026-02-20"\n---\n\n# Sync\n\n**Attendees**: Sam Internal <sam@acme.com>, Mystery Person\n`,
      'utf8',
    );

    const output = runCli(['meeting', 'process', '--latest', '--json'], { cwd: workspace });
    const result = JSON.parse(output) as {
      success: boolean;
      applied: Array<{ slug: string; category: string }>;
      unknownQueue: Array<{ name: string | null }>;
    };

    assert.equal(result.success, true);
    assert.ok(result.applied.some((item) => item.slug === 'sam-internal'));
    assert.ok(result.unknownQueue.some((item) => item.name === 'Mystery Person'));

    assert.equal(existsSync(join(workspace, 'people', 'internal', 'sam-internal.md')), true);
    const meetingContent = readFileSync(meetingPath, 'utf8');
    assert.ok(meetingContent.includes('attendee_ids'));
    assert.ok(meetingContent.includes('sam-internal'));
  });
});
