/**
 * Tests for SummaryWriter service.
 *
 * Per services/LEARNINGS.md: no mocks for memory operations — use real
 * fs + FileStorageAdapter under tmpdir.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeMeetingSummary,
  writeMeetingSummaryFromFrontmatter,
  writeInboxSummary,
  readMeetingSummary,
  buildMeetingSummaryPrompt,
  parseMeetingSummaryResponse,
  parseInboxSummaryResponse,
  summaryAlreadyFresh,
  summaryPathForMeeting,
  summaryPathForInbox,
  hashSummarySource,
  SUMMARY_EXTRACTION_VERSION,
} from '../../src/services/summary-writer.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

let workspaceRoot: string;

beforeEach(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-summary-writer-test-'));
});

afterEach(() => {
  if (workspaceRoot && existsSync(workspaceRoot)) {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

const VALID_MEETING_RESPONSE = JSON.stringify({
  'What happened': 'Discussed Cover Whale pilot rollout.',
  'What was decided': '- Approve pilot launch with 3 adjusters',
  "What's next": '- John: schedule kickoff by Thursday',
  'Open questions': '',
  FYI: '- Next-step legal review pending',
  'Things mentioned but not actioned': '- Hallway mention of [[leap-templates]]',
});

const VALID_INBOX_RESPONSE = JSON.stringify({
  Summary: 'Anthropic announced new pricing tiers.',
  'Key points': '- Tier shift\n- Rate cap',
  "What's relevant": 'Affects [[claude-pilot]] cost ceiling.',
  Followups: '- Re-check pilot budget',
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('summary-writer pure helpers', () => {
  describe('parseMeetingSummaryResponse', () => {
    it('parses well-formed JSON', () => {
      const sections = parseMeetingSummaryResponse(VALID_MEETING_RESPONSE);
      assert.notEqual(sections, null);
      assert.equal(sections!['What happened'], 'Discussed Cover Whale pilot rollout.');
      assert.match(sections!['What was decided']!, /Approve pilot launch/);
    });

    it('strips markdown code fences', () => {
      const fenced = '```json\n' + VALID_MEETING_RESPONSE + '\n```';
      const sections = parseMeetingSummaryResponse(fenced);
      assert.notEqual(sections, null);
    });

    it('returns null for malformed JSON', () => {
      assert.equal(parseMeetingSummaryResponse('not json at all'), null);
    });

    it('returns null when no recognized sections present', () => {
      const onlyUnknown = JSON.stringify({ random_key: 'value' });
      assert.equal(parseMeetingSummaryResponse(onlyUnknown), null);
    });

    it('rejects sections containing raw frontmatter terminator', () => {
      const badSection = JSON.stringify({
        'What happened': 'foo\n---\nbar',
        'What was decided': 'good',
      });
      const sections = parseMeetingSummaryResponse(badSection);
      assert.notEqual(sections, null);
      assert.equal(
        Object.prototype.hasOwnProperty.call(sections!, 'What happened'),
        false,
      );
      assert.equal(sections!['What was decided'], 'good');
    });

    it('drops empty-string sections', () => {
      const sections = parseMeetingSummaryResponse(
        JSON.stringify({ 'What happened': 'real', 'What was decided': '   ' }),
      );
      assert.notEqual(sections, null);
      assert.equal(sections!['What happened'], 'real');
      assert.equal(
        Object.prototype.hasOwnProperty.call(sections!, 'What was decided'),
        false,
      );
    });
  });

  describe('parseInboxSummaryResponse', () => {
    it('parses inbox shape', () => {
      const sections = parseInboxSummaryResponse(VALID_INBOX_RESPONSE);
      assert.notEqual(sections, null);
      assert.equal(sections!.Summary, 'Anthropic announced new pricing tiers.');
    });
  });

  describe('hashSummarySource + summaryAlreadyFresh', () => {
    it('hashSummarySource is deterministic', () => {
      const a = hashSummarySource('hello world');
      const b = hashSummarySource('hello world');
      assert.equal(a, b);
      const c = hashSummarySource('hello worlds');
      assert.notEqual(a, c);
    });

    it('summaryAlreadyFresh returns false when no file exists', async () => {
      const storage = new FileStorageAdapter();
      const path = join(workspaceRoot, 'nonexistent.md');
      assert.equal(await summaryAlreadyFresh(storage, path, 'abc123'), false);
    });
  });

  describe('summaryPathForMeeting', () => {
    it('strips leading date prefix from filename', () => {
      const p = summaryPathForMeeting('/ws', {
        sourcePath: 'resources/meetings/2026-04-22-cover-whale-sync.md',
        date: '2026-04-22',
      });
      assert.match(p, /\.arete\/memory\/summaries\/meetings\/2026-04-22-cover-whale-sync\.md$/);
    });

    it('handles filename without date prefix', () => {
      const p = summaryPathForMeeting('/ws', {
        sourcePath: 'resources/meetings/freeform.md',
        date: '2026-04-22',
      });
      assert.match(p, /summaries\/meetings\/2026-04-22-freeform\.md$/);
    });
  });

  describe('summaryPathForInbox', () => {
    it('uses base filename without re-prefixing date', () => {
      const p = summaryPathForInbox('/ws', { sourcePath: 'inbox/2026-04-22-claude-tweet.md' });
      assert.match(p, /summaries\/inbox\/2026-04-22-claude-tweet\.md$/);
    });
  });

  describe('buildMeetingSummaryPrompt', () => {
    it('includes date, participants, area, topics', () => {
      const prompt = buildMeetingSummaryPrompt({
        sourcePath: 'resources/meetings/foo.md',
        date: '2026-04-22',
        sourceBody: 'transcript',
        area: 'glance-communications',
        topics: ['cover-whale-templates'],
        participants: ['Anthony', 'Carla'],
      });
      assert.match(prompt, /2026-04-22/);
      assert.match(prompt, /Anthony, Carla/);
      assert.match(prompt, /glance-communications/);
      assert.match(prompt, /cover-whale-templates/);
      assert.match(prompt, /transcript/);
    });

    it('handles missing optional metadata gracefully', () => {
      const prompt = buildMeetingSummaryPrompt({
        sourcePath: 'resources/meetings/foo.md',
        date: '2026-04-22',
        sourceBody: 'transcript',
      });
      assert.match(prompt, /participants not specified/);
      assert.match(prompt, /no topic tags yet/);
    });

    // Phase 1 wiki expansion: `## Could include` body-block was removed
    // from meeting source files; the same headlines now flow into the
    // summary writer's prompt context via `couldInclude` so the LLM can
    // surface them under the summary's `## FYI` section.
    it('includes side-thread headlines when couldInclude is provided', () => {
      const prompt = buildMeetingSummaryPrompt({
        sourcePath: 'resources/meetings/foo.md',
        date: '2026-04-22',
        sourceBody: 'transcript body',
        couldInclude: ['Risks: Sara flagged churn', 'Pricing: tier may shift'],
      });
      assert.match(prompt, /SIDE-THREAD HEADLINES/);
      assert.match(prompt, /Risks: Sara flagged churn/);
      assert.match(prompt, /Pricing: tier may shift/);
    });

    it('omits the side-thread block when couldInclude is empty', () => {
      const prompt = buildMeetingSummaryPrompt({
        sourcePath: 'resources/meetings/foo.md',
        date: '2026-04-22',
        sourceBody: 'transcript body',
        couldInclude: [],
      });
      assert.ok(!prompt.includes('SIDE-THREAD HEADLINES'));
    });

    it('omits the side-thread block when couldInclude is undefined', () => {
      const prompt = buildMeetingSummaryPrompt({
        sourcePath: 'resources/meetings/foo.md',
        date: '2026-04-22',
        sourceBody: 'transcript body',
      });
      assert.ok(!prompt.includes('SIDE-THREAD HEADLINES'));
    });
  });
});

// ---------------------------------------------------------------------------
// Writer (with real fs)
// ---------------------------------------------------------------------------

describe('writeMeetingSummary', () => {
  it('writes a summary file when LLM provided + valid response', async () => {
    const storage = new FileStorageAdapter();
    const calls: string[] = [];
    const callLLM = async (prompt: string) => {
      calls.push(prompt);
      return VALID_MEETING_RESPONSE;
    };

    const result = await writeMeetingSummary(
      {
        sourcePath: 'resources/meetings/2026-04-22-cover-whale.md',
        date: '2026-04-22',
        sourceBody: 'Anthony said the pilot looks good.',
        topics: ['cover-whale-templates'],
        participants: ['Anthony'],
      },
      { storage, workspaceRoot, callLLM },
    );

    assert.equal(result.written, true);
    assert.equal(result.warnings.length, 0);
    assert.equal(calls.length, 1);
    assert.ok(existsSync(result.summaryPath));

    const content = readFileSync(result.summaryPath, 'utf8');
    assert.match(content, /source_type: meeting/);
    assert.match(content, /content_hash:/);
    assert.match(content, /extraction_version:/);
    assert.match(content, /## What happened/);
    assert.match(content, /Cover Whale pilot rollout/);
  });

  it('skips writing when LLM is not provided', async () => {
    const storage = new FileStorageAdapter();
    const result = await writeMeetingSummary(
      {
        sourcePath: 'resources/meetings/2026-04-22-foo.md',
        date: '2026-04-22',
        sourceBody: 'body',
      },
      { storage, workspaceRoot },
    );
    assert.equal(result.written, false);
    assert.equal(result.reason, 'no-llm');
    assert.equal(existsSync(result.summaryPath), false);
  });

  it('skips writing when LLM returns malformed JSON', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => 'not json';
    const result = await writeMeetingSummary(
      {
        sourcePath: 'resources/meetings/2026-04-22-foo.md',
        date: '2026-04-22',
        sourceBody: 'body',
      },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(result.written, false);
    assert.equal(result.reason, 'malformed-llm-response');
    assert.equal(result.warnings.length > 0, true);
  });

  it('idempotent: skips when content hash matches existing summary', async () => {
    const storage = new FileStorageAdapter();
    let callCount = 0;
    const callLLM = async () => {
      callCount++;
      return VALID_MEETING_RESPONSE;
    };

    const input = {
      sourcePath: 'resources/meetings/2026-04-22-foo.md',
      date: '2026-04-22',
      sourceBody: 'same body',
    };

    const first = await writeMeetingSummary(input, { storage, workspaceRoot, callLLM });
    assert.equal(first.written, true);
    assert.equal(callCount, 1);

    const second = await writeMeetingSummary(input, { storage, workspaceRoot, callLLM });
    assert.equal(second.written, false);
    assert.equal(second.reason, 'already-fresh');
    assert.equal(callCount, 1, 'second call should not invoke LLM');
  });

  it('re-writes when source body changes', async () => {
    const storage = new FileStorageAdapter();
    let callCount = 0;
    const callLLM = async () => {
      callCount++;
      return VALID_MEETING_RESPONSE;
    };

    const baseInput = {
      sourcePath: 'resources/meetings/2026-04-22-foo.md',
      date: '2026-04-22',
    };

    const first = await writeMeetingSummary(
      { ...baseInput, sourceBody: 'first body' },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(first.written, true);

    const second = await writeMeetingSummary(
      { ...baseInput, sourceBody: 'second body' },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(second.written, true);
    assert.equal(callCount, 2);
  });

  it('returns LLM error path without throwing', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => {
      throw new Error('rate limited');
    };
    const result = await writeMeetingSummary(
      {
        sourcePath: 'resources/meetings/2026-04-22-foo.md',
        date: '2026-04-22',
        sourceBody: 'body',
      },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(result.written, false);
    assert.equal(result.reason, 'llm-error');
    assert.match(result.warnings[0], /rate limited/);
  });

  it('stamps SUMMARY_EXTRACTION_VERSION into frontmatter', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => VALID_MEETING_RESPONSE;
    const result = await writeMeetingSummary(
      {
        sourcePath: 'resources/meetings/2026-04-22-foo.md',
        date: '2026-04-22',
        sourceBody: 'body',
      },
      { storage, workspaceRoot, callLLM },
    );
    const content = readFileSync(result.summaryPath, 'utf8');
    assert.match(content, new RegExp(`extraction_version: ['"]?${SUMMARY_EXTRACTION_VERSION}['"]?`));
  });
});

describe('writeInboxSummary', () => {
  it('writes a summary at the inbox path', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => VALID_INBOX_RESPONSE;
    const result = await writeInboxSummary(
      {
        sourcePath: 'inbox/2026-04-22-claude-pricing.md',
        date: '2026-04-22',
        sourceBody: 'tweet content',
        title: 'Claude pricing tweet',
      },
      { storage, workspaceRoot, callLLM },
    );

    assert.equal(result.written, true);
    assert.match(result.summaryPath, /summaries\/inbox\//);
    const content = readFileSync(result.summaryPath, 'utf8');
    assert.match(content, /source_type: inbox/);
    assert.match(content, /## Summary/);
    assert.match(content, /Anthropic announced/);
  });
});

describe('readMeetingSummary', () => {
  it('returns null when summary does not exist', async () => {
    const storage = new FileStorageAdapter();
    const result = await readMeetingSummary(storage, workspaceRoot, {
      sourcePath: 'resources/meetings/2026-04-22-foo.md',
      date: '2026-04-22',
    });
    assert.equal(result, null);
  });

  it('returns parsed summary after a write', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => VALID_MEETING_RESPONSE;
    const input = {
      sourcePath: 'resources/meetings/2026-04-22-foo.md',
      date: '2026-04-22',
      sourceBody: 'body',
    };
    await writeMeetingSummary(input, { storage, workspaceRoot, callLLM });

    const summary = await readMeetingSummary(storage, workspaceRoot, input);
    assert.notEqual(summary, null);
    assert.equal(summary!.frontmatter.source_type, 'meeting');
    assert.match(summary!.sections['What happened']!, /Cover Whale/);
  });
});

// ---------------------------------------------------------------------------
// writeMeetingSummaryFromFrontmatter (wiki-repair W2 — shared derivation
// path for `meeting apply` step 9 + the `meeting approve` summary hook)
// ---------------------------------------------------------------------------

describe('writeMeetingSummaryFromFrontmatter', () => {
  it('derives metadata from frontmatter and writes the summary', async () => {
    const storage = new FileStorageAdapter();
    const prompts: string[] = [];
    const callLLM = async (prompt: string) => {
      prompts.push(prompt);
      return VALID_MEETING_RESPONSE;
    };

    const absPath = join(workspaceRoot, 'resources', 'meetings', '2026-06-09-cover-whale.md');
    const result = await writeMeetingSummaryFromFrontmatter(
      {
        absPath,
        frontmatter: {
          date: '2026-06-09T10:00:00.000Z',
          area: 'claims',
          importance: 'important',
          topics: ['cover-whale-templates', 7, 'email-templates'],
          attendees: [{ name: 'Anthony' }, 'Sara', { email: 'no-name@x.com' }],
        },
        body: 'Anthony said the pilot looks good.',
        couldInclude: ['Risks: Sara flagged churn assumption'],
      },
      { storage, workspaceRoot, callLLM },
    );

    assert.notEqual(result, null);
    assert.equal(result!.written, true);
    // Date derived from frontmatter (sliced to YYYY-MM-DD), filename slug kept.
    assert.equal(
      result!.summaryPath,
      join(workspaceRoot, '.arete', 'memory', 'summaries', 'meetings', '2026-06-09-cover-whale.md'),
    );

    const content = readFileSync(result!.summaryPath, 'utf8');
    assert.match(content, /source_type: meeting/);
    assert.match(content, /importance: important/);
    assert.match(content, /area: claims/);
    // Non-string topics filtered; attendees normalized from mixed shapes.
    assert.match(content, /cover-whale-templates/);
    assert.match(content, /Anthony/);

    // could_include headlines reach the LLM prompt as FYI candidates
    // (AC2b round-trip: stage → approve → summary FYI section).
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /SIDE-THREAD HEADLINES/);
    assert.match(prompts[0], /Risks: Sara flagged churn assumption/);
  });

  it('falls back to the filename date when frontmatter has none', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => VALID_MEETING_RESPONSE;
    const absPath = join(workspaceRoot, 'resources', 'meetings', '2026-06-08-standup.md');
    const result = await writeMeetingSummaryFromFrontmatter(
      { absPath, frontmatter: {}, body: 'notes' },
      { storage, workspaceRoot, callLLM },
    );
    assert.notEqual(result, null);
    assert.equal(result!.written, true);
    assert.match(result!.summaryPath, /2026-06-08-standup\.md$/);
  });

  it('returns null (no write, no throw) when no date is derivable', async () => {
    const storage = new FileStorageAdapter();
    let called = false;
    const callLLM = async () => {
      called = true;
      return VALID_MEETING_RESPONSE;
    };
    const result = await writeMeetingSummaryFromFrontmatter(
      {
        absPath: join(workspaceRoot, 'resources', 'meetings', 'undated-meeting.md'),
        frontmatter: { date: 42 },
        body: 'notes',
      },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(result, null);
    assert.equal(called, false);
  });

  it('resolves with written:false on LLM failure — never throws (pre-mortem R4)', async () => {
    const storage = new FileStorageAdapter();
    const callLLM = async () => {
      throw new Error('socket hang up');
    };
    const result = await writeMeetingSummaryFromFrontmatter(
      {
        absPath: join(workspaceRoot, 'resources', 'meetings', '2026-06-09-standup.md'),
        frontmatter: { date: '2026-06-09' },
        body: 'notes',
      },
      { storage, workspaceRoot, callLLM },
    );
    assert.notEqual(result, null);
    assert.equal(result!.written, false);
    assert.equal(result!.reason, 'llm-error');
    assert.equal(result!.warnings.length > 0, true);
  });

  it('omits the FYI prompt block when couldInclude is absent (R5 upgrade path)', async () => {
    const storage = new FileStorageAdapter();
    const prompts: string[] = [];
    const callLLM = async (prompt: string) => {
      prompts.push(prompt);
      return VALID_MEETING_RESPONSE;
    };
    const result = await writeMeetingSummaryFromFrontmatter(
      {
        absPath: join(workspaceRoot, 'resources', 'meetings', '2026-06-09-standup.md'),
        frontmatter: { date: '2026-06-09' },
        body: 'notes',
      },
      { storage, workspaceRoot, callLLM },
    );
    assert.equal(result!.written, true);
    assert.doesNotMatch(prompts[0], /SIDE-THREAD HEADLINES/);
  });
});
