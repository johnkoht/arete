/**
 * Tests for org-entity service (Phase 1 §b).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectOrgsFromMeetings,
  refreshOrgs,
  createOrgEntityManual,
  renderOrgAutoSection,
  slugifyDomain,
} from '../../src/services/org-entity.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';
import {
  AUTO_ORG_MEMORY_START,
  AUTO_ORG_MEMORY_END,
} from '../../src/models/org-entity.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeMeeting(
  root: string,
  filename: string,
  attendees: Array<{ name: string; email: string }>,
  date: string,
): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const lines = [
    '---',
    `title: "${filename.replace('.md', '')}"`,
    `date: ${date}`,
    'attendees:',
    ...attendees.map(
      (a) => `  - { name: "${a.name}", email: "${a.email}" }`,
    ),
    '---',
    '',
    `# ${filename.replace('.md', '')}`,
    '',
    'body',
  ];
  writeFileSync(join(dir, filename), lines.join('\n'), 'utf8');
}

let workspaceRoot: string;
let paths: WorkspacePaths;
let storage: FileStorageAdapter;

beforeEach(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-org-entity-test-'));
  paths = makePaths(workspaceRoot);
  storage = new FileStorageAdapter();
});

afterEach(() => {
  if (existsSync(workspaceRoot)) rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('slugifyDomain', () => {
  it('strips .com suffix', () => {
    assert.equal(slugifyDomain('cover-whale.com'), 'cover-whale');
  });

  it('strips .io', () => {
    assert.equal(slugifyDomain('foxen.io'), 'foxen');
  });

  it('handles multi-segment domain', () => {
    assert.equal(slugifyDomain('mail.acme.com'), 'acme');
  });

  it('handles country-coded TLDs', () => {
    assert.equal(slugifyDomain('acme.co.uk'), 'acme');
  });

  it('returns single-segment domain unchanged', () => {
    assert.equal(slugifyDomain('localhost'), 'localhost');
  });
});

describe('renderOrgAutoSection', () => {
  it('emits canonical bullet shape', () => {
    const section = renderOrgAutoSection(
      {
        slug: 'cover-whale',
        domain: 'cover-whale.com',
        sources: ['resources/meetings/2026-04-01-foo.md', 'resources/meetings/2026-04-15-bar.md'],
        peopleNames: ['Anthony', 'Carla'],
        firstSeen: '2026-04-01',
        lastSeen: '2026-04-15',
      },
      '2026-04-22',
    );
    assert.match(section, /\*\*Last seen\*\*: 2026-04-15/);
    assert.match(section, /\*\*First seen\*\*: 2026-04-01/);
    assert.match(section, /\*\*Distinct meetings.*: 2/);
    assert.match(section, /Anthony, Carla/);
    assert.match(section, /Refreshed.*2026-04-22/);
  });
});

describe('detectOrgsFromMeetings', () => {
  it('returns empty array when no meetings dir', async () => {
    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.deepEqual(detected, []);
  });

  it('detects org appearing on 2 distinct meetings within window', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw1.md', [
      { name: 'Anthony', email: 'anthony@cover-whale.com' },
      { name: 'John', email: 'john@reserv.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-cw2.md', [
      { name: 'Carla', email: 'carla@cover-whale.com' },
      { name: 'John', email: 'john@reserv.com' },
    ], '2026-04-15');

    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.equal(detected.length, 1);
    assert.equal(detected[0].slug, 'cover-whale');
    assert.equal(detected[0].sources.length, 2);
    assert.deepEqual(detected[0].peopleNames.sort(), ['Anthony', 'Carla']);
    assert.equal(detected[0].firstSeen, '2026-04-01');
    assert.equal(detected[0].lastSeen, '2026-04-15');
  });

  it('does NOT detect internal-only meetings', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-internal1.md', [
      { name: 'John', email: 'john@reserv.com' },
      { name: 'Mike', email: 'mike@reserv.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-internal2.md', [
      { name: 'John', email: 'john@reserv.com' },
      { name: 'Sarah', email: 'sarah@reserv.com' },
    ], '2026-04-15');

    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.equal(detected.length, 0);
  });

  it('does NOT count single-meeting orgs (under threshold)', async () => {
    writeMeeting(workspaceRoot, '2026-04-15-leap.md', [
      { name: 'Lex', email: 'lex@leap.legal' },
      { name: 'John', email: 'john@reserv.com' },
    ], '2026-04-15');

    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.equal(detected.length, 0);
  });

  it('respects custom internal domains', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-foo.md', [
      { name: 'A', email: 'a@example.org' },
      { name: 'B', email: 'b@reserv.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-foo.md', [
      { name: 'C', email: 'c@example.org' },
      { name: 'B', email: 'b@reserv.com' },
    ], '2026-04-15');

    // With example.org as internal, we should detect 0 orgs.
    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
      internalDomains: ['reserv.com', 'example.org'],
    });
    assert.equal(detected.length, 0);
  });

  it('drops meetings outside the detection window', async () => {
    writeMeeting(workspaceRoot, '2025-01-01-old1.md', [
      { name: 'A', email: 'a@cover-whale.com' },
    ], '2025-01-01');
    writeMeeting(workspaceRoot, '2025-01-15-old2.md', [
      { name: 'B', email: 'b@cover-whale.com' },
    ], '2025-01-15');

    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.equal(detected.length, 0);
  });

  it('detects multiple orgs across meetings', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw.md', [
      { name: 'Anthony', email: 'anthony@cover-whale.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-05-cw.md', [
      { name: 'Anthony', email: 'anthony@cover-whale.com' },
    ], '2026-04-05');
    writeMeeting(workspaceRoot, '2026-04-08-leap.md', [
      { name: 'Lex', email: 'lex@leap.legal' },
    ], '2026-04-08');
    writeMeeting(workspaceRoot, '2026-04-15-leap.md', [
      { name: 'Lex', email: 'lex@leap.legal' },
    ], '2026-04-15');

    const detected = await detectOrgsFromMeetings(paths, storage, {
      today: '2026-04-22',
    });
    assert.equal(detected.length, 2);
    const slugs = detected.map((d) => d.slug).sort();
    assert.deepEqual(slugs, ['cover-whale', 'leap']);
  });
});

describe('refreshOrgs', () => {
  it('writes a fresh org page when one does not exist', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw1.md', [
      { name: 'Anthony', email: 'anthony@cover-whale.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-cw2.md', [
      { name: 'Carla', email: 'carla@cover-whale.com' },
    ], '2026-04-15');

    const result = await refreshOrgs(paths, storage, { today: '2026-04-22' });
    assert.deepEqual(result.written, ['cover-whale']);

    const pagePath = join(workspaceRoot, '.arete', 'memory', 'entities', 'orgs', 'cover-whale.md');
    assert.ok(existsSync(pagePath));
    const content = readFileSync(pagePath, 'utf8');
    assert.match(content, /org_slug: cover-whale/);
    assert.match(content, new RegExp(AUTO_ORG_MEMORY_START));
    assert.match(content, /Anthony/);
    assert.match(content, /Carla/);
  });

  it('preserves user-authored content outside sentinels on refresh', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw1.md', [
      { name: 'A', email: 'a@cover-whale.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-cw2.md', [
      { name: 'B', email: 'b@cover-whale.com' },
    ], '2026-04-15');

    // First run — creates the page.
    await refreshOrgs(paths, storage, { today: '2026-04-22' });

    const pagePath = join(workspaceRoot, '.arete', 'memory', 'entities', 'orgs', 'cover-whale.md');
    const original = readFileSync(pagePath, 'utf8');

    // User adds prose above sentinels.
    const edited = original.replace(
      AUTO_ORG_MEMORY_START,
      `## My private notes\n\nJohn's notes about cover whale.\n\n${AUTO_ORG_MEMORY_START}`,
    );
    writeFileSync(pagePath, edited, 'utf8');

    // Add a third meeting and re-refresh.
    writeMeeting(workspaceRoot, '2026-04-20-cw3.md', [
      { name: 'C', email: 'c@cover-whale.com' },
    ], '2026-04-20');

    await refreshOrgs(paths, storage, { today: '2026-04-22' });
    const refreshed = readFileSync(pagePath, 'utf8');
    assert.match(refreshed, /My private notes/);
    assert.match(refreshed, /John's notes about cover whale/);
  });

  it('dryRun: returns detected orgs without writing files', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw1.md', [
      { name: 'A', email: 'a@cover-whale.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-cw2.md', [
      { name: 'B', email: 'b@cover-whale.com' },
    ], '2026-04-15');

    const result = await refreshOrgs(paths, storage, { today: '2026-04-22', dryRun: true });
    assert.equal(result.detected.length, 1);
    assert.equal(result.written.length, 0);
    const pagePath = join(workspaceRoot, '.arete', 'memory', 'entities', 'orgs', 'cover-whale.md');
    assert.equal(existsSync(pagePath), false);
  });

  it('byte-equal skip: re-running the same refresh is a no-op for the page write', async () => {
    writeMeeting(workspaceRoot, '2026-04-01-cw1.md', [
      { name: 'A', email: 'a@cover-whale.com' },
    ], '2026-04-01');
    writeMeeting(workspaceRoot, '2026-04-15-cw2.md', [
      { name: 'B', email: 'b@cover-whale.com' },
    ], '2026-04-15');

    const first = await refreshOrgs(paths, storage, { today: '2026-04-22' });
    assert.deepEqual(first.written, ['cover-whale']);

    const second = await refreshOrgs(paths, storage, { today: '2026-04-22' });
    // Refreshed timestamp is the same (same `today`), no new sources →
    // page byte-equals → skipped.
    assert.deepEqual(second.skipped, ['cover-whale']);
    assert.deepEqual(second.written, []);
  });
});

describe('createOrgEntityManual', () => {
  it('creates a new org page', async () => {
    const result = await createOrgEntityManual(paths, storage, {
      slug: 'foxen',
      today: '2026-04-22',
      aliases: ['fx'],
      relatedTopics: ['rate-cap'],
    });
    assert.equal(result.created, true);
    const content = readFileSync(result.pagePath, 'utf8');
    assert.match(content, /org_slug: foxen/);
    assert.match(content, /aliases:[\s\S]*?- fx/);
    assert.match(content, /related_topics:[\s\S]*?- rate-cap/);
  });

  it('does not overwrite an existing page', async () => {
    await createOrgEntityManual(paths, storage, {
      slug: 'foxen',
      today: '2026-04-22',
    });

    const second = await createOrgEntityManual(paths, storage, {
      slug: 'foxen',
      today: '2026-04-30', // different date
    });
    assert.equal(second.created, false);

    const content = readFileSync(second.pagePath, 'utf8');
    assert.match(content, /first_seen: 2026-04-22/); // unchanged
  });

  it('embeds prose above the sentinels when provided', async () => {
    const result = await createOrgEntityManual(paths, storage, {
      slug: 'foxen',
      today: '2026-04-22',
      prose: 'A partner discussed but never on calls.',
    });
    const content = readFileSync(result.pagePath, 'utf8');
    assert.match(content, /A partner discussed but never on calls\./);
    // Prose should appear BEFORE the sentinels, AFTER the title.
    const proseIdx = content.indexOf('A partner discussed');
    const sentIdx = content.indexOf(AUTO_ORG_MEMORY_START);
    assert.ok(proseIdx > 0 && proseIdx < sentIdx);
  });
});
