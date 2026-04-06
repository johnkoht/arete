/**
 * Tests for generateMeetingManifest().
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateMeetingManifest } from '../../src/services/meeting-manifest.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, '.arete', 'manifest.json'),
    ideConfig: join(root, '.arete', 'ide.json'),
    rules: join(root, '.agents', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.agents', 'tools'),
    integrations: join(root, '.arete', 'integrations'),
    context: join(root, '.arete', 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.arete', 'credentials'),
    templates: join(root, '.arete', 'templates'),
  };
}

function writeMeeting(
  dir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
): void {
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => `  - ${item}`).join('\n')}`;
      }
      return `${k}: ${v == null ? '' : JSON.stringify(v)}`;
    })
    .join('\n');
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n\nMeeting body here.\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateMeetingManifest', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let paths: WorkspacePaths;
  let meetingsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
    storage = new FileStorageAdapter();
    paths = makePaths(tmpDir);
    meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns meetingCount 0 when meetings directory does not exist', async () => {
    const emptyPaths = makePaths(join(tmpDir, 'nonexistent'));
    const result = await generateMeetingManifest(emptyPaths, storage);
    assert.equal(result.meetingCount, 0);
  });

  it('generates MANIFEST.md with correct week grouping for 3 meetings across 2 weeks', async () => {
    // Week of 2026-03-30: Mon 2026-03-30 to Sun 2026-04-05
    writeMeeting(meetingsDir, '2026-04-04-q2-planning.md', {
      title: 'Q2 Planning',
      status: 'processed',
      importance: 'important',
      area: 'product',
      attendee_ids: ['sarah-jones', 'mike-chen'],
      topics: ['roadmap', 'q2-planning'],
      open_action_items: 3,
      my_commitments: 2,
      their_commitments: 1,
      decisions_count: 2,
    });
    writeMeeting(meetingsDir, '2026-04-02-team-sync.md', {
      title: 'Team Sync',
      status: 'processed',
      importance: 'normal',
      open_action_items: 1,
      my_commitments: 1,
      their_commitments: 0,
      decisions_count: 0,
    });

    // Week of 2026-03-23
    writeMeeting(meetingsDir, '2026-03-25-roadmap-review.md', {
      title: 'Roadmap Review',
      status: 'synced',
      importance: 'normal',
      topics: ['roadmap'],
    });

    const result = await generateMeetingManifest(paths, storage);
    assert.equal(result.meetingCount, 3);

    const manifestPath = join(meetingsDir, 'MANIFEST.md');
    const content = readFileSync(manifestPath, 'utf8');

    // Check frontmatter stats
    assert.ok(content.includes('total_meetings: 3'), 'Should have total_meetings: 3');
    assert.ok(content.includes('open_action_items: 4'), 'Should sum open_action_items (3+1=4)');
    assert.ok(content.includes('my_commitments: 3'), 'Should sum my_commitments (2+1=3)');
    assert.ok(content.includes('their_commitments: 1'), 'Should sum their_commitments');

    // Check week groupings (two distinct weeks)
    assert.ok(content.includes('## Week of 2026-03-30'), 'Should have week 2026-03-30');
    assert.ok(content.includes('## Week of 2026-03-23'), 'Should have week 2026-03-23');

    // Check entry content
    assert.ok(content.includes('### 2026-04-04 | Q2 Planning | important | processed'), 'Should have entry heading');
    assert.ok(content.includes('- file: 2026-04-04-q2-planning.md'), 'Should have file line');
    assert.ok(content.includes('- people: sarah-jones, mike-chen'), 'Should have people line');
    assert.ok(content.includes('- area: product'), 'Should have area line');
    assert.ok(content.includes('- topics: roadmap, q2-planning'), 'Should have topics line');
    assert.ok(content.includes('open_items: 3 (mine: 2, theirs: 1)'), 'Should have open_items line');
    assert.ok(content.includes('decisions: 2'), 'Should have decisions count');

    // Roadmap Review (synced — no open_items)
    assert.ok(content.includes('2026-03-25-roadmap-review.md'), 'Should include older meeting');
  });

  it('does not include the MANIFEST.md file itself in the listing', async () => {
    writeMeeting(meetingsDir, '2026-04-04-test.md', {
      title: 'Test',
      status: 'processed',
    });

    await generateMeetingManifest(paths, storage);
    const result = await generateMeetingManifest(paths, storage); // second run
    assert.equal(result.meetingCount, 1, 'Should not count MANIFEST.md itself');
  });

  it('excludes meetings outside the window', async () => {
    writeMeeting(meetingsDir, '2026-04-04-recent.md', { title: 'Recent' });
    // Far past the 3-day window
    writeMeeting(meetingsDir, '2020-01-01-old.md', { title: 'Old' });

    const result = await generateMeetingManifest(paths, storage, { windowDays: 3 });
    assert.equal(result.meetingCount, 1);

    const content = readFileSync(join(meetingsDir, 'MANIFEST.md'), 'utf8');
    assert.ok(content.includes('2026-04-04-recent.md'), 'Should include recent meeting');
    assert.ok(!content.includes('2020-01-01-old.md'), 'Should not include old meeting');
  });

  it('omits lines for missing frontmatter fields gracefully', async () => {
    writeMeeting(meetingsDir, '2026-04-04-minimal.md', {
      title: 'Minimal Meeting',
      status: 'synced',
    });

    const result = await generateMeetingManifest(paths, storage);
    assert.equal(result.meetingCount, 1);

    const content = readFileSync(join(meetingsDir, 'MANIFEST.md'), 'utf8');
    assert.ok(content.includes('2026-04-04-minimal.md'), 'Should have file line');
    assert.ok(!content.includes('- people:'), 'Should not have people line when absent');
    assert.ok(!content.includes('- area:'), 'Should not have area line when absent');
    assert.ok(!content.includes('- topics:'), 'Should not have topics line when absent');
    assert.ok(!content.includes('open_items:'), 'Should not have open_items line when absent');
  });

  it('sorts meetings descending within each week', async () => {
    writeMeeting(meetingsDir, '2026-04-01-first.md', { title: 'First' });
    writeMeeting(meetingsDir, '2026-04-03-later.md', { title: 'Later' });
    writeMeeting(meetingsDir, '2026-04-02-middle.md', { title: 'Middle' });

    await generateMeetingManifest(paths, storage);
    const content = readFileSync(join(meetingsDir, 'MANIFEST.md'), 'utf8');

    const laterIdx = content.indexOf('2026-04-03');
    const middleIdx = content.indexOf('2026-04-02');
    const firstIdx = content.indexOf('2026-04-01');
    assert.ok(laterIdx < middleIdx, 'Later meeting should come before middle');
    assert.ok(middleIdx < firstIdx, 'Middle meeting should come before first');
  });

  it('writes frontmatter with generated_at and window_days', async () => {
    writeMeeting(meetingsDir, '2026-04-04-test.md', { title: 'Test' });

    await generateMeetingManifest(paths, storage, { windowDays: 30 });
    const content = readFileSync(join(meetingsDir, 'MANIFEST.md'), 'utf8');

    assert.ok(content.includes('window_days: 30'), 'Should have window_days: 30');
    assert.ok(content.includes('generated_at:'), 'Should have generated_at');
  });
});
