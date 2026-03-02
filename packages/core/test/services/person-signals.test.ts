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
  extractActionItemsForPerson,
} from '../../src/services/person-signals.js';
import type {
  LLMCallFn,
  PersonStance,
  StanceDirection,
  PersonActionItem,
  ActionItemDirection,
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
    assert.ok(prompt.toLowerCase().includes('if uncertain'));
    assert.ok(prompt.toLowerCase().includes('omit'));
  });

  it('instructs to extract only for the named person', () => {
    const prompt = buildStancePrompt('content', 'Alice');
    assert.ok(prompt.includes('Extract stances ONLY for: Alice'));
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
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'React adoption');
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].summary, 'Advocates for using React over Vue.');
    assert.equal(result[0].evidenceQuote, 'I think React is the better choice for our team.');
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
        },
        {
          topic: 'Monolith',
          direction: 'opposes',
          summary: 'Against monolith.',
          evidence_quote: 'The monolith approach will slow us down.',
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
    const response = '```json\n{"stances": [{"topic": "Testing", "direction": "supports", "summary": "Likes tests.", "evidence_quote": "We need more tests."}]}\n```';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Testing');
  });

  it('strips code fences without json label', () => {
    const response = '```\n{"stances": [{"topic": "CI", "direction": "supports", "summary": "Wants CI.", "evidence_quote": "Let us set up CI."}]}\n```';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'CI');
  });

  it('extracts JSON from surrounding text', () => {
    const response = 'Here are the stances:\n{"stances": [{"topic": "API", "direction": "concerned", "summary": "Worried about API.", "evidence_quote": "The API concerns me."}]}\nDone.';
    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'concerned');
  });

  it('skips stances with missing required fields', () => {
    const response = JSON.stringify({
      stances: [
        { direction: 'supports', summary: 'No topic.', evidence_quote: 'Quote.' },
        { topic: 'Valid', direction: 'supports', summary: 'Has topic.', evidence_quote: 'Quote.' },
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
        },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'React');
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[0].summary, 'Likes React.');
    assert.equal(result[0].evidenceQuote, 'React is great.');
  });

  it('handles non-object items in stances array', () => {
    const response = JSON.stringify({
      stances: [null, 'not an object', 42, { topic: 'Valid', direction: 'supports', summary: 'OK.', evidence_quote: 'Quote.' }],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'Valid');
  });

  it('normalizes direction to lowercase', () => {
    const response = JSON.stringify({
      stances: [
        { topic: 'Testing', direction: 'Supports', summary: 'Likes it.', evidence_quote: 'Quote.' },
      ],
    });

    const result = parseStanceResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'supports');
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
      '```json\n{"stances": [{"topic": "TypeScript", "direction": "supports", "summary": "Prefers TS.", "evidence_quote": "TypeScript catches bugs early."}]}\n```';

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
          { topic: 'Remote work', direction: 'supports', summary: 'Prefers remote.', evidence_quote: 'I work better from home.' },
          { topic: 'Open offices', direction: 'opposes', summary: 'Dislikes open offices.', evidence_quote: 'Open offices are too noisy.' },
          { topic: 'Budget cuts', direction: 'concerned', summary: 'Worried about budget.', evidence_quote: 'The budget cuts concern me.' },
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

// ---------------------------------------------------------------------------
// extractActionItemsForPerson — happy path
// ---------------------------------------------------------------------------

describe('extractActionItemsForPerson', () => {
  it('extracts "Person will" pattern as they_owe_me', () => {
    const content = 'Alice will send the updated report by Friday.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
    assert.equal(items[0].source, 'meeting.md');
    assert.equal(items[0].date, '2026-02-01');
  });

  it('extracts "Person agreed to" pattern as they_owe_me', () => {
    const content = 'Alice agreed to review the design doc.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "Person is going to" as they_owe_me', () => {
    const content = 'Alice is going to set up the staging environment.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "I\'ll" near person as i_owe_them', () => {
    const content = "I'll send Alice the final proposal tomorrow.";
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts "I need to send person" as i_owe_them', () => {
    const content = 'I need to send Alice the budget spreadsheet.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts "I agreed to" near person as i_owe_them', () => {
    const content = 'I agreed to follow up with Alice on the timeline.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts explicit "Action item:" near person', () => {
    const content = 'Action item: Alice to review the PRD draft.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "TODO:" near person', () => {
    const content = 'TODO: Get feedback from Alice on the mockups.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
  });

  it('extracts "- [ ]" checkbox near person', () => {
    const content = '- [ ] Alice to prepare the presentation slides.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- owner name classification --

  it('classifies owner in actor position as i_owe_them', () => {
    const content = 'John will schedule a follow-up with Alice next week.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01', 'John');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('classifies person in actor position as they_owe_me even when owner provided', () => {
    const content = 'Alice will send the report to the team.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01', 'John');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- no owner fallback --

  it('falls back to first-person heuristics when no owner name', () => {
    const content = "I'll follow up with Alice about the contract.";
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  // -- ambiguous actor --

  it('handles ambiguous actor in explicit marker (defaults to they_owe_me when person mentioned)', () => {
    // No clear actor, but person is mentioned
    const content = 'Action item: schedule review meeting with Alice.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    // Ambiguous but person mentioned → they_owe_me
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- multiple items --

  it('extracts multiple action items from one meeting', () => {
    const content = [
      'Alice will send the updated report by Friday.',
      "I'll review Alice's draft by Monday.",
      'Alice agreed to set up the demo environment.',
    ].join('\n');
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.ok(items.length >= 2, `Expected at least 2 items, got ${items.length}`);
    const directions = new Set(items.map((i) => i.direction));
    assert.ok(directions.has('they_owe_me'));
    assert.ok(directions.has('i_owe_them'));
  });

  // -- no matches --

  it('returns empty array when person not mentioned', () => {
    const content = 'Bob will send the report.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 0);
  });

  // -- dedup within same extraction --

  it('does not duplicate same text within one extraction', () => {
    const content = [
      'Alice will send the report.',
      'Alice will send the report.',
    ].join('\n');
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
  });

  // -- first name matching --

  it('matches by first name for multi-word person names', () => {
    const content = 'Alice will prepare the quarterly summary.';
    const items = extractActionItemsForPerson(content, 'Alice Johnson', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- hash is populated --

  it('populates hash field on extracted items', () => {
    const content = 'Alice will send the report.';
    const items = extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.match(items[0].hash, /^[a-f0-9]{64}$/);
  });
});
