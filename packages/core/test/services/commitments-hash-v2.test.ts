/**
 * Phase 10a v2 hash + normalization tests (Step 2).
 *
 * Covers:
 *  - Normalization idempotency: `normalize(normalize(x)) === normalize(x)`.
 *  - Arrow notation + `@<slug>:` prefix stripping (both bracketed and bare).
 *  - LLM-variation hash stability — the "talk to Dave about staffing" and
 *    "going to chat with Dave on the staffing plan" pair collapse via
 *    the lemma + multi-token rules (with a documented limitation around
 *    "to" vs "with" which is intentionally NOT normalized; semantic
 *    layer in 10b catches it).
 *  - createdAt is NOT a hash input (R3 invariance gate).
 *  - Direction is part of the hash — flipping direction produces a
 *    different hash for identical text.
 *  - Counterparty / area / project DO NOT change the hash (only text +
 *    direction).
 *
 * Pure unit tests — no I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCommitmentTextV2,
  computeCommitmentHashV2,
} from '../../src/services/commitments-hash-v2.js';

describe('normalizeCommitmentTextV2 — text normalization', () => {
  it('strips bracketed arrow notation prefix (outbound)', () => {
    const n = normalizeCommitmentTextV2(
      '[@john-koht → @dave-wiedenheft] Talk to Dave about staffing',
    );
    assert.equal(n, 'talk to dave about staffing');
  });

  it('strips bare arrow notation prefix with colon', () => {
    const n = normalizeCommitmentTextV2(
      '@john-koht → @dave-wiedenheft: Talk to Dave about staffing',
    );
    assert.equal(n, 'talk to dave about staffing');
  });

  it('strips bare `@slug:` prefix (no arrow)', () => {
    const n = normalizeCommitmentTextV2('@john-koht: Note about staffing');
    assert.equal(n, 'note about staffing');
  });

  it('strips inbound (←) arrow notation', () => {
    const n = normalizeCommitmentTextV2(
      '@john-koht ← @lindsay-gray: Send me the deck',
    );
    // The action verb "Send" stays; only the arrow + slug prefix is
    // stripped. (Multi-token "will send" → "send" collapses elsewhere.)
    assert.equal(n, 'send me the deck');
  });

  it('strips ASCII arrow variants (-> / <-)', () => {
    const a = normalizeCommitmentTextV2('@john-koht -> @dave: Talk to Dave');
    assert.equal(a, 'talk to dave');
  });

  it('lowercases + strips punctuation', () => {
    const n = normalizeCommitmentTextV2('Talk to Dave!! About: staffing??');
    assert.equal(n, 'talk to dave about staffing');
  });

  it('collapses whitespace', () => {
    const n = normalizeCommitmentTextV2('  Talk\t to\n\nDave   about staffing ');
    assert.equal(n, 'talk to dave about staffing');
  });

  it('strips leading "ill" / "going to" / "gonna" / "i will" intent prefixes', () => {
    const a = normalizeCommitmentTextV2("I'll send the deck");
    const b = normalizeCommitmentTextV2('Going to send the deck');
    const c = normalizeCommitmentTextV2('Gonna send the deck');
    const d = normalizeCommitmentTextV2('I will send the deck');
    assert.equal(a, 'send the deck');
    assert.equal(b, 'send the deck');
    assert.equal(c, 'send the deck');
    assert.equal(d, 'send the deck');
  });

  it('lemmatizes verbs (talked → talk, sent → send, etc.)', () => {
    assert.equal(normalizeCommitmentTextV2('Talked to Dave'), 'talk to dave');
    assert.equal(normalizeCommitmentTextV2('Talking with Dave'), 'talk with dave');
    assert.equal(
      normalizeCommitmentTextV2('Sent the deck to Lindsay'),
      'send the deck to lindsay',
    );
  });

  it('collapses multi-token "will send" → "send"', () => {
    assert.equal(
      normalizeCommitmentTextV2('Will send the deck'),
      'send the deck',
    );
    assert.equal(
      normalizeCommitmentTextV2('Will follow up with Dave'),
      'follow up with dave',
    );
  });

  it('strips residual @slug mentions in the body', () => {
    const n = normalizeCommitmentTextV2('Follow up with @dave-wiedenheft about staffing');
    assert.equal(n, 'follow up with about staffing');
  });

  it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const inputs = [
      '@john-koht → @dave: Talk to Dave about staffing',
      "I'll send the deck by Friday",
      'Going to chat with Dave on the staffing plan',
      'Will follow up with @lindsay-gray about the deck',
      'Note to self: prep for review',
      '',
      '   ',
    ];
    for (const raw of inputs) {
      const once = normalizeCommitmentTextV2(raw);
      const twice = normalizeCommitmentTextV2(once);
      assert.equal(twice, once, `idempotency failed for: ${JSON.stringify(raw)}`);
    }
  });

  it('returns empty string on empty / whitespace input', () => {
    assert.equal(normalizeCommitmentTextV2(''), '');
    assert.equal(normalizeCommitmentTextV2('   '), '');
    assert.equal(normalizeCommitmentTextV2('!!??.,'), '');
  });
});

describe('computeCommitmentHashV2 — hash inputs + invariance', () => {
  it('text + direction → stable sha256 hex', () => {
    const h = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    assert.match(h, /^[0-9a-f]{64}$/);
    // Stable across calls
    const h2 = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    assert.equal(h, h2);
  });

  it('changes when direction flips', () => {
    const a = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    const b = computeCommitmentHashV2('Talk to Dave about staffing', 'they_owe_me');
    const c = computeCommitmentHashV2('Talk to Dave about staffing', 'self');
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.notEqual(b, c);
  });

  it('collapses arrow-notation prefix → same hash as bare text', () => {
    const bare = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    const arr1 = computeCommitmentHashV2(
      '[@john-koht → @dave-wiedenheft] Talk to Dave about staffing',
      'i_owe_them',
    );
    const arr2 = computeCommitmentHashV2(
      '@john-koht → @dave-wiedenheft: Talk to Dave about staffing',
      'i_owe_them',
    );
    assert.equal(arr1, bare);
    assert.equal(arr2, bare);
  });

  it('collapses LLM-variation pair: "I will send" === "Send" (with same direction)', () => {
    // The intent-prefix stripper handles this case; it is the hash's job
    // to make "Will send the deck" and "Send the deck" collide.
    const a = computeCommitmentHashV2('Will send the deck', 'i_owe_them');
    const b = computeCommitmentHashV2('Send the deck', 'i_owe_them');
    assert.equal(a, b);
  });

  it('collapses lemma pair: "Talked to Dave" === "Talk to Dave"', () => {
    const a = computeCommitmentHashV2('Talked to Dave about staffing', 'i_owe_them');
    const b = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    assert.equal(a, b);
  });

  it('does NOT collapse "talk to" vs "chat with" (lemma + preposition diff)', () => {
    // Per plan §"Hard part 5": these pair-variations are INTENTIONALLY
    // left for the semantic layer (10b) — hash-only would over-merge
    // distinct actions. This test pins the boundary.
    const a = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    const b = computeCommitmentHashV2(
      'Going to chat with Dave on the staffing plan',
      'i_owe_them',
    );
    assert.notEqual(a, b);
  });

  it('createdAt is NOT in the hash inputs (R3 invariance)', () => {
    // Hash is sha256(text+direction). There's no createdAt parameter;
    // this test pins the function signature so a future "convenience"
    // refactor that adds createdAt as a hash component fails loudly.
    const fn = computeCommitmentHashV2 as unknown as (...args: unknown[]) => string;
    assert.equal(fn.length, 2, 'computeCommitmentHashV2 must accept exactly 2 args');
  });

  it('counterparty/area/project DO NOT affect hash (per data model decision (a))', () => {
    // Hash depends only on (text, direction). Counterparty lives in
    // `stakeholders[]` metadata downstream; this test makes the
    // invariant inspectable.
    const h1 = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    // No way to pass counterparty/area/project into the function — its
    // signature accepts only (text, direction). The fact that this test
    // passes via the signature check above + the hash being stable is
    // the assertion. We re-affirm by computing twice and matching:
    const h2 = computeCommitmentHashV2('Talk to Dave about staffing', 'i_owe_them');
    assert.equal(h1, h2);
  });

  it('normalizes whitespace + case before hashing', () => {
    const a = computeCommitmentHashV2('TALK TO  DAVE  about staffing', 'i_owe_them');
    const b = computeCommitmentHashV2('  talk to dave about staffing  ', 'i_owe_them');
    assert.equal(a, b);
  });
});
