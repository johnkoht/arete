/**
 * Tests for agenda parsing utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgendaItems, getUncheckedAgendaItems, getCompletedItems } from '../../src/utils/agenda.js';

describe('parseAgendaItems', () => {
  it('parses basic unchecked items', () => {
    const content = `
## Agenda

- [ ] Discuss roadmap
- [ ] Review budget
`;
    const items = parseAgendaItems(content);

    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'Discuss roadmap');
    assert.equal(items[0].checked, false);
    assert.equal(items[1].text, 'Review budget');
    assert.equal(items[1].checked, false);
  });

  it('parses mixed checked and unchecked items', () => {
    const content = `
- [x] Completed item
- [ ] Open item
- [X] Also completed
`;
    const items = parseAgendaItems(content);

    assert.equal(items.length, 3);
    assert.equal(items[0].checked, true);
    assert.equal(items[1].checked, false);
    assert.equal(items[2].checked, true);
  });

  it('tracks section headers', () => {
    const content = `
## Discussion

- [ ] Item under Discussion

### Sub-section

- [ ] Item under Sub-section

## Action Items

- [ ] Follow up
`;
    const items = parseAgendaItems(content);

    assert.equal(items.length, 3);
    assert.equal(items[0].section, 'Discussion');
    assert.equal(items[1].section, 'Sub-section');
    assert.equal(items[2].section, 'Action Items');
  });

  it('handles indented items', () => {
    const content = `
- [ ] Top level
  - [ ] Indented item
    - [ ] Deeply indented
`;
    const items = parseAgendaItems(content);

    assert.equal(items.length, 3);
    assert.equal(items[0].text, 'Top level');
    assert.equal(items[1].text, 'Indented item');
    assert.equal(items[2].text, 'Deeply indented');
  });

  it('returns empty array for content without checkboxes', () => {
    const content = `
# Meeting Agenda

- Regular bullet point
- Another point
`;
    const items = parseAgendaItems(content);

    assert.equal(items.length, 0);
  });

  it('handles empty content', () => {
    const items = parseAgendaItems('');
    assert.equal(items.length, 0);
  });
});

describe('getUncheckedAgendaItems', () => {
  it('returns only unchecked item texts', () => {
    const content = `
- [x] Done
- [ ] Not done
- [x] Also done
- [ ] Also not done
`;
    const items = getUncheckedAgendaItems(content);

    assert.equal(items.length, 2);
    assert.equal(items[0], 'Not done');
    assert.equal(items[1], 'Also not done');
  });

  it('returns empty array when all items are checked', () => {
    const content = `
- [x] Done
- [x] Also done
`;
    const items = getUncheckedAgendaItems(content);

    assert.equal(items.length, 0);
  });
});

describe('getCompletedItems', () => {
  it('returns completed item texts from basic checkboxes', () => {
    const content = `
- [x] Completed task
- [x] Another completed
`;
    const items = getCompletedItems(content);

    assert.equal(items.length, 2);
    assert.equal(items[0], 'Completed task');
    assert.equal(items[1], 'Another completed');
  });

  it('handles indented checkboxes', () => {
    const content = `
- [x] Top level done
  - [x] Indented done
    - [x] Deeply indented done
`;
    const items = getCompletedItems(content);

    assert.equal(items.length, 3);
    assert.equal(items[0], 'Top level done');
    assert.equal(items[1], 'Indented done');
    assert.equal(items[2], 'Deeply indented done');
  });

  it('handles uppercase X in checkboxes', () => {
    const content = `
- [X] Done with uppercase
- [x] Done with lowercase
`;
    const items = getCompletedItems(content);

    assert.equal(items.length, 2);
    assert.equal(items[0], 'Done with uppercase');
    assert.equal(items[1], 'Done with lowercase');
  });

  it('filters out unchecked items from mixed content', () => {
    const content = `
## Tasks

- [x] Done
- [ ] Not done
- [X] Also done
- [ ] Also not done
`;
    const items = getCompletedItems(content);

    assert.equal(items.length, 2);
    assert.equal(items[0], 'Done');
    assert.equal(items[1], 'Also done');
  });

  it('returns empty array when no items are checked', () => {
    const content = `
- [ ] Not done
- [ ] Also not done
`;
    const items = getCompletedItems(content);

    assert.equal(items.length, 0);
  });

  it('handles malformed checkboxes gracefully (no crash)', () => {
    const content = `
- [xincomplete
- [x]
- [x] 
- [ ]no space
- [x]no space but done
- Regular text without checkbox
`;
    const items = getCompletedItems(content);

    // Should not crash on malformed input
    assert.ok(Array.isArray(items), 'Should return array');
    // Regex behavior: "- [x]no space but done" matches (no space required before text)
    // "- [x] " matches with empty text (trimmed), "- [xincomplete" does not match
    // Filter out empty strings from results
    const nonEmpty = items.filter(i => i.length > 0);
    assert.equal(nonEmpty.length, 1, 'Should have one valid item');
    assert.equal(nonEmpty[0], 'no space but done');
  });

  it('handles empty content', () => {
    const items = getCompletedItems('');
    assert.equal(items.length, 0);
  });

  it('handles content with only non-checkbox lines', () => {
    const content = `
# Header
Some regular text
- Regular list item (no checkbox)
`;
    const items = getCompletedItems(content);
    assert.equal(items.length, 0);
  });
});
