/**
 * Tests for agenda parsing utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgendaItems, getUncheckedAgendaItems } from '../../src/utils/agenda.js';

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
