/**
 * Tests for meeting-parser.ts — action item extraction from structured meeting files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseActionItemsFromMeeting } from '../../src/services/meeting-parser.js';

describe('parseActionItemsFromMeeting', () => {
  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  describe('basic parsing', () => {
    it('extracts action items from ## Action Items section', () => {
      const content = `---
title: "Weekly Sync"
date: "2026-03-04"
---

## Summary

Just a regular meeting summary.

## Action Items

- [ ] John to send API docs to Sarah by Friday (@john-smith → @sarah-chen)
- [x] Review the proposal (@sarah-chen → @mike-jones)

## Next Steps

Some next steps here.`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items.length, 1);
      assert.equal(items[0].text, 'John to send API docs to Sarah by Friday');
      assert.equal(items[0].direction, 'i_owe_them');
      assert.equal(items[0].completed, false);
      assert.equal(items[0].source, 'meeting.md');
      assert.equal(items[0].date, '2026-03-04');
      assert.equal(items[0].stale, false);
      assert.ok(items[0].hash.length === 64, 'hash should be 64 char sha256');
    });

    it('returns both checked and unchecked items with correct completed flag', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Unchecked item (@john-smith → @sarah-chen)
- [x] Checked item (@john-smith → @sarah-chen)
- [X] Also checked with capital X (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items.length, 3);
      assert.equal(items[0].completed, false);
      assert.equal(items[1].completed, true);
      assert.equal(items[2].completed, true);
    });

    it('returns empty array when no ## Action Items section found', () => {
      const content = `---
date: "2026-03-04"
---

## Summary

No action items section here.

## Next Steps

Just next steps.`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.deepEqual(items, []);
    });

    it('returns empty array when no date in frontmatter', () => {
      const content = `---
title: "Meeting without date"
---

## Action Items

- [ ] Some item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.deepEqual(items, []);
    });

    it('returns empty array when no frontmatter at all', () => {
      const content = `## Action Items

- [ ] Some item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.deepEqual(items, []);
    });

    it('handles empty ## Action Items section', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

## Next Steps

Some steps.`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.deepEqual(items, []);
    });

    it('extracts action items from ## Approved Action Items section', () => {
      // This header is created by the meeting approval flow in the web UI
      const content = `---
title: "Weekly Sync"
date: "2026-03-04"
status: approved
---

## Summary

Meeting summary here.

## Approved Action Items

- [ ] Follow up with Sarah on pricing (@john-smith → @sarah-chen)
- [ ] Review the Q1 roadmap (@sarah-chen → @john-smith)

## Transcript

Some transcript content.`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items.length, 2);
      assert.equal(items[0].text, 'Follow up with Sarah on pricing');
      assert.equal(items[0].direction, 'i_owe_them');
      assert.equal(items[1].text, 'Review the Q1 roadmap');
      assert.equal(items[1].direction, 'they_owe_me');
    });
  });

  // ---------------------------------------------------------------------------
  // Arrow notation variations
  // ---------------------------------------------------------------------------

  describe('arrow notation variations', () => {
    const template = (arrow: string) => `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith ${arrow} @sarah-chen)`;

    it('handles → (unicode arrow)', () => {
      const items = parseActionItemsFromMeeting(
        template('→'),
        'john-smith',
        'john-smith',
        'meeting.md',
      );
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles -> (ASCII arrow)', () => {
      const items = parseActionItemsFromMeeting(
        template('->'),
        'john-smith',
        'john-smith',
        'meeting.md',
      );
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles --> (double dash arrow)', () => {
      const items = parseActionItemsFromMeeting(
        template('-->'),
        'john-smith',
        'john-smith',
        'meeting.md',
      );
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles => (fat arrow)', () => {
      const items = parseActionItemsFromMeeting(
        template('=>'),
        'john-smith',
        'john-smith',
        'meeting.md',
      );
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });
  });

  // ---------------------------------------------------------------------------
  // @ prefix handling
  // ---------------------------------------------------------------------------

  describe('@ prefix handling', () => {
    it('handles with @ prefix on both sides', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles without @ prefix on either side', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (john-smith → sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles mixed @ prefix (first without, second with)', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles mixed @ prefix (first with, second without)', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith → sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });
  });

  // ---------------------------------------------------------------------------
  // Owner-only notation (no counterparty)
  // ---------------------------------------------------------------------------

  describe('owner-only notation', () => {
    it('extracts item when person is the owner', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Complete the quarterly report (@john-smith)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].text, 'Complete the quarterly report');
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('strips owner-only notation from text', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Review proposal (@sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'sarah-chen', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].text, 'Review proposal');
      assert.ok(!items[0].text.includes('@'));
      assert.ok(!items[0].text.includes('('));
    });

    it('returns empty for person not in owner-only notation', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Complete the quarterly report (@john-smith)`;

      // sarah-chen is not the owner, and there's no counterparty
      const items = parseActionItemsFromMeeting(content, 'sarah-chen', 'john-smith', 'meeting.md');
      assert.equal(items.length, 0);
    });

    it('handles owner-only without @ prefix', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send the report (john-smith)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('handles multiple items with mixed notation', () => {
      const content = `---
date: "2026-03-04"
---

## Approved Action Items

- [ ] Review proposal (@john-smith)
- [ ] Send feedback (@sarah-chen → @john-smith)
- [ ] Complete report (@sarah-chen)`;

      // For john-smith: should get 2 items (owner of first, counterparty of second)
      const johnItems = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(johnItems.length, 2);
      
      const reviewItem = johnItems.find(i => i.text.includes('Review'));
      assert.ok(reviewItem);
      assert.equal(reviewItem.direction, 'i_owe_them');
      
      const feedbackItem = johnItems.find(i => i.text.includes('feedback'));
      assert.ok(feedbackItem);
      assert.equal(feedbackItem.direction, 'they_owe_me');

      // For sarah-chen: should get 2 items (owner of second and third)
      const sarahItems = parseActionItemsFromMeeting(content, 'sarah-chen', 'john-smith', 'meeting.md');
      assert.equal(sarahItems.length, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Direction determination
  // ---------------------------------------------------------------------------

  describe('direction determination', () => {
    const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] John to send API docs to Sarah (@john-smith → @sarah-chen)
- [ ] Sarah to review the proposal (@sarah-chen → @john-smith)`;

    it('returns i_owe_them when person is owner (actor)', () => {
      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      // John owes Sarah something, so from John's perspective: i_owe_them
      const johnOwes = items.find((i) => i.text.includes('send API docs'));
      assert.ok(johnOwes);
      assert.equal(johnOwes.direction, 'i_owe_them');
    });

    it('returns they_owe_me when person is counterparty', () => {
      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      // Sarah owes John something, so from John's perspective: they_owe_me
      const sarahOwes = items.find((i) => i.text.includes('review the proposal'));
      assert.ok(sarahOwes);
      assert.equal(sarahOwes.direction, 'they_owe_me');
    });

    it('filters to items relevant to the given personSlug only', () => {
      const allContent = `---
date: "2026-03-04"
---

## Action Items

- [ ] Item for John and Sarah (@john-smith → @sarah-chen)
- [ ] Item for Mike and Lisa (@mike-jones → @lisa-wong)
- [ ] Item for Sarah and Mike (@sarah-chen → @mike-jones)`;

      const johnItems = parseActionItemsFromMeeting(
        allContent,
        'john-smith',
        'john-smith',
        'meeting.md',
      );
      assert.equal(johnItems.length, 1);
      assert.ok(johnItems[0].text.includes('John and Sarah'));

      const sarahItems = parseActionItemsFromMeeting(
        allContent,
        'sarah-chen',
        'john-smith',
        'meeting.md',
      );
      assert.equal(sarahItems.length, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Fallback heuristics
  // ---------------------------------------------------------------------------

  describe('fallback heuristics (no arrow notation)', () => {
    it('infers they_owe_me when owner is actor and person is mentioned (from person perspective)', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] I'll send Sarah the API docs by Friday`;

      // Filter for sarah, owner is john-smith
      // "I'll" indicates owner is actor, Sarah is mentioned as recipient
      // From Sarah's perspective: john (owner) owes Sarah = they_owe_me
      const items = parseActionItemsFromMeeting(content, 'sarah', 'john-smith', 'meeting.md');

      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'they_owe_me');
    });

    it('infers i_owe_them when querying as owner and owner is actor', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] I'll send Sarah the API docs by Friday`;

      // Filter for john-smith (the owner), owner is john-smith
      // "I'll" indicates owner is actor
      // From owner's perspective: I owe them = i_owe_them
      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('infers i_owe_them when person is actor (their name at start)', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Sarah to review the proposal and send feedback`;

      // Filter for sarah, owner is john-smith
      // Sarah is at start → she's the actor → she owes john (owner)
      // From Sarah's perspective: "I owe them" = i_owe_them
      const items = parseActionItemsFromMeeting(content, 'sarah', 'john-smith', 'meeting.md');

      assert.equal(items.length, 1);
      assert.equal(items[0].direction, 'i_owe_them');
    });

    it('returns empty when person not involved in item without notation', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Mike to send the report to Lisa`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      // John is neither mentioned nor the actor
      assert.deepEqual(items, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Text stripping
  // ---------------------------------------------------------------------------

  describe('notation stripping from text', () => {
    it('strips arrow notation from returned text field', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send API docs by Friday (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items[0].text, 'Send API docs by Friday');
      assert.ok(!items[0].text.includes('@'));
      assert.ok(!items[0].text.includes('→'));
    });

    it('strips notation with trailing comma', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send API docs, (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items[0].text, 'Send API docs');
    });
  });

  // ---------------------------------------------------------------------------
  // Hash computation
  // ---------------------------------------------------------------------------

  describe('hash computation', () => {
    it('produces consistent 64-char sha256 hash', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');

      assert.equal(items[0].hash.length, 64);
      assert.ok(/^[a-f0-9]+$/.test(items[0].hash));
    });

    it('produces different hashes for different directions', () => {
      const content1 = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith → @sarah-chen)`;

      const content2 = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@sarah-chen → @john-smith)`;

      const items1 = parseActionItemsFromMeeting(content1, 'john-smith', 'john-smith', 'meeting.md');
      const items2 = parseActionItemsFromMeeting(content2, 'john-smith', 'john-smith', 'meeting.md');

      // Same text but different directions → different hashes
      assert.notEqual(items1[0].hash, items2[0].hash);
    });

    it('produces different hashes for different person slugs', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Send docs (@john-smith → @sarah-chen)`;

      const items1 = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      const items2 = parseActionItemsFromMeeting(content, 'sarah-chen', 'john-smith', 'meeting.md');

      // Same text but different person slugs → different hashes
      assert.notEqual(items1[0].hash, items2[0].hash);
    });
  });

  // ---------------------------------------------------------------------------
  // Frontmatter variations
  // ---------------------------------------------------------------------------

  describe('frontmatter parsing', () => {
    it('handles date with quotes', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items[0].date, '2026-03-04');
    });

    it('handles date with single quotes', () => {
      const content = `---
date: '2026-03-04'
---

## Action Items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items[0].date, '2026-03-04');
    });

    it('handles date without quotes', () => {
      const content = `---
date: 2026-03-04
---

## Action Items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items[0].date, '2026-03-04');
    });

    it('handles ISO 8601 date with time (e.g., from Krisp)', () => {
      const content = `---
date: 2026-03-18T19:30:00.000Z
---

## Action Items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.equal(items[0].date, '2026-03-18');
    });
  });

  // ---------------------------------------------------------------------------
  // Section header priority
  // ---------------------------------------------------------------------------

  describe('section header priority', () => {
    it('prefers ## Approved Action Items over ## Action Items', () => {
      // Simulates a meeting file with both an empty ## Action Items and populated ## Approved Action Items
      const content = `---
date: "2026-03-18"
---

## Summary

Meeting summary.

## Action Items

No action items captured.

## Approved Action Items

- [ ] Send report (@john-smith → @sarah-chen)
- [ ] Review docs (@sarah-chen → @john-smith)

## Transcript

Transcript content.`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 2);
      assert.ok(items[0].text.includes('Send report'));
    });

    it('falls back to ## Action Items when no ## Approved Action Items exists', () => {
      const content = `---
date: "2026-03-18"
---

## Action Items

- [ ] Send report (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
      assert.ok(items[0].text.includes('Send report'));
    });
  });

  // ---------------------------------------------------------------------------
  // Section header variations
  // ---------------------------------------------------------------------------

  describe('section header variations', () => {
    it('handles lowercase "action items"', () => {
      const content = `---
date: "2026-03-04"
---

## action items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
    });

    it('handles mixed case "Action items"', () => {
      const content = `---
date: "2026-03-04"
---

## Action items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
    });

    it('extracts only up to next section header', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Item 1 (@john-smith → @sarah-chen)
- [ ] Item 2 (@john-smith → @sarah-chen)

## Other Section

- [ ] This is not an action item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles multiple spaces in notation', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Item (  @john-smith   →   @sarah-chen  )`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
    });

    it('ignores non-checkbox lines in section', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

Some intro text here.

- [ ] Real item (@john-smith → @sarah-chen)

Another paragraph.

- Not a checkbox item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
    });

    it('handles CRLF line endings', () => {
      const content = '---\r\ndate: "2026-03-04"\r\n---\r\n\r\n## Action Items\r\n\r\n- [ ] Item (@john-smith → @sarah-chen)\r\n';

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      assert.equal(items.length, 1);
    });

    it('preserves source from caller', () => {
      const content = `---
date: "2026-03-04"
---

## Action Items

- [ ] Item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(
        content,
        'john-smith',
        'john-smith',
        'meetings/2026-03-04-weekly-sync.md',
      );
      assert.equal(items[0].source, 'meetings/2026-03-04-weekly-sync.md');
    });

    it('always returns stale: false (caller computes)', () => {
      const content = `---
date: "2020-01-01"
---

## Action Items

- [ ] Very old item (@john-smith → @sarah-chen)`;

      const items = parseActionItemsFromMeeting(content, 'john-smith', 'john-smith', 'meeting.md');
      // Even though date is old, stale should be false — caller computes via isActionItemStale()
      assert.equal(items[0].stale, false);
    });
  });
});
