/**
 * Tests for detectCrossPersonPatterns service.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectCrossPersonPatterns } from '../../src/services/patterns.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Mock StorageAdapter
// ---------------------------------------------------------------------------

type FileMap = Map<string, string>;

function createMockStorage(files: Record<string, string>): StorageAdapter {
  const fileMap: FileMap = new Map(Object.entries(files));

  return {
    async read(path: string): Promise<string | null> {
      return fileMap.get(path) ?? null;
    },
    async write(): Promise<void> {},
    async exists(path: string): Promise<boolean> {
      return fileMap.has(path);
    },
    async delete(): Promise<void> {},
    async list(dir: string, options?: { extensions?: string[] }): Promise<string[]> {
      const ext = options?.extensions?.[0] ?? '.md';
      return [...fileMap.keys()].filter(
        (k) => k.startsWith(dir) && k.endsWith(ext),
      );
    },
    async listSubdirectories(): Promise<string[]> {
      return [];
    },
    async mkdir(): Promise<void> {},
    async getModified(): Promise<Date | null> {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeMeeting(
  slug: string,
  date: string,
  attendees: string[],
  keyPoints: string[],
  opts: { attendeeIds?: boolean } = {},
): string {
  const attendeeYaml = opts.attendeeIds
    ? `attendee_ids:\n${attendees.map((a) => `  - ${a}`).join('\n')}`
    : `attendees:\n${attendees.map((a) => `  - name: ${a}\n    email: ""`).join('\n')}`;

  const keyPointsSection =
    keyPoints.length > 0
      ? `## Key Points\n${keyPoints.map((p) => `- ${p}`).join('\n')}`
      : '';

  return `---
title: Meeting ${slug}
date: ${date}
status: synced
${attendeeYaml}
---

${keyPointsSection}

## Summary
Meeting summary for ${slug}.
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectCrossPersonPatterns', () => {
  const meetingsDir = '/workspace/resources/meetings';

  describe('basic pattern detection', () => {
    it('returns empty array when no meetings', async () => {
      const storage = createMockStorage({});
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });
      assert.deepEqual(patterns, []);
    });

    it('returns empty array when meetings are outside the lookback window', async () => {
      const old = new Date();
      old.setDate(old.getDate() - 60);
      const dateStr = old.toISOString().slice(0, 10);

      const storage = createMockStorage({
        [`${meetingsDir}/old-meeting.md`]: makeMeeting(
          'old',
          dateStr,
          ['alice', 'bob'],
          ['Q1 planning discussion'],
          { attendeeIds: true },
        ),
      });

      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });
      assert.deepEqual(patterns, []);
    });

    it('returns empty when only one meeting has a topic', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      const dateStr = recentDate.toISOString().slice(0, 10);

      const storage = createMockStorage({
        [`${meetingsDir}/meeting1.md`]: makeMeeting(
          'meeting1',
          dateStr,
          ['alice', 'bob'],
          ['Q1 planning discussion'],
          { attendeeIds: true },
        ),
      });

      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });
      assert.deepEqual(patterns, []);
    });
  });

  describe('cross-person pattern grouping', () => {
    it('detects a pattern appearing in 2 meetings with 2 different attendees', async () => {
      const d1 = new Date();
      d1.setDate(d1.getDate() - 5);
      const d2 = new Date();
      d2.setDate(d2.getDate() - 10);

      const files: Record<string, string> = {
        [`${meetingsDir}/meeting1.md`]: makeMeeting(
          'meeting1',
          d1.toISOString().slice(0, 10),
          ['alice', 'bob'],
          ['Q1 planning discussion'],
          { attendeeIds: true },
        ),
        [`${meetingsDir}/meeting2.md`]: makeMeeting(
          'meeting2',
          d2.toISOString().slice(0, 10),
          ['carol', 'dave'],
          ['Q1 planning discussion'],
          { attendeeIds: true },
        ),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      assert.ok(patterns.length > 0, 'Expected at least one pattern');
      const pattern = patterns[0];
      assert.equal(pattern.mentions, 2);
      assert.ok(pattern.people.length >= 2, 'Expected 2+ people');
      assert.ok(pattern.meetings.includes('meeting1'), 'Expected meeting1');
      assert.ok(pattern.meetings.includes('meeting2'), 'Expected meeting2');
    });

    it('does NOT return a pattern with only 1 meeting', async () => {
      const d = new Date();
      d.setDate(d.getDate() - 5);

      const files: Record<string, string> = {
        [`${meetingsDir}/meeting1.md`]: makeMeeting(
          'meeting1',
          d.toISOString().slice(0, 10),
          ['alice', 'bob'],
          ['unique topic only once'],
          { attendeeIds: true },
        ),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      const found = patterns.find((p) =>
        p.topic.toLowerCase().includes('unique topic only once'),
      );
      assert.equal(found, undefined, 'Should not have returned a single-meeting topic');
    });

    it('does NOT return a pattern with only 1 unique person across meetings', async () => {
      const d1 = new Date();
      d1.setDate(d1.getDate() - 3);
      const d2 = new Date();
      d2.setDate(d2.getDate() - 7);

      // Same person (alice) in both meetings
      const files: Record<string, string> = {
        [`${meetingsDir}/meeting1.md`]: makeMeeting(
          'meeting1',
          d1.toISOString().slice(0, 10),
          ['alice'],
          ['single person topic'],
          { attendeeIds: true },
        ),
        [`${meetingsDir}/meeting2.md`]: makeMeeting(
          'meeting2',
          d2.toISOString().slice(0, 10),
          ['alice'],
          ['single person topic'],
          { attendeeIds: true },
        ),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      const found = patterns.find((p) =>
        p.topic.toLowerCase().includes('single person topic'),
      );
      assert.equal(found, undefined, 'Should not return a single-person pattern');
    });

    it('returns patterns sorted by mentions descending', async () => {
      const d1 = new Date(); d1.setDate(d1.getDate() - 3);
      const d2 = new Date(); d2.setDate(d2.getDate() - 6);
      const d3 = new Date(); d3.setDate(d3.getDate() - 9);

      // Topic "budget review" appears 3 times; topic "roadmap" appears 2 times
      const files: Record<string, string> = {
        [`${meetingsDir}/m1.md`]: makeMeeting('m1', d1.toISOString().slice(0, 10), ['alice', 'bob'], ['budget review', 'roadmap planning'], { attendeeIds: true }),
        [`${meetingsDir}/m2.md`]: makeMeeting('m2', d2.toISOString().slice(0, 10), ['carol', 'dave'], ['budget review', 'roadmap planning'], { attendeeIds: true }),
        [`${meetingsDir}/m3.md`]: makeMeeting('m3', d3.toISOString().slice(0, 10), ['alice', 'carol'], ['budget review'], { attendeeIds: true }),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      assert.ok(patterns.length >= 2, 'Expected at least 2 patterns');
      assert.ok(
        patterns[0].mentions >= patterns[1].mentions,
        'Patterns should be sorted by mentions descending',
      );
    });
  });

  describe('attendee parsing', () => {
    it('parses attendee_ids (slug list)', async () => {
      const d = new Date(); d.setDate(d.getDate() - 3);
      const d2 = new Date(); d2.setDate(d2.getDate() - 7);

      const files: Record<string, string> = {
        [`${meetingsDir}/m1.md`]: makeMeeting('m1', d.toISOString().slice(0, 10), ['sarah-chen', 'john-smith'], ['product roadmap review'], { attendeeIds: true }),
        [`${meetingsDir}/m2.md`]: makeMeeting('m2', d2.toISOString().slice(0, 10), ['alice-jones', 'bob-wang'], ['product roadmap review'], { attendeeIds: true }),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      const found = patterns.find((p) => p.topic.toLowerCase().includes('product roadmap review'));
      assert.ok(found, 'Expected to find the pattern');
      assert.ok(found.people.includes('sarah-chen') || found.people.includes('alice-jones'));
    });

    it('parses attendees as name objects and slugifies names', async () => {
      const d = new Date(); d.setDate(d.getDate() - 3);
      const d2 = new Date(); d2.setDate(d2.getDate() - 7);

      const makeNameMeeting = (slug: string, date: string, names: string[], points: string[]) => `---
title: Meeting ${slug}
date: ${date}
status: synced
attendees:
${names.map((n) => `  - name: ${n}\n    email: ""`).join('\n')}
---

## Key Points
${points.map((p) => `- ${p}`).join('\n')}
`;

      const files: Record<string, string> = {
        [`${meetingsDir}/m1.md`]: makeNameMeeting('m1', d.toISOString().slice(0, 10), ['Sarah Chen', 'Bob Smith'], ['customer onboarding issues']),
        [`${meetingsDir}/m2.md`]: makeNameMeeting('m2', d2.toISOString().slice(0, 10), ['Alice Jones', 'Carol White'], ['customer onboarding issues']),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      const found = patterns.find((p) => p.topic.toLowerCase().includes('customer onboarding'));
      assert.ok(found, 'Expected to detect the pattern');
      // Names should be slugified
      assert.ok(found.people.includes('sarah-chen') || found.people.includes('alice-jones'));
    });
  });

  describe('deduplication', () => {
    it('deduplicates topics from the same meeting', async () => {
      const d1 = new Date(); d1.setDate(d1.getDate() - 3);
      const d2 = new Date(); d2.setDate(d2.getDate() - 7);

      const files: Record<string, string> = {
        // Same topic repeated twice in same meeting
        [`${meetingsDir}/m1.md`]: `---
title: m1
date: ${d1.toISOString().slice(0, 10)}
status: synced
attendee_ids:
  - alice
  - bob
---
## Key Points
- dedup topic check
- Dedup Topic Check
`,
        [`${meetingsDir}/m2.md`]: makeMeeting('m2', d2.toISOString().slice(0, 10), ['carol', 'dave'], ['dedup topic check'], { attendeeIds: true }),
      };

      const storage = createMockStorage(files);
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, { days: 30 });

      const matching = patterns.filter((p) =>
        p.topic.toLowerCase().includes('dedup topic check'),
      );
      // Should only have 1 entry (not 2 from the duplicate in meeting1)
      assert.ok(matching.length <= 1, 'Duplicate topics within a meeting should be deduped');
      if (matching.length > 0) {
        assert.equal(matching[0].meetings.length, 2, 'Should span 2 meetings');
      }
    });
  });
});
