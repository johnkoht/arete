/**
 * Unified meeting-frontmatter writer tests (Phase 3.5 followup-5 AC1).
 *
 * Asserts:
 *   - Idempotency: calling twice with the same intelligence produces the
 *     same frontmatter (R3 mitigation).
 *   - Field presence: all 7 canonical fields (status, processed_at,
 *     topics, open_action_items, my_commitments, their_commitments,
 *     decisions_count, learnings_count) are written every call.
 *   - Topics fallback: when topicMemory deps are missing, proposed
 *     slugs are written verbatim (no alias coerce).
 *   - skipTopicAlias: bypasses the alias pass even when deps are
 *     present.
 *   - onWarning: receives a single string when alias/merge throws,
 *     and proposed slugs are written verbatim as fallback.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeMeetingApplyFrontmatter,
  type MeetingApplyAliasDeps,
} from '../../src/services/meeting-frontmatter.js';
import type { MeetingIntelligence } from '../../src/services/meeting-extraction.js';

function fixtureIntelligence(): MeetingIntelligence {
  return {
    summary: 'Test summary',
    actionItems: [
      { owner: 'John', ownerSlug: 'john-koht', description: 'Send doc', direction: 'i_owe_them' },
      { owner: 'John', ownerSlug: 'john-koht', description: 'Review PR', direction: 'i_owe_them' },
      { owner: 'Jane', ownerSlug: 'jane', description: 'Reply', direction: 'they_owe_me' },
    ],
    nextSteps: [],
    decisions: ['Adopt Sonnet', 'Defer migration'],
    learnings: ['Customers care about latency'],
    topics: ['default-email-template', 'rollout-strategy'],
  };
}

describe('writeMeetingApplyFrontmatter (Phase 3.5 followup-5 AC1)', () => {
  it('writes all 7 canonical fields with no alias deps', async () => {
    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      fixtureIntelligence(),
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    assert.equal(fm.status, 'processed');
    assert.equal(fm.processed_at, '2026-05-27T22:00:00.000Z');
    assert.deepStrictEqual(fm.topics, ['default-email-template', 'rollout-strategy']);
    assert.equal(fm.open_action_items, 3);
    assert.equal(fm.my_commitments, 2);
    assert.equal(fm.their_commitments, 1);
    assert.equal(fm.decisions_count, 2);
    assert.equal(fm.learnings_count, 1);
  });

  it('is idempotent — calling twice produces identical frontmatter', async () => {
    const fm1: Record<string, unknown> = {};
    const fm2: Record<string, unknown> = {};
    const intel = fixtureIntelligence();
    const status = { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' };
    await writeMeetingApplyFrontmatter(fm1, intel, status);
    await writeMeetingApplyFrontmatter(fm2, intel, status);
    assert.deepStrictEqual(fm1, fm2);

    // Re-run on already-written fm — same output (key idempotency assertion).
    await writeMeetingApplyFrontmatter(fm1, intel, status);
    assert.deepStrictEqual(fm1, fm2);
  });

  it('preserves existing fm fields that are not in the canonical set', async () => {
    const fm: Record<string, unknown> = {
      title: 'Existing title',
      attendees: ['john-koht', 'jane'],
      importance: 'normal',
    };
    await writeMeetingApplyFrontmatter(
      fm,
      fixtureIntelligence(),
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    assert.equal(fm.title, 'Existing title');
    assert.deepStrictEqual(fm.attendees, ['john-koht', 'jane']);
    assert.equal(fm.importance, 'normal');
    // Canonical fields also written
    assert.equal(fm.status, 'processed');
    assert.deepStrictEqual(fm.topics, ['default-email-template', 'rollout-strategy']);
  });

  it('writes empty topics when intelligence.topics is undefined', async () => {
    const intel = fixtureIntelligence();
    delete intel.topics;
    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      intel,
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    assert.deepStrictEqual(fm.topics, []);
  });

  it('writes zero counts for empty intelligence', async () => {
    const intel: MeetingIntelligence = {
      summary: '',
      actionItems: [],
      nextSteps: [],
      decisions: [],
      learnings: [],
      topics: [],
    };
    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      intel,
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    assert.equal(fm.open_action_items, 0);
    assert.equal(fm.my_commitments, 0);
    assert.equal(fm.their_commitments, 0);
    assert.equal(fm.decisions_count, 0);
    assert.equal(fm.learnings_count, 0);
    assert.deepStrictEqual(fm.topics, []);
  });

  it('skipTopicAlias bypasses alias coerce even when deps appear set', async () => {
    // We pass topicMemory as a sentinel object — it should NOT be invoked
    // because skipTopicAlias is true. Test passes by virtue of no error
    // (real topicMemory.listAll would have side effects).
    let invoked = false;
    const fakeTM = {
      listAll: async () => {
        invoked = true;
        return { topics: [] };
      },
      aliasAndMerge: async () => {
        invoked = true;
        return [];
      },
    } as unknown as MeetingApplyAliasDeps['topicMemory'];
    const fakePaths = {} as unknown as MeetingApplyAliasDeps['workspacePaths'];

    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      fixtureIntelligence(),
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
      { topicMemory: fakeTM, workspacePaths: fakePaths, skipTopicAlias: true },
    );
    assert.equal(invoked, false, 'topicMemory should not be touched when skipTopicAlias is true');
    assert.deepStrictEqual(fm.topics, ['default-email-template', 'rollout-strategy']);
  });

  it('onWarning receives non-fatal alias/merge failures and falls back to proposed topics', async () => {
    const fakeTM = {
      listAll: async () => {
        throw new Error('boom — alias deps unavailable');
      },
      aliasAndMerge: async () => {
        throw new Error('not reached');
      },
    } as unknown as MeetingApplyAliasDeps['topicMemory'];
    const fakePaths = {} as unknown as MeetingApplyAliasDeps['workspacePaths'];

    const warnings: string[] = [];
    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      fixtureIntelligence(),
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
      {
        topicMemory: fakeTM,
        workspacePaths: fakePaths,
        onWarning: (msg) => warnings.push(msg),
      },
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /topic alias\/merge failed/);
    // Fallback: proposed slugs written verbatim.
    assert.deepStrictEqual(fm.topics, ['default-email-template', 'rollout-strategy']);
  });

  it('alias/merge happy path coerces topics via topicMemory', async () => {
    // Build a fake TopicMemoryService.aliasAndMerge that maps
    // `default-email-template` → `email-templates`.
    const fakeTM = {
      listAll: async () => ({ topics: [] }),
      aliasAndMerge: async (proposed: string[]) => {
        return proposed.map((p) => ({
          proposed: p,
          resolved: p === 'default-email-template' ? 'email-templates' : p,
        }));
      },
    } as unknown as MeetingApplyAliasDeps['topicMemory'];
    const fakePaths = {} as unknown as MeetingApplyAliasDeps['workspacePaths'];

    const fm: Record<string, unknown> = {};
    await writeMeetingApplyFrontmatter(
      fm,
      fixtureIntelligence(),
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
      { topicMemory: fakeTM, workspacePaths: fakePaths },
    );
    assert.deepStrictEqual(fm.topics, ['email-templates', 'rollout-strategy']);
  });

  it('status field reflects the passed status arg (approved vs processed)', async () => {
    const fmA: Record<string, unknown> = {};
    const fmB: Record<string, unknown> = {};
    const intel = fixtureIntelligence();
    await writeMeetingApplyFrontmatter(
      fmA,
      intel,
      { status: 'approved', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    await writeMeetingApplyFrontmatter(
      fmB,
      intel,
      { status: 'processed', processedAt: '2026-05-27T22:00:00.000Z' },
    );
    assert.equal(fmA.status, 'approved');
    assert.equal(fmB.status, 'processed');
  });

  // wiki-repair W2 / D1 — could_include persistence.
  describe('could_include persistence (wiki-repair W2/D1)', () => {
    const STATUS = { status: 'processed', processedAt: '2026-06-09T10:00:00.000Z' };

    it('persists could_include when intelligence carries headlines', async () => {
      const intel = {
        ...fixtureIntelligence(),
        could_include: ['Risks: Sara flagged churn', 'Hiring: two offers out'],
      };
      const fm: Record<string, unknown> = {};
      await writeMeetingApplyFrontmatter(fm, intel, STATUS);
      assert.deepStrictEqual(fm['could_include'], [
        'Risks: Sara flagged churn',
        'Hiring: two offers out',
      ]);
    });

    it('does not add the key when intelligence has no headlines (no fossil)', async () => {
      const fm: Record<string, unknown> = {};
      await writeMeetingApplyFrontmatter(fm, fixtureIntelligence(), STATUS);
      // Set-or-DELETE contract: key must be fully absent, never set to
      // undefined (gray-matter/js-yaml throws on undefined values —
      // backend write path).
      assert.equal('could_include' in fm, false);
    });

    it('deletes a stale could_include key on re-run with no headlines', async () => {
      const fm: Record<string, unknown> = { could_include: ['stale headline'] };
      await writeMeetingApplyFrontmatter(fm, fixtureIntelligence(), STATUS);
      assert.equal('could_include' in fm, false);
    });

    it('treats an empty could_include array as absent', async () => {
      const fm: Record<string, unknown> = { could_include: ['stale'] };
      const intel = { ...fixtureIntelligence(), could_include: [] };
      await writeMeetingApplyFrontmatter(fm, intel, STATUS);
      assert.equal('could_include' in fm, false);
    });
  });
});
