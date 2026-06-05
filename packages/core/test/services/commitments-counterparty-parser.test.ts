/**
 * Phase 10a v2 counterparty parser tests (Step 3).
 *
 * Covers the five mandatory patterns from plan §"Migration plan (v2)":
 *   1. Arrow notation outbound (→)
 *   2. Arrow notation inbound (←)
 *   3. Natural language ("to <Name>", "from <Name>", "with <Name>")
 *   4. Bare-name ambiguity (Lindsay → multiple candidates)
 *   5. Self-pattern (Step 0 pre-check)
 *
 * Plus AC1a (owner-as-personSlug repair) + AC1b (self-pattern Note-to-self
 * with body mention of Dave does NOT make Dave the recipient).
 *
 * Pure unit tests — no I/O. Directory passed as an in-memory map.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCounterpartiesFromText,
  buildPersonDirectory,
  type PersonDirectory,
} from '../../src/services/commitments-counterparty-parser.js';

/**
 * Reusable people directory roughly mirroring arete-reserv's:
 *  - Two Lindsays (ambiguous on first name)
 *  - Dave, Anthony, Caroline as unambiguous singletons.
 */
function buildTestDirectory(): PersonDirectory {
  return buildPersonDirectory([
    { slug: 'lindsay-calar', name: 'Lindsay Calar' },
    { slug: 'lindsay-gray', name: 'Lindsay Gray' },
    { slug: 'dave-wiedenheft', name: 'Dave Wiedenheft' },
    { slug: 'anthony-avina', name: 'Anthony Avina' },
    { slug: 'caroline-mullineaux', name: 'Caroline Mullineaux' },
    { slug: 'john-koht', name: 'John Koht' },
  ]);
}

const OWNER = 'john-koht';

describe('Step 1 — arrow notation', () => {
  it('outbound (→) — `@owner → @counterparty: body` (AC1a)', () => {
    const result = extractCounterpartiesFromText(
      '@john-koht → @dave-wiedenheft: Talk to Dave about staffing',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, false);
    assert.equal(result.direction, 'i_owe_them');
    assert.equal(result.stakeholders.length, 1);
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
    assert.equal(result.stakeholders[0].role, 'recipient');
  });

  it('inbound (←) — `@owner ← @counterparty: body`', () => {
    const result = extractCounterpartiesFromText(
      '@john-koht ← @lindsay-gray: Send me the deck',
      OWNER,
      'they_owe_me',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, false);
    assert.equal(result.direction, 'they_owe_me');
    assert.equal(result.stakeholders[0].slug, 'lindsay-gray');
    assert.equal(result.stakeholders[0].role, 'sender');
  });

  it('bracketed arrow form — `[@owner → @cp] body`', () => {
    const result = extractCounterpartiesFromText(
      '[@john-koht → @dave-wiedenheft] Follow up on hiring',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
    assert.equal(result.stakeholders[0].role, 'recipient');
  });

  it('ASCII arrow form (->) — `@owner -> @cp: body`', () => {
    const result = extractCounterpartiesFromText(
      '@john-koht -> @anthony-avina: Reply on FY25',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.stakeholders[0].slug, 'anthony-avina');
  });

  it('arrow with owner=owner — degrades to self', () => {
    // Defensive: a corrupt entry like "[@john-koht → @john-koht] ..."
    // collapses to self rather than emitting the owner as a recipient.
    const result = extractCounterpartiesFromText(
      '@john-koht → @john-koht: prep notes',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders[0].role, 'self');
    assert.equal(result.stakeholders[0].slug, OWNER);
  });
});

describe('Step 2 — natural language', () => {
  it('unambiguous single first-name → resolved (`to Dave` → dave-wiedenheft)', () => {
    const result = extractCounterpartiesFromText(
      'Send the staffing plan to Dave',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, false);
    assert.equal(result.stakeholders.length, 1);
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
    assert.equal(result.stakeholders[0].role, 'recipient');
  });

  it('"with <Name>" preposition resolves correctly', () => {
    const result = extractCounterpartiesFromText(
      'Talk with Dave about staffing',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
  });

  it('"from <Name>" with they_owe_me → sender role', () => {
    const result = extractCounterpartiesFromText(
      'Get the deck from Anthony by Friday',
      OWNER,
      'they_owe_me',
      buildTestDirectory(),
    );
    assert.equal(result.stakeholders[0].slug, 'anthony-avina');
    assert.equal(result.stakeholders[0].role, 'sender');
  });

  it('"for <Name>" preposition resolves', () => {
    const result = extractCounterpartiesFromText(
      'Prepare the deck for Anthony',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.stakeholders[0].slug, 'anthony-avina');
  });

  it('multi-word name resolves via combined key (e.g., "Lindsay Gray")', () => {
    const result = extractCounterpartiesFromText(
      'Deliver POP MVP project plan to Lindsay Gray',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, false);
    assert.equal(result.stakeholders[0].slug, 'lindsay-gray');
  });

  it('lowercase-only preposition without uppercase name → no resolution', () => {
    // "send to staffing" must NOT resolve — there's no person named
    // "Staffing" in the directory.
    const result = extractCounterpartiesFromText(
      'send to staffing notes',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    // Step 2 produced no candidates → Step 3 self-fallback.
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders[0].role, 'self');
  });

  it('multiple unambiguous resolutions de-duped by slug', () => {
    const result = extractCounterpartiesFromText(
      'Send the deck to Dave and follow up with Dave on staffing',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    // "Dave" appears twice; should resolve once.
    assert.equal(result.stakeholders.length, 1);
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
  });

  it('owner mentioned by name → excluded from stakeholders', () => {
    const result = extractCounterpartiesFromText(
      'Send the deck to John about staffing',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    // The owner ("John" → john-koht) is filtered; nothing else resolves
    // → Step 3 self-fallback.
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders[0].role, 'self');
    assert.equal(result.stakeholders[0].slug, OWNER);
  });
});

describe('Step 2 — bare-name ambiguity (AC1e)', () => {
  it('"to Lindsay" with two Lindsays → ambiguous: true + ambiguousNames populated', () => {
    const result = extractCounterpartiesFromText(
      'Deliver POP MVP project plan to Lindsay',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, true);
    assert.equal(result.stakeholders.length, 0, 'stakeholders empty on ambiguous');
    assert.ok(result.ambiguousNames);
    assert.equal(result.ambiguousNames!.length, 1);
    assert.equal(result.ambiguousNames![0].name, 'Lindsay');
    assert.deepEqual(
      [...result.ambiguousNames![0].candidates].sort(),
      ['lindsay-calar', 'lindsay-gray'],
    );
  });

  it('combined name resolves even when first-name is ambiguous', () => {
    const result = extractCounterpartiesFromText(
      'Send the deck to Lindsay Calar by Friday',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    // "Lindsay Calar" → single candidate; ambiguity averted.
    assert.equal(result.ambiguous, false);
    assert.equal(result.stakeholders[0].slug, 'lindsay-calar');
  });

  it('mixed: one resolvable, one ambiguous → reports ambiguous (caller surfaces)', () => {
    // Both prepositions present; Dave resolves cleanly, Lindsay is
    // ambiguous (two candidates in the directory). The whole row
    // surfaces as ambiguous so the user disambiguates BEFORE --apply
    // (we don't silently pick Dave-only and drop Lindsay).
    const result = extractCounterpartiesFromText(
      'Send the deck to Dave and follow up with Lindsay',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.ambiguous, true);
    assert.equal(result.stakeholders.length, 0);
    assert.equal(result.ambiguousNames!.length, 1);
    assert.equal(result.ambiguousNames![0].name, 'Lindsay');
  });
});

describe('Step 0 — self-pattern pre-check (AC1b)', () => {
  it('"Note to self: ..." → direction=self, body mentions ignored', () => {
    const result = extractCounterpartiesFromText(
      'Note to self: prep for Dave\'s review',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders.length, 1);
    assert.equal(result.stakeholders[0].slug, OWNER);
    assert.equal(result.stakeholders[0].role, 'self');
    // CRITICAL (AC1b): Dave is NOT in the stakeholders list even though
    // the body mentions him.
    assert.ok(
      !result.stakeholders.some((s) => s.slug === 'dave-wiedenheft'),
      'Dave must not be a recipient when text starts with "Note to self"',
    );
  });

  it('all five self-marker prefixes route to self', () => {
    const prefixes = [
      'Note to self: do X',
      'Remember to call Dave tomorrow',
      'Remember I owe Dave the deck',
      'Make sure I follow up with Dave',
      "Don't forget to ping Dave",
      'TODO: prep notes for Dave review',
    ];
    for (const text of prefixes) {
      const result = extractCounterpartiesFromText(
        text,
        OWNER,
        'i_owe_them',
        buildTestDirectory(),
      );
      assert.equal(result.direction, 'self', `failed: ${text}`);
      assert.equal(result.stakeholders[0].role, 'self');
    }
  });

  it('self-pattern is case-insensitive but only matches PREFIX', () => {
    // "Note to self" mid-string should NOT trigger Step 0.
    const result = extractCounterpartiesFromText(
      'Send to Dave (note to self: bring the slides)',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'i_owe_them');
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
  });

  it('arrow notation OVERRIDES self-pattern (explicit directive wins)', () => {
    // A contradictory entry: arrow says outbound-to-Dave, body starts
    // with "Note to self". The explicit arrow wins.
    const result = extractCounterpartiesFromText(
      '@john-koht → @dave-wiedenheft: Note to self stuff',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'i_owe_them');
    assert.equal(result.stakeholders[0].slug, 'dave-wiedenheft');
  });
});

describe('Step 3 — self-fallback', () => {
  it('no arrow + no resolvable name → direction=self, stakeholders=[{owner,self}]', () => {
    const result = extractCounterpartiesFromText(
      'Run POP Glance 2.0 story mapping workshop',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders.length, 1);
    assert.equal(result.stakeholders[0].slug, OWNER);
    assert.equal(result.stakeholders[0].role, 'self');
  });

  it('empty / whitespace text → self-fallback', () => {
    const result = extractCounterpartiesFromText(
      '',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders[0].slug, OWNER);
  });

  it('text mentions a name NOT in directory → self-fallback (no false positive)', () => {
    const result = extractCounterpartiesFromText(
      'Send the deck to Frieda by Friday',
      OWNER,
      'i_owe_them',
      buildTestDirectory(),
    );
    assert.equal(result.direction, 'self');
    assert.equal(result.stakeholders[0].slug, OWNER);
  });
});

describe('buildPersonDirectory — indexing', () => {
  it('indexes both first-name and full name (lowercased)', () => {
    const dir = buildPersonDirectory([
      { slug: 'dave-wiedenheft', name: 'Dave Wiedenheft' },
    ]);
    assert.deepEqual(dir.get('dave'), ['dave-wiedenheft']);
    assert.deepEqual(dir.get('dave wiedenheft'), ['dave-wiedenheft']);
  });

  it('accumulates multiple slugs under the same first-name key', () => {
    const dir = buildPersonDirectory([
      { slug: 'lindsay-calar', name: 'Lindsay Calar' },
      { slug: 'lindsay-gray', name: 'Lindsay Gray' },
    ]);
    const candidates = dir.get('lindsay');
    assert.ok(candidates);
    assert.deepEqual([...candidates!].sort(), ['lindsay-calar', 'lindsay-gray']);
  });

  it('handles single-name entries (no surname) gracefully', () => {
    const dir = buildPersonDirectory([{ slug: 'carla', name: 'Carla' }]);
    assert.deepEqual(dir.get('carla'), ['carla']);
  });

  it('skips entries with empty name (defensive)', () => {
    const dir = buildPersonDirectory([
      { slug: 'orphan', name: '' },
      { slug: 'dave', name: 'Dave' },
    ]);
    assert.equal(dir.has('orphan'), false);
    assert.deepEqual(dir.get('dave'), ['dave']);
  });
});
