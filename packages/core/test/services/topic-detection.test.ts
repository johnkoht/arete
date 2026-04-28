import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectTopicsLexical,
  STOP_TOKENS,
} from '../../src/services/topic-detection.js';
import type { TopicIdentity } from '../../src/services/topic-memory.js';

describe('detectTopicsLexical', () => {
  it('AC K1: returns the slug when ≥2 non-stop tokens hit and coverage ≥ 0.5', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'cover-whale-templates', aliases: [] },
    ];
    const transcript =
      'We talked about cover whale templates and how the new ones look great.';
    assert.deepStrictEqual(
      detectTopicsLexical(transcript, identities),
      ['cover-whale-templates'],
    );
  });

  it('AC K2: rejects single non-stop hit (cover alone, no whale/templates)', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'cover-whale-templates', aliases: [] },
    ];
    // "cover" appears, but neither "whale" nor "templates" — only 1 non-stop hit.
    const transcript = 'We need to cover the basics again before next week.';
    assert.deepStrictEqual(detectTopicsLexical(transcript, identities), []);
  });

  it('AC K3: stop-token-only slug (weekly-sync) does NOT match a generic-status transcript', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'weekly-sync', aliases: [] },
    ];
    // Both "weekly" and "sync" are stop tokens. Should never score regardless
    // of how many times they appear.
    const transcript =
      'Weekly status sync. Weekly status sync update. The weekly sync was useful.';
    assert.deepStrictEqual(detectTopicsLexical(transcript, identities), []);
  });

  it('AC K4: coincidence rejection — q2-planning does NOT match a transcript that only says "planning"', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'q2-planning', aliases: [] },
    ];
    // "planning" is a stop token, so q2-planning has only one non-stop slug
    // token ("q2"). Even with planning everywhere, the ≥2 non-stop hit rule
    // can never be reached.
    const transcript = 'Planning is hard. Planning, planning, planning.';
    assert.deepStrictEqual(detectTopicsLexical(transcript, identities), []);
  });

  it('AC K5: recency tiebreaker — newer lastRefreshed comes first on equal scores', () => {
    // Two distinct topics with equal score (both: 2/2 non-stop hits, coverage 1.0).
    // Order must be by lastRefreshed desc.
    const identities: TopicIdentity[] = [
      {
        canonical: 'alpha-beta',
        aliases: [],
        lastRefreshed: '2026-01-01',
      },
      {
        canonical: 'gamma-delta',
        aliases: [],
        lastRefreshed: '2026-04-01',
      },
    ];
    const transcript = 'We discussed alpha, beta, gamma, and delta today.';
    const result = detectTopicsLexical(transcript, identities);
    assert.deepStrictEqual(result, ['gamma-delta', 'alpha-beta']);
  });

  it('AC K5 (variant): missing lastRefreshed sorts after a present one on equal scores', () => {
    const identities: TopicIdentity[] = [
      // Note: insertion order intentionally inverted to verify the sort
      // doesn't just reflect input order.
      { canonical: 'alpha-beta', aliases: [], lastRefreshed: undefined },
      { canonical: 'gamma-delta', aliases: [], lastRefreshed: '2026-04-01' },
    ];
    const transcript = 'alpha beta gamma delta were the key topics today.';
    const result = detectTopicsLexical(transcript, identities);
    // The dated identity must come first; the undated one falls to canonical-asc.
    assert.deepStrictEqual(result, ['gamma-delta', 'alpha-beta']);
  });

  it('AC I (final fallback): canonical-asc when score AND lastRefreshed both tie', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'gamma-delta', aliases: [], lastRefreshed: '2026-04-01' },
      { canonical: 'alpha-beta', aliases: [], lastRefreshed: '2026-04-01' },
    ];
    const transcript = 'We discussed alpha, beta, gamma, and delta today.';
    const result = detectTopicsLexical(transcript, identities);
    assert.deepStrictEqual(result, ['alpha-beta', 'gamma-delta']);
  });

  it('AC K6: default cap of 3 — returns 3 when 5 identities match', () => {
    const transcript =
      'We covered alpha beta, gamma delta, epsilon zeta, eta theta, and iota kappa today.';
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta', aliases: [] },
      { canonical: 'gamma-delta', aliases: [] },
      { canonical: 'epsilon-zeta', aliases: [] },
      { canonical: 'eta-theta', aliases: [] },
      { canonical: 'iota-kappa', aliases: [] },
    ];
    const result = detectTopicsLexical(transcript, identities);
    assert.strictEqual(result.length, 3);
  });

  it('AC K7: custom maxResults — returns 5 when maxResults is 5', () => {
    const transcript =
      'We covered alpha beta, gamma delta, epsilon zeta, eta theta, and iota kappa today.';
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta', aliases: [] },
      { canonical: 'gamma-delta', aliases: [] },
      { canonical: 'epsilon-zeta', aliases: [] },
      { canonical: 'eta-theta', aliases: [] },
      { canonical: 'iota-kappa', aliases: [] },
    ];
    const result = detectTopicsLexical(transcript, identities, { maxResults: 5 });
    assert.strictEqual(result.length, 5);
    // All five should be present.
    assert.deepStrictEqual([...result].sort(), [
      'alpha-beta',
      'epsilon-zeta',
      'eta-theta',
      'gamma-delta',
      'iota-kappa',
    ]);
  });

  it('AC K8: alias match returns the canonical slug (not the alias)', () => {
    const identities: TopicIdentity[] = [
      {
        canonical: 'cover-whale-templates',
        aliases: ['cw-templates'],
      },
    ];
    // Transcript matches the alias only.
    const transcript = 'We talked about cw templates today.';
    assert.deepStrictEqual(
      detectTopicsLexical(transcript, identities),
      ['cover-whale-templates'],
    );
  });

  it('AC K9a: coverage 0.5 passes — 4 non-stop tokens, transcript hits 2', () => {
    // Slug "alpha-beta-gamma-delta" → 4 non-stop multi-char tokens.
    // Transcript hits 2 of 4 → coverage 0.5, passes.
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta-gamma-delta', aliases: [] },
    ];
    const transcript = 'We discussed alpha and beta this morning.';
    assert.deepStrictEqual(
      detectTopicsLexical(transcript, identities),
      ['alpha-beta-gamma-delta'],
    );
  });

  it('AC K9b: coverage 0.25 fails — 4 non-stop tokens, transcript hits 1', () => {
    // 1 hit fails the ≥2 hit rule directly; coverage rule is moot here but
    // also fails (1/4 = 0.25 < 0.5). Either rule rejects.
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta-gamma-delta', aliases: [] },
    ];
    const transcript = 'We discussed alpha briefly today.';
    assert.deepStrictEqual(detectTopicsLexical(transcript, identities), []);
  });

  it('AC K9c: coverage exactly below 0.5 fails — 4 non-stop tokens, hits ≥2 but coverage < 0.5', () => {
    // Constructed: 5-token non-stop slug, only 2 hits → coverage 2/5 = 0.4.
    // ≥2 hit rule passes; coverage rule fails. Confirms coverage acts as a
    // separate gate on top of the hit-count rule.
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta-gamma-delta-epsilon', aliases: [] },
    ];
    const transcript = 'We discussed alpha and beta this morning.';
    assert.deepStrictEqual(
      detectTopicsLexical(transcript, identities),
      [],
    );
  });

  it('returns empty array on empty transcript', () => {
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta', aliases: [] },
    ];
    assert.deepStrictEqual(detectTopicsLexical('', identities), []);
  });

  it('returns empty array when no identities', () => {
    assert.deepStrictEqual(
      detectTopicsLexical('alpha beta gamma delta', []),
      [],
    );
  });

  it('is deterministic given identical inputs', () => {
    const transcript =
      'alpha beta gamma delta epsilon zeta eta theta iota kappa today.';
    const identities: TopicIdentity[] = [
      { canonical: 'alpha-beta', aliases: [], lastRefreshed: '2026-01-01' },
      { canonical: 'gamma-delta', aliases: [], lastRefreshed: '2026-01-01' },
      { canonical: 'epsilon-zeta', aliases: [], lastRefreshed: '2026-01-01' },
    ];
    const a = detectTopicsLexical(transcript, identities);
    const b = detectTopicsLexical(transcript, identities);
    assert.deepStrictEqual(a, b);
  });

  it('STOP_TOKENS contains the documented set', () => {
    // Spec contract — these stop tokens are the precision lever per
    // pre-mortem R2.
    for (const t of [
      'planning',
      'review',
      'sync',
      'discussion',
      'meeting',
      'update',
      'status',
      'team',
      'weekly',
      'daily',
    ]) {
      assert.ok(STOP_TOKENS.has(t), `STOP_TOKENS should contain "${t}"`);
    }
  });
});
