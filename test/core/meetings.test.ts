/**
 * Tests for src/core/meetings.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  meetingFilename,
  saveMeetingFile,
  updateMeetingsIndex,
  saveMeeting,
} from '../../src/core/meetings.js';
import type { MeetingForSave } from '../../src/core/meetings.js';

const minimalMeeting: MeetingForSave = {
  title: 'Product Review',
  date: '2026-02-05',
  duration_minutes: 30,
  summary: 'Summary here.',
  transcript: 'Transcript here.',
  action_items: [],
  highlights: [],
  url: '',
};

describe('meetingFilename', () => {
  it('produces date-title-slug.md', () => {
    assert.equal(meetingFilename(minimalMeeting), '2026-02-05-product-review.md');
  });

  it('handles ISO date strings', () => {
    assert.equal(
      meetingFilename({ ...minimalMeeting, date: '2026-02-05T14:00:00Z' }),
      '2026-02-05-product-review.md'
    );
  });
});

describe('saveMeetingFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meetings-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes meeting markdown file', () => {
    const path = saveMeetingFile(minimalMeeting, tmpDir, null, {
      integration: 'Manual',
    });
    assert.ok(path);
    assert.ok(existsSync(path!));
    const content = readFileSync(path!, 'utf8');
    assert.ok(content.includes('Product Review'));
    assert.ok(content.includes('Summary here.'));
    assert.ok(content.includes('Manual'));
  });

  it('outputs YAML frontmatter with title, date, source, attendees, attendee_ids, company, pillar', () => {
    const meeting: MeetingForSave = {
      ...minimalMeeting,
      attendees: [{ name: 'Jane Doe', email: 'jane@acme.com' }],
      attendee_ids: ['jane-doe'],
      company: 'Acme',
      pillar: 'Growth',
    };
    const path = saveMeetingFile(meeting, tmpDir, null, {
      integration: 'Fathom',
    });
    assert.ok(path);
    const content = readFileSync(path!, 'utf8');
    assert.ok(content.startsWith('---'), 'starts with frontmatter');
    assert.ok(content.includes('title: "Product Review"'));
    assert.ok(content.includes('date: "2026-02-05"'));
    assert.ok(content.includes('source: "Fathom"'));
    assert.ok(content.includes('attendees: "Jane Doe"'));
    assert.ok(content.includes('attendee_ids: ["jane-doe"]'));
    assert.ok(content.includes('company: "Acme"'));
    assert.ok(content.includes('pillar: "Growth"'));
    assert.ok(content.includes('---\n\n'), 'frontmatter ends before body');
  });

  it('returns null when file exists and force is false', () => {
    saveMeetingFile(minimalMeeting, tmpDir, null);
    const path2 = saveMeetingFile(minimalMeeting, tmpDir, null, { force: false });
    assert.equal(path2, null);
  });

  it('overwrites when force is true', () => {
    saveMeetingFile(minimalMeeting, tmpDir, null);
    const path2 = saveMeetingFile(
      { ...minimalMeeting, summary: 'Updated summary.' },
      tmpDir,
      null,
      { force: true }
    );
    assert.ok(path2);
    const content = readFileSync(path2!, 'utf8');
    assert.ok(content.includes('Updated summary.'));
  });
});

describe('updateMeetingsIndex', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meetings-index-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates index when missing', () => {
    updateMeetingsIndex(tmpDir, {
      filename: '2026-02-05-product-review.md',
      title: 'Product Review',
      date: '2026-02-05',
    });
    const indexPath = join(tmpDir, 'index.md');
    assert.ok(existsSync(indexPath));
    const content = readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('## Recent Meetings'));
    assert.ok(content.includes('[Product Review](2026-02-05-product-review.md)'));
  });

  it('adds entry to existing index with None yet', () => {
    writeFileSync(
      join(tmpDir, 'index.md'),
      `# Meetings Index

## Recent Meetings

None yet.
`,
      'utf8'
    );
    updateMeetingsIndex(tmpDir, {
      filename: '2026-02-05-standup.md',
      title: 'Standup',
      date: '2026-02-05',
    });
    const content = readFileSync(join(tmpDir, 'index.md'), 'utf8');
    assert.ok(content.includes('[Standup](2026-02-05-standup.md)'));
    assert.ok(!content.includes('None yet'));
  });

  it('dedupes by filename and keeps newest first', () => {
    writeFileSync(
      join(tmpDir, 'index.md'),
      `# Meetings Index

## Recent Meetings

- [Standup](2026-02-05-standup.md) – 2026-02-05
- [Review](2026-02-04-review.md) – 2026-02-04
`,
      'utf8'
    );
    updateMeetingsIndex(tmpDir, {
      filename: '2026-02-05-standup.md',
      title: 'Standup Updated',
      date: '2026-02-05',
    });
    const content = readFileSync(join(tmpDir, 'index.md'), 'utf8');
    assert.ok(content.includes('Standup Updated'));
    const entries = content.match(/^- \[.+\]\(.+\)/gm);
    assert.equal(entries?.length, 2);
  });
});

describe('saveMeeting', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meetings-save-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves file and updates index', () => {
    const result = saveMeeting(minimalMeeting, tmpDir, null);
    assert.ok(result.saved);
    assert.ok(result.path);
    assert.ok(existsSync(result.path!));
    const indexPath = join(tmpDir, 'index.md');
    assert.ok(existsSync(indexPath));
    const indexContent = readFileSync(indexPath, 'utf8');
    assert.ok(indexContent.includes('Product Review'));
  });

  it('returns saved false when file exists', () => {
    saveMeeting(minimalMeeting, tmpDir, null);
    const result = saveMeeting(minimalMeeting, tmpDir, null);
    assert.equal(result.saved, false);
    assert.equal(result.path, null);
  });
});
