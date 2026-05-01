/**
 * Tests for `discoverTopicSources` and the slack-digest source class
 * (Task 2 of slack-digest-topic-wiki).
 *
 * Covers:
 *  - Discovery returns both meeting + slack-digest entries from a fixture
 *    workspace, sorted by date.
 *  - Tolerates missing `notes/` (and missing `meetings/`) without throwing.
 *  - `parseMeetingFile` parses a real-shape slack-digest fixture without
 *    error (regression guard against future parser changes that re-introduce
 *    strict attendee/title validation).
 *  - `hashMeetingSource` is byte-stable across frontmatter-only edits on a
 *    slack-digest fixture (idempotency invariant for slack digests; pre-mortem
 *    Risk 7).
 *  - Filename-pattern filter is the source-of-truth: a non-matching file in
 *    `notes/` is skipped without crashing, and a matching file with
 *    `type: <other>` in frontmatter is warned and skipped.
 *
 * Test workspace lives under `os.tmpdir()` and is torn down after each test.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  discoverTopicSources,
  hashMeetingSource,
  SLACK_DIGEST_FILENAME_RE,
  type SourceDiscoveryEntry,
} from '../../src/services/topic-memory.js';
import { parseMeetingFile } from '../../src/services/meeting-context.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

// Representative slack-digest fixture — shape matches what
// `packages/runtime/skills/slack-digest/SKILL.md` Phase 5a writes,
// plus the `topics:` field this plan adds.
const SLACK_DIGEST_FIXTURE_BODY = `# Slack Digest — 2026-04-28

## Conversations

### 1. DM with Person A
2-3 sentence summary of the thread that resolved the cover-whale-templates
question. Person A confirmed the template scope and shipped the rollout
plan today.
- Topics: cover-whale-templates

### 2. Channel #leap thread
2-3 sentence summary of the thread that closed the leap-templates pilot.
- Topics: leap-templates

## Reconciliation Summary

### Commitments Resolved
- ea594040: Person A import workflow -> resolved

### Decisions & Learnings Saved
- Decision: Ship cover-whale-templates v2 by EOM -> decisions.md
`;

const SLACK_DIGEST_FIXTURE = `---
title: "Slack Digest — 2026-04-28"
date: 2026-04-28
type: slack-digest
conversations: 2
participants: [person-a]
items_extracted: 4
items_approved: 4
tasks_updated: 1
commitments_resolved: 1
commitments_added: 0
areas: [reserv]
topics: [cover-whale-templates, leap-templates]
---

${SLACK_DIGEST_FIXTURE_BODY}`;

const MEETING_FIXTURE = `---
title: "Cover Whale sync"
date: 2026-04-20
attendees:
  - { name: "Jane Doe", email: "jane@reserv.com" }
topics: [cover-whale-templates]
---

# Cover Whale sync

## Transcript

Jane and the user discussed the cover-whale-templates rollout. Decided
to ship v2 by EOM.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SLACK_DIGEST_FILENAME_RE', () => {
  it('matches canonical YYYY-MM-DD-slack-digest.md', () => {
    assert.strictEqual(SLACK_DIGEST_FILENAME_RE.test('2026-04-28-slack-digest.md'), true);
  });

  it('rejects other notes', () => {
    assert.strictEqual(SLACK_DIGEST_FILENAME_RE.test('2026-04-28-meeting-notes.md'), false);
    assert.strictEqual(SLACK_DIGEST_FILENAME_RE.test('manual-note.md'), false);
    assert.strictEqual(SLACK_DIGEST_FILENAME_RE.test('slack-digest.md'), false); // missing date
    assert.strictEqual(SLACK_DIGEST_FILENAME_RE.test('2026-4-28-slack-digest.md'), false); // single-digit
  });
});

describe('parseMeetingFile against slack-digest fixture', () => {
  it('parses topics, date, body without error', () => {
    const parsed = parseMeetingFile(SLACK_DIGEST_FIXTURE);
    assert.notStrictEqual(parsed, null, 'parseMeetingFile returned null on slack-digest fixture');
    assert.deepStrictEqual(parsed!.frontmatter.topics, ['cover-whale-templates', 'leap-templates']);
    assert.strictEqual(parsed!.frontmatter.date, '2026-04-28');
    // Body present and non-empty (the parser strips frontmatter).
    assert.match(parsed!.body, /Slack Digest/);
    // attendees defaults to [] when missing — slack-digests have no attendees.
    assert.deepStrictEqual(parsed!.frontmatter.attendees, []);
  });
});

describe('hashMeetingSource on slack-digest fixture', () => {
  it('is byte-identical across frontmatter-only edits', () => {
    const before = SLACK_DIGEST_FIXTURE;
    // Add a sibling-plan dedup field — pre-mortem Risk 7.
    const after = before.replace(
      /^topics: \[([^\]]+)\]/m,
      (m) => `${m}\ndedup_processed_at: 2026-04-28T18:00:00Z`,
    );
    assert.notStrictEqual(after, before, 'fixture mutation failed');
    assert.strictEqual(
      hashMeetingSource(before),
      hashMeetingSource(after),
      'frontmatter edit must not bust the body hash',
    );
  });

  it('changes when body changes', () => {
    const before = SLACK_DIGEST_FIXTURE;
    const after = SLACK_DIGEST_FIXTURE.replace('shipped the rollout', 'paused the rollout');
    assert.notStrictEqual(
      hashMeetingSource(before),
      hashMeetingSource(after),
      'body edits must change the hash (re-integration is correct here)',
    );
  });
});

describe('discoverTopicSources', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'discover-topic-sources-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns entries from both meetings/ and notes/, sorted by date', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-04-20-cw-sync.md', MEETING_FIXTURE);
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', SLACK_DIGEST_FIXTURE);

    const entries = await discoverTopicSources(paths, storage);

    assert.strictEqual(entries.length, 2);
    // Sorted by date asc → meeting (4-20) first, slack-digest (4-28) second.
    assert.strictEqual(entries[0].type, 'meeting');
    assert.strictEqual(entries[0].date, '2026-04-20');
    assert.deepStrictEqual(entries[0].topics, ['cover-whale-templates']);
    assert.strictEqual(entries[1].type, 'slack-digest');
    assert.strictEqual(entries[1].date, '2026-04-28');
    assert.deepStrictEqual(entries[1].topics, ['cover-whale-templates', 'leap-templates']);
    // Content read once and surfaced.
    assert.ok(entries[0].content.length > 0);
    assert.ok(entries[1].content.includes('Slack Digest'));
  });

  it('tolerates missing notes/ dir', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-04-20-cw-sync.md', MEETING_FIXTURE);
    // No notes/ dir created at all.

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].type, 'meeting');
  });

  it('tolerates missing meetings/ dir', async () => {
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', SLACK_DIGEST_FIXTURE);
    // No meetings/ dir.

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].type, 'slack-digest');
  });

  it('returns [] when both dirs are missing', async () => {
    const entries = await discoverTopicSources(paths, storage);
    assert.deepStrictEqual(entries, []);
  });

  it('skips non-slack-digest files in notes/ (filename filter)', async () => {
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', SLACK_DIGEST_FIXTURE);
    // capture-conversation output, manual notes — should NOT be picked up.
    writeFile(tmpDir, 'resources/notes/2026-04-28-meeting-prep.md', MEETING_FIXTURE);
    writeFile(tmpDir, 'resources/notes/random-note.md', '---\ntitle: x\n---\nfoo');

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 1);
    assert.match(entries[0].path, /2026-04-28-slack-digest\.md$/);
  });

  it('breaks date ties by path ascending', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-04-20-a-sync.md', MEETING_FIXTURE);
    writeFile(
      tmpDir,
      'resources/meetings/2026-04-20-b-sync.md',
      MEETING_FIXTURE.replace('Cover Whale sync', 'Other sync'),
    );

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 2);
    assert.ok(entries[0].path < entries[1].path);
  });

  it('warns and skips notes/ files whose frontmatter type is not slack-digest', async () => {
    // Filename matches the slack-digest pattern but frontmatter declares
    // a different type — sanity check.
    const wrongTypeDigest = SLACK_DIGEST_FIXTURE.replace(
      'type: slack-digest',
      'type: meeting',
    );
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', wrongTypeDigest);

    // Capture warnings emitted by discoverTopicSources.
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => { warnings.push(String(msg)); };
    try {
      const entries = await discoverTopicSources(paths, storage);
      assert.strictEqual(entries.length, 0, 'mismatched-type file should be skipped');
      assert.ok(
        warnings.some((w) => /slack-digest pattern but frontmatter type/.test(w)),
        `expected sanity-check warning; got: ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it('tolerates a slack-digest with no frontmatter type field (legacy)', async () => {
    // Older digests pre-date the `type: slack-digest` convention; the
    // filename pattern is still authoritative.
    const noTypeDigest = SLACK_DIGEST_FIXTURE.replace(/^type: slack-digest\n/m, '');
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', noTypeDigest);

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].type, 'slack-digest');
  });

  it('exposes topics: [] for files with no frontmatter topics field', async () => {
    const noTopicsDigest = SLACK_DIGEST_FIXTURE.replace(
      /^topics: \[[^\]]+\]\n/m,
      '',
    );
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', noTopicsDigest);

    const entries = await discoverTopicSources(paths, storage);
    assert.strictEqual(entries.length, 1);
    assert.deepStrictEqual(entries[0].topics, []);
  });

  it('shape: every entry conforms to SourceDiscoveryEntry', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-04-20-cw-sync.md', MEETING_FIXTURE);
    writeFile(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', SLACK_DIGEST_FIXTURE);

    const entries = await discoverTopicSources(paths, storage);
    for (const e of entries) {
      const checked: SourceDiscoveryEntry = e; // type-checks at compile + runtime
      assert.ok(typeof checked.path === 'string' && checked.path.length > 0);
      assert.match(checked.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(typeof checked.content === 'string' && checked.content.length > 0);
      assert.ok(checked.type === 'meeting' || checked.type === 'slack-digest');
      assert.ok(Array.isArray(checked.topics));
    }
  });
});
