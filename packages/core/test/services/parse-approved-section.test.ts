/**
 * Tests for parseApprovedSection — Phase 2 body-section parser.
 *
 * Covers:
 * - Standard 3-section body (Action Items / Decisions / Learnings)
 * - Multi-line bullet sections (regex fix from initial impl)
 * - Section as last in body (no following ## or ---)
 * - Section not present
 * - Empty section (header only, no bullets)
 * - Mixed checkbox + plain bullets
 * - Tolerates whitespace
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseApprovedSection } from '../../src/services/meeting-reconciliation.js';

const FULL_BODY = `# Sprint Review

## Summary
Sprint review covering Q1 progress.

## Approved Action Items
- [ ] Follow up with design team (@john-doe →)
- [ ] Review PR by end of week (@jane-smith ← @john-doe)

## Approved Decisions
- Adopt TypeScript for all new services

## Approved Learnings
- Integration tests catch more bugs than unit tests
- Sonnet is cheaper than Opus for reconciliation

## Transcript
John: Let's review the sprint...
`;

describe('parseApprovedSection', () => {
  it('parses ## Approved Action Items with checkbox bullets', () => {
    const items = parseApprovedSection(FULL_BODY, 'Action Items');
    assert.deepEqual(items, [
      'Follow up with design team (@john-doe →)',
      'Review PR by end of week (@jane-smith ← @john-doe)',
    ]);
  });

  it('parses ## Approved Decisions with plain bullets', () => {
    const items = parseApprovedSection(FULL_BODY, 'Decisions');
    assert.deepEqual(items, ['Adopt TypeScript for all new services']);
  });

  it('parses ## Approved Learnings with multiple bullets', () => {
    const items = parseApprovedSection(FULL_BODY, 'Learnings');
    assert.deepEqual(items, [
      'Integration tests catch more bugs than unit tests',
      'Sonnet is cheaper than Opus for reconciliation',
    ]);
  });

  it('returns [] when section is missing', () => {
    const items = parseApprovedSection(FULL_BODY, 'Risks');
    assert.deepEqual(items, []);
  });

  it('returns [] for empty section (header only, no bullets)', () => {
    const body = `## Approved Action Items

## Approved Decisions
- A decision
`;
    const items = parseApprovedSection(body, 'Action Items');
    assert.deepEqual(items, []);
  });

  it('handles section as last in body (no following ## or ---)', () => {
    const body = `## Approved Decisions
- Decision 1
- Decision 2
- Decision 3`;
    const items = parseApprovedSection(body, 'Decisions');
    assert.deepEqual(items, ['Decision 1', 'Decision 2', 'Decision 3']);
  });

  it('handles --- divider as section boundary', () => {
    const body = `## Approved Decisions
- Decision 1
- Decision 2

---

Trailing content`;
    const items = parseApprovedSection(body, 'Decisions');
    assert.deepEqual(items, ['Decision 1', 'Decision 2']);
  });

  it('tolerates mixed checkbox and plain bullets', () => {
    const body = `## Approved Action Items
- [ ] Plain unchecked
- [x] Plain checked
- Plain bullet without checkbox
`;
    const items = parseApprovedSection(body, 'Action Items');
    assert.deepEqual(items, [
      'Plain unchecked',
      'Plain checked',
      'Plain bullet without checkbox',
    ]);
  });

  it('case-insensitive on the section header', () => {
    const body = `## approved action items
- Item 1
`;
    const items = parseApprovedSection(body, 'Action Items');
    assert.deepEqual(items, ['Item 1']);
  });

  it('ignores non-bullet lines within the section', () => {
    const body = `## Approved Decisions
This is some commentary.

- Real decision
- Another decision

More commentary.
`;
    const items = parseApprovedSection(body, 'Decisions');
    assert.deepEqual(items, ['Real decision', 'Another decision']);
  });

  it('strips whitespace from bullet text', () => {
    const body = `## Approved Decisions
-   Lots of leading whitespace
- Normal bullet
`;
    const items = parseApprovedSection(body, 'Decisions');
    assert.deepEqual(items, ['Lots of leading whitespace', 'Normal bullet']);
  });

  it('handles empty body', () => {
    assert.deepEqual(parseApprovedSection('', 'Action Items'), []);
  });

  it('handles section with single bullet (no trailing newline)', () => {
    const body = `## Approved Action Items
- [ ] Single item`;
    const items = parseApprovedSection(body, 'Action Items');
    assert.deepEqual(items, ['Single item']);
  });
});
