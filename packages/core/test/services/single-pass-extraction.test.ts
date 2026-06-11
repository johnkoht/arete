/**
 * single-pass-extraction W1/W2/W3 tests.
 *
 * Covers:
 * - new-schema parsing (importance, ⚠, direction none, open_questions,
 *   continuation_of/supersedes) in single_pass mode
 * - LEGACY REGRESSION: the same parser inputs through the legacy path are
 *   bit-identical to pre-W1 behavior (the overarching invariant)
 * - no caps + telemetry-only detectors in single_pass mode (D1/D4)
 * - tier-derived auto-approval (pre-mortem risk 1)
 * - low-confidence items persist pending instead of silently dropping (AC8)
 * - direction `none` inertness (D7): meeting-parser skip, commitments.sync
 *   guard, staged-items `·` round-trip
 * - single-pass prompt content (W2): mark-don't-skip framing, closeability,
 *   tiers, ⚠ channel
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMeetingExtractionResponse,
  formatStagedSections,
  buildSinglePassExtractionPrompt,
  buildKnownItemsSection,
  updateMeetingContent,
  SINGLE_PASS_STAGED_HEADERS,
  CATEGORY_LIMITS,
} from '../../src/services/meeting-extraction.js';
import type { PriorItem } from '../../src/services/meeting-extraction.js';
import {
  processMeetingExtraction,
  formatFilteredStagedSections,
} from '../../src/services/meeting-processing.js';
import { parseActionItemsFromMeeting } from '../../src/services/meeting-parser.js';
import { parseStagedSections, parseStagedItemOwner } from '../../src/integrations/staged-items.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A single-pass-shaped LLM response exercising every new schema field. */
const SINGLE_PASS_RESPONSE = JSON.stringify({
  summary: 'Compliance workshop covering license rollout.',
  action_items: [
    {
      owner: 'John Koht',
      owner_slug: 'john-koht',
      description: 'John to send Kim the letter template before Friday',
      direction: 'i_owe_them',
      counterparty_slug: 'kim-h',
      confidence: 0.9,
      importance: 'blocker',
    },
    {
      owner: 'Anthony Avina',
      owner_slug: 'anthony-avina',
      description: 'Anthony to start recipient-table TDD with completion when spec is merged',
      direction: 'they_owe_me',
      confidence: 0.8,
      importance: 'high',
      continuation_of: 'acc2a220',
    },
    {
      owner: 'Tim Eng',
      owner_slug: 'tim-eng',
      description: 'Tim to fix case-sensitivity bug in state abbreviations',
      direction: 'none',
      confidence: 0.7,
      importance: 'normal',
      uncertain: true,
      uncertainty_reason: 'routine eng work, may not be John-relevant',
    },
  ],
  next_steps: [],
  decisions: [
    {
      text: 'V1 defaults to per-exposure, no consolidation',
      confidence: 0.85,
      importance: 'high',
      supersedes: 'de_002 (Anthony 1:1: may default per-exposure)',
    },
  ],
  learnings: [
    { text: 'Kafka consumers process serially per partition', confidence: 0.8, importance: 'normal' },
  ],
  open_questions: ['Does the CA adverse-decision trigger apply to subro?'],
  topics: ['glance-compliance'],
});

/** Legacy-shaped response containing a `none` direction + 12 action items (over cap). */
function legacyOverCapResponse(): string {
  const items = [];
  for (let i = 0; i < 12; i++) {
    items.push({
      owner: `Person ${i}`,
      owner_slug: `person-${i}`,
      description: `Distinct deliverable number ${i} about workstream ${String.fromCharCode(65 + i)}`,
      direction: 'i_owe_them',
      confidence: 0.9,
    });
  }
  items.push({
    owner: 'Tim Eng',
    owner_slug: 'tim-eng',
    description: 'Team-internal item with no owner-relative direction',
    direction: 'none',
    confidence: 0.9,
  });
  return JSON.stringify({
    summary: 'Big meeting.',
    action_items: items,
    next_steps: [],
    decisions: [],
    learnings: [],
  });
}

// ---------------------------------------------------------------------------
// Parser — single_pass mode
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse — single_pass mode', () => {
  it('parses importance, uncertain, uncertainty_reason, continuation_of, supersedes', () => {
    const result = parseMeetingExtractionResponse(
      SINGLE_PASS_RESPONSE, CATEGORY_LIMITS, 'john-koht', { singlePass: true },
    );
    const [a1, a2, a3] = result.intelligence.actionItems;
    assert.equal(a1.importance, 'blocker');
    assert.equal(a2.importance, 'high');
    assert.equal(a2.continuationOf, 'acc2a220');
    assert.equal(a3.direction, 'none');
    assert.equal(a3.uncertain, true);
    assert.equal(a3.uncertaintyReason, 'routine eng work, may not be John-relevant');
    assert.equal(result.intelligence.decisionMeta?.[0]?.importance, 'high');
    assert.ok(result.intelligence.decisionMeta?.[0]?.supersedes?.includes('de_002'));
    assert.deepEqual(result.intelligence.openQuestions, [
      'Does the CA adverse-decision trigger apply to subro?',
    ]);
  });

  it('accepts direction none without dropping the item', () => {
    const result = parseMeetingExtractionResponse(
      SINGLE_PASS_RESPONSE, CATEGORY_LIMITS, 'john-koht', { singlePass: true },
    );
    assert.equal(result.intelligence.actionItems.length, 3);
    assert.equal(result.validationWarnings.length, 0);
  });

  it('defaults an invalid direction to none with telemetry (never i_owe_them)', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a', description: 'Do the thing with a real completion state',
        direction: 'sideways', confidence: 0.9,
      }],
      next_steps: [], decisions: [], learnings: [],
    });
    const result = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, undefined, { singlePass: true });
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].direction, 'none');
    assert.ok(result.telemetryEvents?.some(e => e.detector === 'invalid_direction'));
  });

  it('applies NO category caps (D1)', () => {
    const result = parseMeetingExtractionResponse(
      legacyOverCapResponse(), CATEGORY_LIMITS, undefined, { singlePass: true },
    );
    // 12 directional + 1 none — all kept
    assert.equal(result.intelligence.actionItems.length, 13);
    assert.ok(!result.validationWarnings.some(w => w.reason.includes('exceeds action item limit')));
  });

  it('flips trivial/garbage filters to telemetry-only (D4) — items kept', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a',
        description: 'Follow up with legal about the indemnity clause by Tuesday',
        direction: 'i_owe_them', confidence: 0.9,
      }],
      next_steps: [],
      decisions: [{ text: 'We discussed the roadmap at length', confidence: 0.8 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, undefined, { singlePass: true });
    // "Follow up..." matches TRIVIAL_PATTERNS; "We discussed..." matches trivial decisions.
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.decisions.length, 1);
    const detectors = (result.telemetryEvents ?? []).map(e => e.detector);
    assert.ok(detectors.includes('trivial_pattern'));
  });

  it('keeps BOTH sides of a mirror pair and fires mirror_pair telemetry', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [
        {
          owner: 'John', owner_slug: 'john-koht',
          description: 'John to send the compliance data to Anthony for the recipient table review',
          direction: 'i_owe_them', confidence: 0.9,
        },
        {
          owner: 'Anthony', owner_slug: 'anthony-avina',
          description: 'John to send the compliance data to Anthony for the recipient table review',
          direction: 'they_owe_me', confidence: 0.9,
        },
      ],
      next_steps: [], decisions: [], learnings: [],
    });
    const result = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, 'john-koht', { singlePass: true });
    assert.equal(result.intelligence.actionItems.length, 2, 'both sides kept');
    assert.ok(result.telemetryEvents?.some(e => e.detector === 'mirror_pair'));
    // Visibility contract: the staged render flags the suspects.
    const staged = formatStagedSections(result);
    assert.ok(staged.includes('## Parser-flagged (mirror-pair suspects)'));
  });

  it('renders Open Questions as oq_NNN section', () => {
    const result = parseMeetingExtractionResponse(
      SINGLE_PASS_RESPONSE, CATEGORY_LIMITS, 'john-koht', { singlePass: true },
    );
    const staged = formatStagedSections(result);
    assert.ok(staged.includes('## Open Questions'));
    assert.ok(staged.includes('- oq_001: Does the CA adverse-decision trigger apply to subro?'));
  });

  it('renders direction none with the · marker (not an arrow)', () => {
    const result = parseMeetingExtractionResponse(
      SINGLE_PASS_RESPONSE, CATEGORY_LIMITS, 'john-koht', { singlePass: true },
    );
    const staged = formatStagedSections(result);
    assert.ok(staged.includes('[@tim-eng ·]'));
    assert.ok(!staged.includes('[@tim-eng →'));
    assert.ok(!staged.includes('[@tim-eng ←'));
  });
});

// ---------------------------------------------------------------------------
// Parser — LEGACY REGRESSION (the overarching invariant)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse — legacy mode unchanged (regression)', () => {
  it('legacy still drops direction none with the same warning as pre-W1', () => {
    const result = parseMeetingExtractionResponse(legacyOverCapResponse(), CATEGORY_LIMITS);
    // Caps applied: 10 of 12 directional kept; the `none` item dropped earlier
    // with the legacy invalid-direction warning.
    assert.equal(result.intelligence.actionItems.length, 10);
    assert.ok(result.validationWarnings.some(w => w.reason === 'invalid direction "none"'));
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds action item limit (10)')));
    // No telemetry channel in legacy results.
    assert.equal(result.telemetryEvents, undefined);
  });

  it('legacy fixture meeting: parse → process → format output is byte-stable', () => {
    // A frozen end-to-end legacy fixture. If ANY W1 change alters legacy
    // behavior, this golden string comparison fails.
    const response = JSON.stringify({
      summary: 'Weekly sync on rollout.',
      action_items: [
        {
          owner: 'John Koht', owner_slug: 'john-koht',
          description: 'John to send API docs to Sarah by Friday',
          direction: 'i_owe_them', counterparty_slug: 'sarah-chen', confidence: 0.95,
        },
        {
          owner: 'Sarah Chen', owner_slug: 'sarah-chen',
          description: 'Sarah to review the migration proposal',
          direction: 'they_owe_me', confidence: 0.7,
        },
      ],
      next_steps: ['Kick off migration next sprint'],
      decisions: [{ text: 'We decided to adopt PostgreSQL over MongoDB', confidence: 0.9 }],
      learnings: [{ text: 'Batch processing reduces errors by 40%', confidence: 0.85 }],
    });
    const parsed = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, 'john-koht');
    const processed = processMeetingExtraction(parsed, '');
    const formatted = formatFilteredStagedSections(
      processed.filteredItems,
      parsed.intelligence.summary,
    );

    assert.equal(formatted, [
      '## Summary',
      'Weekly sync on rollout.',
      '',
      '## Staged Action Items',
      '- ai_001: John to send API docs to Sarah by Friday',
      '- ai_002: Sarah to review the migration proposal',
      '',
      '## Staged Decisions',
      '- de_001: We decided to adopt PostgreSQL over MongoDB',
      '',
      '## Staged Learnings',
      '- le_001: Batch processing reduces errors by 40%',
      '',
    ].join('\n'));

    // Legacy approval semantics: confidence > 0.8 auto-approves.
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
    assert.equal(processed.stagedItemStatus['ai_002'], 'pending');
    assert.equal(processed.stagedItemStatus['de_001'], 'approved');
    // No single-pass maps leak into legacy results.
    assert.equal(processed.stagedItemImportance, undefined);
    assert.equal(processed.stagedItemUncertainReason, undefined);
    assert.equal(processed.stagedItemLinks, undefined);
  });

  it('legacy drops sub-0.65-confidence items (pre-W1 behavior preserved)', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a', description: 'Low confidence deliverable with owner',
        direction: 'i_owe_them', confidence: 0.5,
      }],
      next_steps: [], decisions: [], learnings: [],
    });
    const parsed = parseMeetingExtractionResponse(response, CATEGORY_LIMITS);
    const processed = processMeetingExtraction(parsed, '');
    assert.equal(processed.filteredItems.length, 0);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction — single_pass tier approval (risk 1) + AC8
// ---------------------------------------------------------------------------

describe('processMeetingExtraction — single_pass', () => {
  function processedSinglePass() {
    const parsed = parseMeetingExtractionResponse(
      SINGLE_PASS_RESPONSE, CATEGORY_LIMITS, 'john-koht', { singlePass: true },
    );
    return processMeetingExtraction(parsed, '', { singlePass: true });
  }

  it('ONLY non-⚠ blockers auto-approve; high/normal/uncertain stage pending', () => {
    const p = processedSinglePass();
    assert.equal(p.stagedItemStatus['ai_001'], 'approved');  // blocker
    assert.equal(p.stagedItemStatus['ai_002'], 'pending');   // high
    assert.equal(p.stagedItemStatus['ai_003'], 'pending');   // normal + ⚠
    assert.equal(p.stagedItemStatus['de_001'], 'pending');   // high decision
    assert.equal(p.stagedItemStatus['le_001'], 'pending');   // normal learning
  });

  it('records importance / uncertainty / link maps for frontmatter persistence', () => {
    const p = processedSinglePass();
    assert.equal(p.stagedItemImportance?.['ai_001'], 'blocker');
    assert.equal(p.stagedItemImportance?.['ai_002'], 'high');
    assert.equal(p.stagedItemUncertainReason?.['ai_003'], 'routine eng work, may not be John-relevant');
    assert.equal(p.stagedItemLinks?.['ai_002']?.continuationOf, 'acc2a220');
    assert.ok(p.stagedItemLinks?.['de_001']?.supersedes?.includes('de_002'));
  });

  it('an uncertain blocker does NOT auto-approve', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a', description: 'Launch gate item that might be a blocker',
        direction: 'i_owe_them', confidence: 0.9, importance: 'blocker',
        uncertain: true, uncertainty_reason: 'might be already handled',
      }],
      next_steps: [], decisions: [], learnings: [],
    });
    const parsed = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, undefined, { singlePass: true });
    const p = processMeetingExtraction(parsed, '', { singlePass: true });
    assert.equal(p.stagedItemStatus['ai_001'], 'pending');
  });

  it('high confidence alone never auto-approves in single_pass (confidence is telemetry)', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a', description: 'Very confident but only normal importance',
        direction: 'i_owe_them', confidence: 0.99, importance: 'normal',
      }],
      next_steps: [], decisions: [], learnings: [],
    });
    const parsed = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, undefined, { singlePass: true });
    const p = processMeetingExtraction(parsed, '', { singlePass: true });
    assert.equal(p.stagedItemStatus['ai_001'], 'pending');
    assert.equal(p.stagedItemConfidence['ai_001'], 0.99);
  });

  it('AC8: low-confidence items persist as pending instead of silently dropping', () => {
    const response = JSON.stringify({
      summary: 's',
      action_items: [{
        owner: 'A', owner_slug: 'a', description: 'Low confidence deliverable with owner',
        direction: 'i_owe_them', confidence: 0.5, importance: 'blocker',
      }],
      next_steps: [], decisions: [], learnings: [],
    });
    const parsed = parseMeetingExtractionResponse(response, CATEGORY_LIMITS, undefined, { singlePass: true });
    const p = processMeetingExtraction(parsed, '', { singlePass: true });
    assert.equal(p.filteredItems.length, 1, 'item persists');
    // Low confidence forces pending even for a blocker.
    assert.equal(p.stagedItemStatus['ai_001'], 'pending');
  });
});

// ---------------------------------------------------------------------------
// direction none inertness (D7)
// ---------------------------------------------------------------------------

describe('direction none inertness (D7)', () => {
  it('meeting-parser skips ·-marked lines in Approved sections entirely', () => {
    const content = [
      '---',
      'title: "Sprint Planning"',
      'date: "2026-06-04"',
      '---',
      '',
      '## Approved Action Items',
      '',
      '- [ ] Tim to fix case-sensitivity bug in state abbreviations (@tim-eng ·)',
      '- [ ] John to send API docs to Sarah (@john-koht → @sarah-chen)',
      '',
    ].join('\n');
    // Parse for tim-eng — without the guard, the no-arrow heuristics would
    // classify Tim's own line as i_owe_them and create a commitment.
    const itemsForTim = parseActionItemsFromMeeting(content, 'tim-eng', 'john-koht', 'sprint.md');
    assert.equal(itemsForTim.length, 0, 'none-marked line produces no parsed item');
    // The directional line still parses for its participants.
    const itemsForJohn = parseActionItemsFromMeeting(content, 'john-koht', 'john-koht', 'sprint.md');
    assert.equal(itemsForJohn.length, 1);
  });

  it('staged-items round-trips the · marker as direction none', () => {
    const body = [
      '## Staged Action Items',
      '- ai_001: [@tim-eng ·] Tim to fix the bug',
      '- ai_002: [@john-koht → @sarah-chen] John to send docs',
      '',
    ].join('\n');
    const sections = parseStagedSections(body);
    assert.equal(sections.actionItems[0].direction, 'none');
    assert.equal(sections.actionItems[1].direction, 'i_owe_them');
  });

  it('staged_item_owner frontmatter accepts direction none', () => {
    const content = [
      '---',
      'staged_item_owner:',
      '  ai_001:',
      '    ownerSlug: tim-eng',
      '    direction: none',
      '---',
      'body',
    ].join('\n');
    const ownerMap = parseStagedItemOwner(content);
    assert.equal(ownerMap['ai_001']?.direction, 'none');
  });
});

// ---------------------------------------------------------------------------
// Single-pass prompt (W2)
// ---------------------------------------------------------------------------

describe('buildSinglePassExtractionPrompt (W2)', () => {
  const transcript = 'John: the rollout is blocked on license assignment.';

  it('contains the judgment rules: closeability, one-utterance-one-type, ⚠, tiers, do-not-pad', () => {
    const prompt = buildSinglePassExtractionPrompt(transcript, { ownerSlug: 'john-koht' });
    assert.ok(prompt.includes('Closeability'));
    assert.ok(prompt.includes('One utterance, one type'));
    assert.ok(prompt.includes('"uncertain": true'));
    assert.ok(prompt.includes('blocker'));
    assert.ok(prompt.includes("Don't pad"));
    assert.ok(prompt.includes('open_questions'));
    assert.ok(prompt.includes(transcript));
  });

  it('explains direction none via the identity frame', () => {
    const prompt = buildSinglePassExtractionPrompt(transcript, { ownerSlug: 'john-koht' });
    assert.ok(prompt.includes('"none"'));
    assert.ok(prompt.includes('Do NOT force'));
  });

  it('prior items render as MARK-don\'t-skip, never as an exclusion list (review F1)', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'V1 may default per-exposure no consolidation', source: 'Anthony 1:1' },
    ];
    const prompt = buildSinglePassExtractionPrompt(transcript, {
      ownerSlug: 'john-koht',
      priorItems,
    });
    assert.ok(prompt.includes('MARK, don\'t skip'));
    assert.ok(prompt.includes('Never omit a superseding item'));
    assert.ok(prompt.includes('"supersedes"'));
    assert.ok(!prompt.includes('SKIP these — already captured'), 'exclusion framing must not appear');
    assert.ok(prompt.includes('V1 may default per-exposure no consolidation'));
  });

  it('series context renders as advisory (AC13 negative-case labeling)', () => {
    const prompt = buildSinglePassExtractionPrompt(transcript, {
      ownerSlug: 'john-koht',
      sections: { seriesContext: '- 2026-06-02 Anthony 1:1: ai_007 recipient-table TDD' },
    });
    assert.ok(prompt.includes('advisory'));
    assert.ok(prompt.includes('verify before marking continuation'));
  });

  it('omits series/commitments blocks when not provided (no dangling headers)', () => {
    const prompt = buildSinglePassExtractionPrompt(transcript, { ownerSlug: 'john-koht' });
    assert.ok(!prompt.includes('prior meetings in this series'));
    assert.ok(!prompt.includes('Open commitments with people in this meeting'));
    assert.ok(!prompt.includes('Already-known items'));
  });
});

describe('updateMeetingContent — Open Questions ownership', () => {
  const existing = [
    '## Summary',
    'Old summary.',
    '',
    '## Open Questions',
    '- oq_001: stale question from prior extract',
    '',
    '## Transcript',
    'words',
  ].join('\n');
  const newSections = '## Summary\nNew summary.\n';

  it('LEGACY preserves a user/prior "## Open Questions" section (invariant)', () => {
    const updated = updateMeetingContent(existing, newSections);
    assert.ok(updated.includes('stale question from prior extract'),
      'legacy mode must not strip Open Questions sections');
  });

  it('single_pass replaces its own Open Questions section on re-extract', () => {
    const updated = updateMeetingContent(existing, newSections, SINGLE_PASS_STAGED_HEADERS);
    assert.ok(!updated.includes('stale question from prior extract'));
    assert.ok(updated.includes('## Transcript'), 'non-staged sections preserved');
  });
});

describe('buildKnownItemsSection', () => {
  it('returns empty string with no inputs', () => {
    assert.equal(buildKnownItemsSection(undefined, undefined), '');
    assert.equal(buildKnownItemsSection(undefined, []), '');
  });

  it('groups by type with continuation/supersedes instructions', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Start recipient-table TDD', source: 'Anthony 1:1' },
      { type: 'learning', text: 'Kafka consumers are serial', source: 'Anthony 1:1' },
    ];
    const s = buildKnownItemsSection(undefined, priorItems);
    assert.ok(s.includes('Known Action Items'));
    assert.ok(s.includes('Known Learnings'));
    assert.ok(s.includes('"continuation_of"'));
    assert.ok(s.includes('"supersedes"'));
  });
});
