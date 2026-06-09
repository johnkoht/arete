import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStancePrompt,
  parseStanceResponse,
  extractStancesForPerson,
  computeActionItemHash,
  isActionItemStale,
  capActionItems,
  deduplicateActionItems,
} from '../../src/services/person-signals.js';
import type {
  LLMCallFn,
  PersonStance,
  StanceDirection,
  PersonActionItem,
} from '../../src/services/person-signals.js';

// ---------------------------------------------------------------------------
// buildStancePrompt
// ---------------------------------------------------------------------------

describe('buildStancePrompt', () => {
  it('includes the person name', () => {
    const prompt = buildStancePrompt('Some transcript', 'Sarah Chen');
    assert.ok(prompt.includes('Sarah Chen'));
  });

  it('includes the transcript content', () => {
    const prompt = buildStancePrompt('Alice: We should use React.', 'Alice');
    assert.ok(prompt.includes('Alice: We should use React.'));
  });

  it('includes JSON schema with stances array', () => {
    const prompt = buildStancePrompt('content', 'Bob');
    assert.ok(prompt.includes('"stances"'));
    assert.ok(prompt.includes('"topic"'));
    assert.ok(prompt.includes('"direction"'));
    assert.ok(prompt.includes('"summary"'));
    assert.ok(prompt.includes('"evidence_quote"'));
  });

  it('includes direction enum values', () => {
    const prompt = buildStancePrompt('content', 'Bob');
    assert.ok(prompt.includes('supports'));
    assert.ok(prompt.includes('opposes'));
    assert.ok(prompt.includes('concerned'));
    assert.ok(prompt.includes('neutral'));
  });

  it('includes omission instruction for uncertain stances', () => {
    const prompt = buildStancePrompt('content', 'Bob');
    // Proposal C uses "When in doubt, SKIP" rather than the older "if uncertain, omit" phrasing
    assert.ok(prompt.toLowerCase().includes('when in doubt'));
    assert.ok(prompt.toLowerCase().includes('skip'));
  });

  it('instructs to extract only for the named person', () => {
    const prompt = buildStancePrompt('content', 'Alice');
    assert.ok(prompt.includes('Extract stances ONLY for Alice'));
  });

  it('requests JSON output without code fences', () => {
    const prompt = buildStancePrompt('content', 'Bob');
    assert.ok(prompt.includes('ONLY valid JSON'));
    assert.ok(prompt.includes('no code fences'));
  });
});

// ---------------------------------------------------------------------------
// parseStanceResponse
// ---------------------------------------------------------------------------

describe('parseStanceResponse', () => {
  it('parses valid JSON with complete stances', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'React adoption',
          direction: 'supports',
          summary: 'Advocates for using React over Vue.',
          evidence_quote: 'I think React is the better choice for our team.',
          _justification: 'Considered SKIP (feature-endorsement) — ruled out because the position is a framework philosophy, not approval of a specific component.',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'React adoption');
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].summary, 'Advocates for using React over Vue.');
    assert.equal(result[0].evidenceQuote, 'I think React is the better choice for our team.');
    assert.equal(result[0].justification, 'Considered SKIP (feature-endorsement) — ruled out because the position is a framework philosophy, not approval of a specific component.');
    assert.equal(result[0].source, '');
    assert.equal(result[0].date, '');
  });

  it('parses multiple stances', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'Microservices',
          direction: 'supports',
          summary: 'Wants microservices.',
          evidence_quote: 'We should go with microservices.',
          _justification: 'Architectural philosophy that transfers to any service-design decision; not feature-endorsement.',
        },
        {
          topic: 'Monolith',
          direction: 'opposes',
          summary: 'Against monolith.',
          evidence_quote: 'The monolith approach will slow us down.',
          _justification: 'Position on architectural pattern, contestable and transfers; not a project-specific opinion.',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 2);
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[1].direction, 'opposes');
  });

  it('handles empty stances array', () => {
    const result = parseStanceResponse(JSON.stringify({ stances: [] }));
    assert.deepEqual(result, []);
  });

  it('handles malformed JSON', () => {
    const result = parseStanceResponse('This is not JSON at all.');
    assert.deepEqual(result, []);
  });

  it('handles empty string', () => {
    const result = parseStanceResponse('');
    assert.deepEqual(result, []);
  });

  it('handles JSON without stances key', () => {
    const result = parseStanceResponse(JSON.stringify({ summary: 'No stances here.' }));
    assert.deepEqual(result, []);
  });

  it('strips markdown code fences (json label)', () => {
    const response = '```json\n{"stances": [{"topic": "Testing", "direction": "supports", "summary": "Likes tests.", "evidence_quote": "We need more tests.", "_justification": "Methodology stance, transfers across projects."}]}\n```';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Testing');
  });

  it('strips code fences without json label', () => {
    const response = '```\n{"stances": [{"topic": "CI", "direction": "supports", "summary": "Wants CI.", "evidence_quote": "Let us set up CI.", "_justification": "Engineering practice position, not project-specific."}]}\n```';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'CI');
  });

  it('extracts JSON from surrounding text', () => {
    const response = 'Here are the stances:\n{"stances": [{"topic": "API", "direction": "concerned", "summary": "Worried about API.", "evidence_quote": "The API concerns me.", "_justification": "Persistent concern about a class of integration, not a one-off observation."}]}\nDone.';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'concerned');
  });

  it('skips stances with missing required fields', () => {
    const response = JSON.stringify({
      stances: [
        { direction: 'supports', summary: 'No topic.', evidence_quote: 'Quote.', _justification: 'has justification but missing topic.' },
        { topic: 'Valid', direction: 'supports', summary: 'Has topic.', evidence_quote: 'Quote.', _justification: 'Considered PAIR 1 SKIP, ruled out because it transfers.' },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Valid');
  });

  it('skips stances with invalid direction', () => {
    const response = JSON.stringify({
      stances: [
        { topic: 'Testing', direction: 'loves', summary: 'Invalid dir.', evidence_quote: 'Quote.' },
      ],
    });
    assert.deepEqual(parseStanceResponse(response), []);
  });

  it('skips stances with empty string fields', () => {
    const response = JSON.stringify({
      stances: [
        { topic: '', direction: 'supports', summary: 'Summary.', evidence_quote: 'Quote.' },
      ],
    });
    assert.deepEqual(parseStanceResponse(response), []);
  });

  it('trims whitespace from all fields', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: '  React  ',
          direction: '  supports  ',
          summary: '  Likes React.  ',
          evidence_quote: '  React is great.  ',
          _justification: '  Framework philosophy stance.  ',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'React');
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].summary, 'Likes React.');
    assert.equal(result[0].evidenceQuote, 'React is great.');
    assert.equal(result[0].justification, 'Framework philosophy stance.');
  });

  it('handles non-object items in stances array', () => {
    const response = JSON.stringify({
      stances: [null, 'not an object', 42, { topic: 'Valid', direction: 'supports', summary: 'OK.', evidence_quote: 'Quote.', _justification: 'A real position on methodology, not project-endorsement.' }],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Valid');
  });

  it('normalizes direction to lowercase', () => {
    const response = JSON.stringify({
      stances: [
        { topic: 'Testing', direction: 'Supports', summary: 'Likes it.', evidence_quote: 'Quote.', _justification: 'Engineering-practice philosophy, transfers.' },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'supports');
  });
});

// ---------------------------------------------------------------------------
// parseStanceResponse — Proposal C invariants
//
// Proposal C tightens the parser to enforce three invariants:
//   1. `neutral` is not a valid direction — drop any stance that uses it.
//   2. `_justification` is required (audit-trail) — drop missing/empty.
//   3. Hard-cap of 5 stances at parser exit (belt-and-suspenders with
//      the prompt's max-5 instruction; raised from 3 in Phase 9
//      followup-6 — was too aggressive, depressing yield to ~13 per
//      297-meeting backfill). Validation runs first, then slice.
// ---------------------------------------------------------------------------

describe('parseStanceResponse — Proposal C invariants', () => {
  it('drops stances with direction "neutral" (no longer a valid direction)', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'Languages',
          direction: 'neutral',
          summary: 'No strong opinion on Go vs Rust.',
          evidence_quote: 'Either Go or Rust is fine.',
          _justification: 'Author thought this was a stance but it has no direction.',
        },
        {
          topic: 'Type systems',
          direction: 'supports',
          summary: 'Prefers strong static typing.',
          evidence_quote: 'Static types catch real bugs.',
          _justification: 'Persistent language-design philosophy, contestable and transfers.',
        },
      ],
    });

    const result = parseStanceResponse(response);
    // Only the supports stance survives — neutral is dropped because it's
    // not in VALID_DIRECTIONS.
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].topic, 'Type systems');
  });

  it('drops stances missing _justification entirely (audit-trail required)', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'Microservices',
          direction: 'supports',
          summary: 'Wants microservices.',
          evidence_quote: 'We should go with microservices.',
          // _justification absent — must be dropped
        },
        {
          topic: 'Monolith',
          direction: 'opposes',
          summary: 'Against monolith.',
          evidence_quote: 'The monolith approach will slow us down.',
          _justification: 'Architectural philosophy, transfers across decisions.',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Monolith');
  });

  it('drops stances with empty-string _justification', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'Testing',
          direction: 'supports',
          summary: 'Likes tests.',
          evidence_quote: 'We need more tests.',
          _justification: '',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.deepEqual(result, []);
  });

  it('drops stances with whitespace-only _justification', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'Testing',
          direction: 'supports',
          summary: 'Likes tests.',
          evidence_quote: 'We need more tests.',
          _justification: '   \n\t  ',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.deepEqual(result, []);
  });

  it('hard-caps output at 5 stances even when LLM returns 7', () => {
    // Phase 9 followup-6 raised the per-meeting cap from 3 → 5.
    const response = JSON.stringify({
      stances: [
        { topic: 't1', direction: 'supports', summary: 's1', evidence_quote: 'q1', _justification: 'j1 — first most-distinctive position.' },
        { topic: 't2', direction: 'opposes', summary: 's2', evidence_quote: 'q2', _justification: 'j2 — second most-distinctive.' },
        { topic: 't3', direction: 'concerned', summary: 's3', evidence_quote: 'q3', _justification: 'j3 — third most-distinctive.' },
        { topic: 't4', direction: 'supports', summary: 's4', evidence_quote: 'q4', _justification: 'j4 — fourth most-distinctive.' },
        { topic: 't5', direction: 'opposes', summary: 's5', evidence_quote: 'q5', _justification: 'j5 — fifth most-distinctive.' },
        { topic: 't6', direction: 'supports', summary: 's6', evidence_quote: 'q6', _justification: 'j6 — would be dropped by cap.' },
        { topic: 't7', direction: 'opposes', summary: 's7', evidence_quote: 'q7', _justification: 'j7 — would be dropped by cap.' },
      ],
    });

    const result = parseStanceResponse(response);
    // Hard-cap of 5 enforced regardless of how many the LLM emitted.
    assert.equal(result.length, 5);
    // Order is preserved: model emits most-distinctive first per prompt.
    assert.equal(result[0].topic, 't1');
    assert.equal(result[1].topic, 't2');
    assert.equal(result[2].topic, 't3');
    assert.equal(result[3].topic, 't4');
    assert.equal(result[4].topic, 't5');
  });

  it('validation runs before slice: dropped stances do not count toward the cap', () => {
    // If validation ran AFTER slice, the first 5 (3 invalid + 2 valid) would
    // be sliced first and the 3 invalid dropped, leaving only 2 valid stances.
    // Proposal C invariant: validation first, then slice. So the 5 valid
    // stances at positions 3-7 survive (cap of 5 still applies — valid-6
    // would be dropped at slice time).
    const response = JSON.stringify({
      stances: [
        { topic: 'neutral-stance', direction: 'neutral', summary: 's', evidence_quote: 'q', _justification: 'should drop on direction.' },
        { topic: 'missing-just', direction: 'supports', summary: 's', evidence_quote: 'q' },
        { topic: 'empty-just', direction: 'supports', summary: 's', evidence_quote: 'q', _justification: '' },
        { topic: 'valid-1', direction: 'supports', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance.' },
        { topic: 'valid-2', direction: 'opposes', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance.' },
        { topic: 'valid-3', direction: 'concerned', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance.' },
        { topic: 'valid-4', direction: 'supports', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance.' },
        { topic: 'valid-5', direction: 'opposes', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance.' },
        { topic: 'valid-6', direction: 'supports', summary: 's', evidence_quote: 'q', _justification: 'a real defended stance — would be dropped by cap of 5.' },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 5);
    assert.equal(result[0].topic, 'valid-1');
    assert.equal(result[1].topic, 'valid-2');
    assert.equal(result[2].topic, 'valid-3');
    assert.equal(result[3].topic, 'valid-4');
    assert.equal(result[4].topic, 'valid-5');
  });

  it('schema-pass: well-formed stance with all required fields is accepted', () => {
    const response = JSON.stringify({
      stances: [
        {
          topic: 'change-management as a distinct org function',
          direction: 'supports',
          summary: 'Lindsay supports a dedicated change-management role because product adoption was unaccountable without it.',
          evidence_quote: 'We need someone whose only job is making sure features get used.',
          _justification: 'Considered PAIR 5 SKIP (vague exhortation) — ruled out because the position is specific (a role should exist) with concrete reasoning. Contestable: some orgs assign adoption to PMs. Transfers.',
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    const stance = result[0];
    assert.equal(stance.topic, 'change-management as a distinct org function');
    assert.equal(stance.direction, 'supports');
    assert.ok(stance.summary.startsWith('Lindsay supports a dedicated'));
    assert.equal(stance.evidenceQuote, 'We need someone whose only job is making sure features get used.');
    assert.ok(stance.justification.includes('PAIR 5'));
    // source and date stay empty at parser output — populated downstream by the caller.
    assert.equal(stance.source, '');
    assert.equal(stance.date, '');
  });
});

// ---------------------------------------------------------------------------
// extractStancesForPerson (integration with mock LLM)
// ---------------------------------------------------------------------------

describe('extractStancesForPerson', () => {
  it('calls LLM and returns parsed stances', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        stances: [
          {
            topic: 'Kubernetes',
            direction: 'supports',
            summary: 'Advocates for K8s migration.',
            evidence_quote: 'We should move to Kubernetes this quarter.',
            _justification: 'Infrastructure philosophy stance, not a schedule commitment.',
          },
        ],
      });

    const result = await extractStancesForPerson(
      'Sarah: We should move to Kubernetes this quarter.\nBob: I agree.',
      'Sarah',
      mockLLM,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Kubernetes');
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].summary, 'Advocates for K8s migration.');
    assert.equal(result[0].evidenceQuote, 'We should move to Kubernetes this quarter.');
  });

  it('returns empty array for empty content', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Should not be called');
    };
    assert.deepEqual(await extractStancesForPerson('', 'Sarah', mockLLM), []);
  });

  it('returns empty array for whitespace-only content', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Should not be called');
    };
    assert.deepEqual(await extractStancesForPerson('   \n  ', 'Sarah', mockLLM), []);
  });

  it('returns empty array for empty person name', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Should not be called');
    };
    assert.deepEqual(await extractStancesForPerson('Content', '', mockLLM), []);
  });

  it('returns empty array when LLM returns empty stances', async () => {
    const mockLLM: LLMCallFn = async () => JSON.stringify({ stances: [] });
    assert.deepEqual(await extractStancesForPerson('Meeting content.', 'Alice', mockLLM), []);
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const mockLLM: LLMCallFn = async () => 'I cannot process this transcript.';
    assert.deepEqual(await extractStancesForPerson('Content.', 'Alice', mockLLM), []);
  });

  it('returns empty array when LLM call throws', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Network error');
    };
    assert.deepEqual(await extractStancesForPerson('Content.', 'Alice', mockLLM), []);
  });

  it('handles LLM returning code-fenced JSON', async () => {
    const mockLLM: LLMCallFn = async () =>
      '```json\n{"stances": [{"topic": "TypeScript", "direction": "supports", "summary": "Prefers TS.", "evidence_quote": "TypeScript catches bugs early.", "_justification": "Language-choice philosophy, contestable and transfers."}]}\n```';

    const result = await extractStancesForPerson('Content.', 'Bob', mockLLM);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'TypeScript');
  });

  it('passes person name and content to the prompt', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ stances: [] });
    };

    await extractStancesForPerson('Alice: Let us discuss.', 'Jane Doe', mockLLM);
    assert.ok(capturedPrompt.includes('Jane Doe'));
    assert.ok(capturedPrompt.includes('Alice: Let us discuss.'));
  });

  it('returns multiple stances from a single call', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        stances: [
          { topic: 'Remote work', direction: 'supports', summary: 'Prefers remote.', evidence_quote: 'I work better from home.', _justification: 'Persistent workplace philosophy, transfers.' },
          { topic: 'Open offices', direction: 'opposes', summary: 'Dislikes open offices.', evidence_quote: 'Open offices are too noisy.', _justification: 'Position on office design that transfers across companies.' },
          { topic: 'Budget cuts', direction: 'concerned', summary: 'Worried about budget.', evidence_quote: 'The budget cuts concern me.', _justification: 'Pattern-level concern about resourcing, not a current-sprint observation.' },
        ],
      });

    const result = await extractStancesForPerson('Content.', 'Alice', mockLLM);
    assert.equal(result.length, 3);
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[1].direction, 'opposes');
    assert.equal(result[2].direction, 'concerned');
  });

  it('exports PersonStance and StanceDirection types', () => {
    // Compile-time check: if types aren't exported, this file won't compile
    const stance: PersonStance = {
      topic: 'test',
      direction: 'supports' as StanceDirection,
      summary: 'test',
      evidenceQuote: 'test',
      justification: 'test justification',
      source: 'test.md',
      date: '2026-01-01',
    };
    assert.ok(stance);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<PersonActionItem> & { text: string; direction: ActionItemDirection }): PersonActionItem {
  const { text, direction, source = 'meeting.md', date = '2026-01-15', hash, stale = false } = overrides;
  return {
    text,
    direction,
    source,
    date,
    hash: hash ?? computeActionItemHash(text, 'alice', direction),
    stale,
  };
}

// ---------------------------------------------------------------------------
// computeActionItemHash
// ---------------------------------------------------------------------------

describe('computeActionItemHash', () => {
  it('produces a hex string', () => {
    const h = computeActionItemHash('send report', 'alice', 'i_owe_them');
    assert.match(h, /^[a-f0-9]{64}$/);
  });

  it('normalizes whitespace and case', () => {
    const a = computeActionItemHash('  Send  Report  ', 'alice', 'i_owe_them');
    const b = computeActionItemHash('send report', 'alice', 'i_owe_them');
    assert.equal(a, b);
  });

  it('differs by direction', () => {
    const a = computeActionItemHash('send report', 'alice', 'i_owe_them');
    const b = computeActionItemHash('send report', 'alice', 'they_owe_me');
    assert.notEqual(a, b);
  });

  it('differs by personSlug', () => {
    const a = computeActionItemHash('send report', 'alice', 'i_owe_them');
    const b = computeActionItemHash('send report', 'bob', 'i_owe_them');
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// isActionItemStale
// ---------------------------------------------------------------------------

describe('isActionItemStale', () => {
  it('returns false for a recent item', () => {
    const item = makeItem({ text: 'test', direction: 'i_owe_them', date: '2026-02-20' });
    const ref = new Date('2026-02-25');
    assert.equal(isActionItemStale(item, ref), false);
  });

  it('returns true for an item older than 30 days', () => {
    const item = makeItem({ text: 'test', direction: 'i_owe_them', date: '2026-01-01' });
    const ref = new Date('2026-02-15');
    assert.equal(isActionItemStale(item, ref), true);
  });

  it('returns true for exactly 30 days boundary (> 30)', () => {
    const item = makeItem({ text: 'test', direction: 'i_owe_them', date: '2026-01-15' });
    // Exactly 30 days: not stale (30 is not > 30)
    const ref30 = new Date('2026-02-14');
    assert.equal(isActionItemStale(item, ref30), false);
    // 31 days: stale
    const ref31 = new Date('2026-02-15');
    assert.equal(isActionItemStale(item, ref31), true);
  });

  it('returns true for invalid date', () => {
    const item = makeItem({ text: 'test', direction: 'i_owe_them', date: 'not-a-date' });
    assert.equal(isActionItemStale(item), true);
  });
});

// ---------------------------------------------------------------------------
// capActionItems
// ---------------------------------------------------------------------------

describe('capActionItems', () => {
  it('keeps at most N per direction', () => {
    const items: PersonActionItem[] = [];
    for (let i = 0; i < 15; i++) {
      items.push(makeItem({
        text: `task i_owe ${i}`,
        direction: 'i_owe_them',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));
    }
    for (let i = 0; i < 12; i++) {
      items.push(makeItem({
        text: `task they_owe ${i}`,
        direction: 'they_owe_me',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));
    }

    const capped = capActionItems(items, 10);
    const iOwe = capped.filter((i) => i.direction === 'i_owe_them');
    const theyOwe = capped.filter((i) => i.direction === 'they_owe_me');
    assert.equal(iOwe.length, 10);
    assert.equal(theyOwe.length, 10);
  });

  it('keeps most recent items', () => {
    const items = [
      makeItem({ text: 'old', direction: 'i_owe_them', date: '2026-01-01' }),
      makeItem({ text: 'new', direction: 'i_owe_them', date: '2026-02-01' }),
    ];
    const capped = capActionItems(items, 1);
    const iOwe = capped.filter((i) => i.direction === 'i_owe_them');
    assert.equal(iOwe.length, 1);
    assert.equal(iOwe[0].text, 'new');
  });

  it('defaults to 10 per direction', () => {
    const items: PersonActionItem[] = [];
    for (let i = 0; i < 20; i++) {
      items.push(makeItem({
        text: `task ${i}`,
        direction: 'i_owe_them',
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));
    }
    const capped = capActionItems(items);
    assert.equal(capped.filter((i) => i.direction === 'i_owe_them').length, 10);
  });
});

// ---------------------------------------------------------------------------
// deduplicateActionItems
// ---------------------------------------------------------------------------

describe('deduplicateActionItems', () => {
  it('merges non-duplicate items', () => {
    const existing = [makeItem({ text: 'task A', direction: 'i_owe_them' })];
    const newItems = [makeItem({ text: 'task B', direction: 'i_owe_them' })];
    const result = deduplicateActionItems(existing, newItems);
    assert.equal(result.length, 2);
  });

  it('skips items with matching hash', () => {
    const item = makeItem({ text: 'task A', direction: 'i_owe_them' });
    const duplicate = { ...item };
    const result = deduplicateActionItems([item], [duplicate]);
    assert.equal(result.length, 1);
  });

  it('re-extraction of same content does not duplicate', () => {
    const existing = [
      makeItem({ text: 'send report to Alice', direction: 'i_owe_them' }),
    ];
    // Same text, same direction → same hash
    const reExtracted = [
      makeItem({ text: 'send report to Alice', direction: 'i_owe_them' }),
    ];
    const result = deduplicateActionItems(existing, reExtracted);
    assert.equal(result.length, 1);
  });
});
