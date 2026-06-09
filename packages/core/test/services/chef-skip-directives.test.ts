/**
 * Tests for chef-skip directive parser + resolver
 * (phase-10-followup-2 Step 6).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseChefSkipDirectives,
  resolveChefSkipDirective,
  formatDirectiveStatusMessage,
} from '../../src/services/chef-skip-directives.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('parseChefSkipDirectives — Step 6 parser', () => {
  it('parses id-alone [[unskip ai_NNN]]', () => {
    const r = parseChefSkipDirectives('user note: [[unskip ai_0042]] done.');
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'unskip');
    assert.equal(r[0].id, 'ai_0042');
    assert.equal(r[0].slug, null);
  });

  it('parses slug-qualified [[unskip slug:ai_NNN]]', () => {
    const r = parseChefSkipDirectives(
      'note: [[unskip john-jamie-2026-06-04:ai_0042]]',
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'unskip');
    assert.equal(r[0].id, 'ai_0042');
    assert.equal(r[0].slug, 'john-jamie-2026-06-04');
  });

  it('parses id-alone [[confirm-skip ai_NNN]]', () => {
    const r = parseChefSkipDirectives('[[confirm-skip ai_0099]]');
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'confirm-skip');
    assert.equal(r[0].id, 'ai_0099');
    assert.equal(r[0].slug, null);
  });

  it('parses slug-qualified [[confirm-skip slug:ai_NNN]]', () => {
    const r = parseChefSkipDirectives('[[confirm-skip glance-2:ai_0099]]');
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'confirm-skip');
    assert.equal(r[0].slug, 'glance-2');
    assert.equal(r[0].id, 'ai_0099');
  });

  it('returns multiple directives in order of occurrence', () => {
    const content = `
First line: [[unskip ai_0042]]
Second line: [[confirm-skip glance-2:ai_0099]]
Third line: [[unskip ai_0043]]
`;
    const r = parseChefSkipDirectives(content);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((d) => d.kind), ['unskip', 'confirm-skip', 'unskip']);
    assert.deepEqual(r.map((d) => d.id), ['ai_0042', 'ai_0099', 'ai_0043']);
  });

  it('parses de_NNN and le_NNN ids too (decisions / learnings)', () => {
    const r = parseChefSkipDirectives('[[unskip de_001]] [[unskip le_005]]');
    assert.equal(r.length, 2);
    assert.equal(r[0].id, 'de_001');
    assert.equal(r[1].id, 'le_005');
  });

  it('returns empty when content has no directives', () => {
    const r = parseChefSkipDirectives(
      'Just some normal markdown text with [brackets] but no directives.',
    );
    assert.deepEqual(r, []);
  });

  it('ignores malformed directives (missing id)', () => {
    const r = parseChefSkipDirectives('[[unskip]] [[unskip slug:]]');
    assert.deepEqual(r, []);
  });

  it('ignores unknown directive kinds (e.g. [[unmerge]] from Phase 10b-aux)', () => {
    const r = parseChefSkipDirectives('[[unmerge ai_0042]] [[unskip ai_0099]]');
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'unskip');
    assert.equal(r[0].id, 'ai_0099');
  });

  it('is case-insensitive on directive kind', () => {
    const r = parseChefSkipDirectives(
      '[[UNSKIP ai_0042]] [[Confirm-Skip ai_0099]]',
    );
    assert.equal(r.length, 2);
    assert.equal(r[0].kind, 'unskip');
    assert.equal(r[1].kind, 'confirm-skip');
  });
});

// ---------------------------------------------------------------------------
// Resolver — uses real fs for meeting file scanning
// ---------------------------------------------------------------------------

describe('resolveChefSkipDirective — Step 6 resolver', () => {
  let workspaceRoot: string;
  let meetingsDir: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-chef-skip-resolve-'));
    meetingsDir = join(workspaceRoot, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  function writeMeeting(slug: string, stagedIds: Record<string, string>, mtimeOffsetMs = 0): string {
    const path = join(meetingsDir, `${slug}.md`);
    const statusYaml = Object.entries(stagedIds)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    const content = `---
title: "${slug}"
date: "2026-06-04"
staged_item_status:
${statusYaml}
---

Body.
`;
    writeFileSync(path, content, 'utf8');
    if (mtimeOffsetMs !== 0) {
      const t = new Date(Date.now() + mtimeOffsetMs);
      utimesSync(path, t, t);
    }
    return path;
  }

  it('resolves slug-qualified to exact meeting file', async () => {
    const path = writeMeeting('john-jamie-2026-06-04', { ai_0042: 'skipped' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: 'john-jamie-2026-06-04',
      raw: '[[unskip john-jamie-2026-06-04:ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'resolved');
    assert.equal(r.meetingPath, path);
  });

  it('invalid-slug when slug-qualified meeting does not exist', async () => {
    writeMeeting('john-jamie-2026-06-04', { ai_0042: 'skipped' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: 'does-not-exist',
      raw: '[[unskip does-not-exist:ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'invalid-slug');
    assert.equal(r.meetingPath, null);
  });

  it('invalid-slug when slug exists but the id is not in its staged_item_status', async () => {
    writeMeeting('john-jamie-2026-06-04', { ai_0001: 'pending' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: 'john-jamie-2026-06-04',
      raw: '[[unskip john-jamie-2026-06-04:ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'invalid-slug');
  });

  it('id-alone resolves cleanly when exactly one meeting has the id', async () => {
    const path = writeMeeting('john-jamie-2026-06-04', { ai_0042: 'skipped' });
    writeMeeting('glance-2-2026-06-04', { ai_0099: 'pending' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'resolved');
    assert.equal(r.meetingPath, path);
  });

  it('id-alone with 2+ matches returns ambiguous (NEVER silently picks)', async () => {
    writeMeeting('john-jamie-friday-am', { ai_0042: 'skipped' });
    writeMeeting('glance-2-friday', { ai_0042: 'pending' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'ambiguous');
    assert.equal(r.meetingPath, null);
    assert.equal(r.candidates.length, 2);
  });

  it('id-alone with 0 matches returns no-match', async () => {
    writeMeeting('john-jamie-2026-06-04', { ai_0001: 'pending' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'no-match');
  });

  it('id-alone meetings with no staged_item_status field do NOT match', async () => {
    // Meeting without the field at all (e.g. post-apply cleaned file).
    const path = join(meetingsDir, 'cleaned.md');
    writeFileSync(
      path,
      `---\ntitle: "cleaned"\ndate: "2026-06-04"\nstatus: approved\n---\n\nBody.\n`,
      'utf8',
    );
    writeMeeting('john-jamie-2026-06-04', { ai_0042: 'skipped' });
    const directive = {
      kind: 'unskip' as const,
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
    };
    const r = await resolveChefSkipDirective(storage, directive, { workspaceRoot });
    assert.equal(r.status, 'resolved');
    assert.equal(r.candidates.length, 1);
  });
});

describe('formatDirectiveStatusMessage — Step 6', () => {
  it('returns null for resolved status', () => {
    const msg = formatDirectiveStatusMessage({
      kind: 'unskip',
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
      status: 'resolved',
      meetingPath: '/foo/bar.md',
      candidates: ['/foo/bar.md'],
    });
    assert.equal(msg, null);
  });

  it('surfaces "ambiguous — please qualify" with candidate slugs', () => {
    const msg = formatDirectiveStatusMessage({
      kind: 'unskip',
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
      status: 'ambiguous',
      meetingPath: null,
      candidates: ['/r/m/john-jamie.md', '/r/m/glance-2.md'],
    });
    assert.ok(msg);
    assert.match(msg!, /ambiguous/);
    assert.match(msg!, /john-jamie/);
    assert.match(msg!, /glance-2/);
    assert.match(msg!, /please qualify/i);
  });

  it('surfaces "no match" for no-match status', () => {
    const msg = formatDirectiveStatusMessage({
      kind: 'unskip',
      id: 'ai_0042',
      slug: null,
      raw: '[[unskip ai_0042]]',
      status: 'no-match',
      meetingPath: null,
      candidates: [],
    });
    assert.ok(msg);
    assert.match(msg!, /no match/);
    assert.match(msg!, /may have already been processed/);
  });

  it('surfaces "invalid-slug" for invalid-slug status', () => {
    const msg = formatDirectiveStatusMessage({
      kind: 'unskip',
      id: 'ai_0042',
      slug: 'typo-meeting',
      raw: '[[unskip typo-meeting:ai_0042]]',
      status: 'invalid-slug',
      meetingPath: null,
      candidates: [],
    });
    assert.ok(msg);
    assert.match(msg!, /slug-qualified meeting was not found/);
  });
});
