import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStancePrompt,
  parseStanceResponse,
  extractStancesForPerson,
  buildActionItemPrompt,
  parseActionItemResponse,
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
// extractActionItemsForPerson — regex fallback (no callLLM)
// ---------------------------------------------------------------------------

describe('extractActionItemsForPerson', () => {
  it('extracts "Person will" pattern as they_owe_me', async () => {
    const content = 'Alice will send the updated report by Friday.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
    assert.equal(items[0].source, 'meeting.md');
    assert.equal(items[0].date, '2026-02-01');
  });

  it('extracts "Person agreed to" pattern as they_owe_me', async () => {
    const content = 'Alice agreed to review the design doc.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "Person is going to" as they_owe_me', async () => {
    const content = 'Alice is going to set up the staging environment.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "I\'ll" near person as i_owe_them', async () => {
    const content = "I'll send Alice the final proposal tomorrow.";
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts "I need to send person" as i_owe_them', async () => {
    const content = 'I need to send Alice the budget spreadsheet.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts "I agreed to" near person as i_owe_them', async () => {
    const content = 'I agreed to follow up with Alice on the timeline.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('extracts explicit "Action item:" near person', async () => {
    const content = 'Action item: Alice to review the PRD draft.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('extracts "TODO:" near person', async () => {
    const content = 'TODO: Get feedback from Alice on the mockups.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
  });

  it('extracts "- [ ]" checkbox near person', async () => {
    const content = '- [ ] Alice to prepare the presentation slides.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- owner name classification (ownerName is now 6th arg) --

  it('classifies owner in actor position as i_owe_them', async () => {
    const content = 'John will schedule a follow-up with Alice next week.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01', undefined, 'John');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  it('classifies person in actor position as they_owe_me even when owner provided', async () => {
    const content = 'Alice will send the report to the team.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01', undefined, 'John');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- no owner fallback --

  it('falls back to first-person heuristics when no owner name', async () => {
    const content = "I'll follow up with Alice about the contract.";
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'i_owe_them');
  });

  // -- ambiguous actor --

  it('handles ambiguous actor in explicit marker (defaults to they_owe_me when person mentioned)', async () => {
    // No clear actor, but person is mentioned
    const content = 'Action item: schedule review meeting with Alice.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    // Ambiguous but person mentioned → they_owe_me
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- multiple items --

  it('extracts multiple action items from one meeting', async () => {
    const content = [
      'Alice will send the updated report by Friday.',
      "I'll review Alice's draft by Monday.",
      'Alice agreed to set up the demo environment.',
    ].join('\n');
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.ok(items.length >= 2, `Expected at least 2 items, got ${items.length}`);
    const directions = new Set(items.map((i) => i.direction));
    assert.ok(directions.has('they_owe_me'));
    assert.ok(directions.has('i_owe_them'));
  });

  // -- no matches --

  it('returns empty array when person not mentioned', async () => {
    const content = 'Bob will send the report.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 0);
  });

  // -- dedup within same extraction --

  it('does not duplicate same text within one extraction', async () => {
    const content = [
      'Alice will send the report.',
      'Alice will send the report.',
    ].join('\n');
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
  });

  // -- first name matching --

  it('matches by first name for multi-word person names', async () => {
    const content = 'Alice will prepare the quarterly summary.';
    const items = await extractActionItemsForPerson(content, 'Alice Johnson', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.equal(items[0].direction, 'they_owe_me');
  });

  // -- hash is populated --

  it('populates hash field on extracted items', async () => {
    const content = 'Alice will send the report.';
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.equal(items.length, 1);
    assert.match(items[0].hash, /^[a-f0-9]{64}$/);
  });

  // -- regression guard: regex fallback when callLLM not provided --

  it('regression guard: when callLLM not provided, regex runs and returns results', async () => {
    const content = 'Alice will send the quarterly report.';
    // No callLLM arg — must use regex fallback and return results (not empty array)
    const items = await extractActionItemsForPerson(content, 'Alice', 'meeting.md', '2026-02-01');
    assert.ok(items.length > 0, 'Expected regex fallback to return items, got empty array');
    assert.equal(items[0].direction, 'they_owe_me');
  });
});

// ---------------------------------------------------------------------------
// buildActionItemPrompt
// ---------------------------------------------------------------------------

describe('buildActionItemPrompt', () => {
  it('includes the person name', () => {
    const prompt = buildActionItemPrompt('Some transcript', 'Sarah Chen');
    assert.ok(prompt.includes('Sarah Chen'));
  });

  it('includes the transcript content', () => {
    const prompt = buildActionItemPrompt('Alice: I will send the slides.', 'Alice');
    assert.ok(prompt.includes('Alice: I will send the slides.'));
  });

  it('includes JSON schema with action_items array', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.includes('"action_items"'));
    assert.ok(prompt.includes('"text"'));
    assert.ok(prompt.includes('"direction"'));
  });

  it('includes direction enum values', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.includes('i_owe_them'));
    assert.ok(prompt.includes('they_owe_me'));
  });

  it('includes NOT-a-description guard rule', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.includes('NOT a description'));
  });

  it('includes commitment definition rule', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.toLowerCase().includes('commitment is a promise'));
  });

  it('instructs to exclude architecture walkthroughs', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.includes('architecture'));
  });

  it('requests concise normalized description (not raw transcript)', () => {
    const prompt = buildActionItemPrompt('content', 'Bob');
    assert.ok(prompt.includes('concise'));
  });
});

// ---------------------------------------------------------------------------
// parseActionItemResponse
// ---------------------------------------------------------------------------

describe('parseActionItemResponse', () => {
  it('parses valid JSON with complete action items', () => {
    const response = JSON.stringify({
      action_items: [
        { text: 'Send the quarterly slides', direction: 'i_owe_them' },
        { text: 'Schedule the offsite', direction: 'they_owe_me' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 2);
    assert.equal(result[0].text, 'Send the quarterly slides');
    assert.equal(result[0].direction, 'i_owe_them');
    assert.equal(result[1].text, 'Schedule the offsite');
    assert.equal(result[1].direction, 'they_owe_me');
  });

  it('handles empty action_items array', () => {
    const result = parseActionItemResponse(JSON.stringify({ action_items: [] }));
    assert.deepEqual(result, []);
  });

  it('handles malformed JSON', () => {
    const result = parseActionItemResponse('This is not JSON at all.');
    assert.deepEqual(result, []);
  });

  it('handles empty string', () => {
    const result = parseActionItemResponse('');
    assert.deepEqual(result, []);
  });

  it('handles JSON without action_items key', () => {
    const result = parseActionItemResponse(JSON.stringify({ summary: 'No items here.' }));
    assert.deepEqual(result, []);
  });

  it('strips markdown code fences (json label)', () => {
    const response = '```json\n{"action_items": [{"text": "Review the PRD", "direction": "they_owe_me"}]}\n```';
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Review the PRD');
    assert.equal(result[0].direction, 'they_owe_me');
  });

  it('strips code fences without json label', () => {
    const response = '```\n{"action_items": [{"text": "Set up CI", "direction": "they_owe_me"}]}\n```';
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Set up CI');
  });

  it('extracts JSON from surrounding text', () => {
    const response = 'Here are the commitments:\n{"action_items": [{"text": "Send proposal", "direction": "i_owe_them"}]}\nDone.';
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'i_owe_them');
  });

  it('skips items with missing text field', () => {
    const response = JSON.stringify({
      action_items: [
        { direction: 'i_owe_them' },
        { text: 'Valid item', direction: 'they_owe_me' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Valid item');
  });

  it('skips items with missing direction field', () => {
    const response = JSON.stringify({
      action_items: [
        { text: 'No direction here' },
        { text: 'Has direction', direction: 'i_owe_them' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Has direction');
  });

  it('skips items with invalid direction', () => {
    const response = JSON.stringify({
      action_items: [
        { text: 'Some item', direction: 'supports' },
        { text: 'Valid item', direction: 'i_owe_them' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'i_owe_them');
  });

  it('skips non-object items in the array', () => {
    const response = JSON.stringify({
      action_items: [
        null,
        'not an object',
        42,
        { text: 'Real item', direction: 'they_owe_me' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Real item');
  });

  it('trims whitespace from text and direction', () => {
    const response = JSON.stringify({
      action_items: [
        { text: '  Send slides  ', direction: '  i_owe_them  ' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Send slides');
    assert.equal(result[0].direction, 'i_owe_them');
  });

  it('normalizes direction to lowercase', () => {
    const response = JSON.stringify({
      action_items: [
        { text: 'Do something', direction: 'I_OWE_THEM' },
      ],
    });
    const result = parseActionItemResponse(response);
    assert.equal(result.length, 1);
    assert.equal(result[0].direction, 'i_owe_them');
  });
});

// ---------------------------------------------------------------------------
// extractActionItemsForPerson — LLM path (with callLLM)
// ---------------------------------------------------------------------------

describe('extractActionItemsForPerson (LLM path)', () => {
  it('calls LLM and returns typed PersonActionItems', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        action_items: [
          { text: 'Send the quarterly slides to Alice', direction: 'i_owe_them' },
          { text: 'Jira walkthrough with Alice', direction: 'they_owe_me' },
        ],
      });

    const items = await extractActionItemsForPerson(
      'Meeting content about Alice.',
      'Alice',
      'q1-meeting.md',
      '2026-03-01',
      mockLLM,
    );

    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'Send the quarterly slides to Alice');
    assert.equal(items[0].direction, 'i_owe_them');
    assert.equal(items[0].source, 'q1-meeting.md');
    assert.equal(items[0].date, '2026-03-01');
    assert.equal(items[0].stale, false);
    assert.match(items[0].hash, /^[a-f0-9]{64}$/);
    assert.equal(items[1].direction, 'they_owe_me');
  });

  it('passes person name and content to the prompt', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ action_items: [] });
    };

    await extractActionItemsForPerson(
      'Alice: I will send the slides.',
      'Alice Johnson',
      'meeting.md',
      '2026-03-01',
      mockLLM,
    );
    assert.ok(capturedPrompt.includes('Alice Johnson'));
    assert.ok(capturedPrompt.includes('Alice: I will send the slides.'));
  });

  it('returns empty array for empty content (LLM not called)', async () => {
    let called = false;
    const mockLLM: LLMCallFn = async () => {
      called = true;
      throw new Error('Should not be called');
    };
    const items = await extractActionItemsForPerson('', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.equal(called, false);
    assert.deepEqual(items, []);
  });

  it('returns empty array for empty person name (LLM not called)', async () => {
    let called = false;
    const mockLLM: LLMCallFn = async () => {
      called = true;
      throw new Error('Should not be called');
    };
    const items = await extractActionItemsForPerson('Content here.', '', 'meeting.md', '2026-03-01', mockLLM);
    assert.equal(called, false);
    assert.deepEqual(items, []);
  });

  it('returns empty array when LLM returns empty action_items', async () => {
    const mockLLM: LLMCallFn = async () => JSON.stringify({ action_items: [] });
    const items = await extractActionItemsForPerson('Content.', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.deepEqual(items, []);
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const mockLLM: LLMCallFn = async () => 'I cannot process this transcript.';
    const items = await extractActionItemsForPerson('Content.', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.deepEqual(items, []);
  });

  it('returns empty array when LLM call throws', async () => {
    const mockLLM: LLMCallFn = async () => { throw new Error('Network error'); };
    const items = await extractActionItemsForPerson('Content.', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.deepEqual(items, []);
  });

  it('handles LLM returning code-fenced JSON', async () => {
    const mockLLM: LLMCallFn = async () =>
      '```json\n{"action_items": [{"text": "Organize offsite", "direction": "they_owe_me"}]}\n```';

    const items = await extractActionItemsForPerson('Content.', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'Organize offsite');
    assert.equal(items[0].direction, 'they_owe_me');
  });

  it('skips LLM items with invalid direction', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        action_items: [
          { text: 'Bad direction item', direction: 'supports' },
          { text: 'Valid item', direction: 'i_owe_them' },
        ],
      });

    const items = await extractActionItemsForPerson('Content.', 'Alice', 'meeting.md', '2026-03-01', mockLLM);
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'Valid item');
  });

  it('populates source, date, hash, and stale fields on LLM items', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        action_items: [{ text: 'Share design doc', direction: 'i_owe_them' }],
      });

    const items = await extractActionItemsForPerson(
      'Content.',
      'Alice',
      'sprint-retro.md',
      '2026-03-15',
      mockLLM,
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].source, 'sprint-retro.md');
    assert.equal(items[0].date, '2026-03-15');
    assert.equal(items[0].stale, false);
    assert.match(items[0].hash, /^[a-f0-9]{64}$/);
  });
});
