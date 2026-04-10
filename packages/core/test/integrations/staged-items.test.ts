/**
 * Tests for staged-items utilities.
 *
 * Coverage:
 * 1.  parseStagedSections — valid three-section body
 * 2.  parseStagedSections — missing sections returns empty arrays
 * 3.  parseStagedSections — case-insensitive headers
 * 4.  parseStagedSections — malformed lines are skipped
 * 5.  parseStagedSections — extra whitespace in item text is trimmed
 * 6.  parseStagedItemStatus — missing frontmatter returns {}
 * 7.  parseStagedItemStatus — partial frontmatter (no staged_item_status field)
 * 8.  parseStagedItemStatus — reads status map correctly
 * 8a. parseStagedItemEdits — missing frontmatter returns {}
 * 8b. parseStagedItemEdits — partial frontmatter (no staged_item_edits field)
 * 8c. parseStagedItemEdits — reads edits map correctly
 * 9.  writeItemStatusToFile — round-trip: write then re-read
 * 10. writeItemStatusToFile — preserves existing frontmatter fields
 * 11. writeItemStatusToFile — stores editedText in staged_item_edits
 * 12. writeItemStatusToFile — throws when file not found
 * 13. commitApprovedItems — approved decisions written to decisions.md
 * 14. commitApprovedItems — approved learnings written to learnings.md
 * 15. commitApprovedItems — action items NOT written to any memory file
 * 16. commitApprovedItems — staged sections removed from body
 * 17. commitApprovedItems — frontmatter cleaned and status set to approved
 * 18. commitApprovedItems — uses edited text when staged_item_edits present
 * 19. generateItemId — produces correct IDs for each type
 * 20. commitApprovedItems — writes ## Approved Action Items section to body
 * 21. commitApprovedItems — writes ## Approved Decisions section to body
 * 22. commitApprovedItems — writes ## Approved Learnings section to body
 * 23. commitApprovedItems — approved sections appear before ## Transcript
 * 24. commitApprovedItems — only writes sections for types with approved items
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import {
  generateItemId,
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemEdits,
  parseStagedItemOwner,
  writeItemStatusToFile,
  commitApprovedItems,
} from '../../src/integrations/staged-items.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async read(path: string) { return files.get(path) ?? null; },
    async write(path: string, content: string) { files.set(path, content); },
    async exists(path: string) { return files.has(path); },
    async delete(path: string) { files.delete(path); },
    async list() { return []; },
    async listSubdirectories() { return []; },
    async mkdir() { /* no-op */ },
    async getModified() { return null; },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_BODY = `
## Staged Action Items
- ai_001: Follow up on pricing model
- ai_002: Share Q1 roadmap deck

## Staged Decisions
- de_001: Prioritize enterprise tier

## Staged Learnings
- le_001: Enterprise customers care about audit logs
`.trimStart();

const FRONTMATTER_WITH_STATUS = `---
title: "Test Meeting"
date: "2026-03-01"
status: synced
staged_item_status:
  ai_001: pending
  de_001: approved
  le_001: skipped
---

${VALID_BODY}`;

const FULL_MEETING = `---
title: "Strategy Review"
date: "2026-03-01"
source: Krisp
status: processed
attendees:
  - name: John Koht
    email: john@example.com
  - name: Jamie Burk
    email: jamie@example.com
staged_item_status:
  ai_001: approved
  de_001: approved
  le_001: approved
---

## Intro

Some intro text.

## Staged Action Items
- ai_001: Follow up on pricing model

## Staged Decisions
- de_001: Prioritize enterprise tier

## Staged Learnings
- le_001: Enterprise customers care about audit logs

## Transcript
Full transcript here.
`;

const MEMORY_DIR = '/workspace/.arete/memory/items';
const MEETING_FILE = '/workspace/meetings/test.md';

// ---------------------------------------------------------------------------
// 1–5: parseStagedSections
// ---------------------------------------------------------------------------

describe('parseStagedSections', () => {
  it('(1) parses all three sections from a valid body', () => {
    const result = parseStagedSections(VALID_BODY);

    assert.equal(result.actionItems.length, 2, 'should have 2 action items');
    assert.equal(result.decisions.length, 1, 'should have 1 decision');
    assert.equal(result.learnings.length, 1, 'should have 1 learning');

    assert.deepEqual(result.actionItems[0], { id: 'ai_001', text: 'Follow up on pricing model', type: 'ai', source: 'ai', ownerSlug: undefined, direction: undefined, counterpartySlug: undefined });
    assert.deepEqual(result.actionItems[1], { id: 'ai_002', text: 'Share Q1 roadmap deck', type: 'ai', source: 'ai', ownerSlug: undefined, direction: undefined, counterpartySlug: undefined });
    assert.deepEqual(result.decisions[0], { id: 'de_001', text: 'Prioritize enterprise tier', type: 'de', source: 'ai' });
    assert.deepEqual(result.learnings[0], { id: 'le_001', text: 'Enterprise customers care about audit logs', type: 'le', source: 'ai' });
  });

  it('(2) returns empty arrays when sections are absent', () => {
    const result = parseStagedSections('## Summary\nNo staged sections here.\n');

    assert.deepEqual(result, { actionItems: [], decisions: [], learnings: [] });
  });

  it('(3) matches headers case-insensitively', () => {
    const body = `## staged action items\n- ai_001: Task one\n## staged decisions\n- de_001: Decision one\n## staged learnings\n- le_001: Learning one\n`;
    const result = parseStagedSections(body);

    assert.equal(result.actionItems.length, 1);
    assert.equal(result.decisions.length, 1);
    assert.equal(result.learnings.length, 1);
  });

  it('(4) skips malformed lines without throwing', () => {
    const body = `## Staged Action Items\n- not-a-valid-id: text\n- ai_001: Valid item\n- malformed line with no colon\n`;
    const result = parseStagedSections(body);

    assert.equal(result.actionItems.length, 1, 'only the valid item is captured');
    assert.equal(result.actionItems[0].id, 'ai_001');
  });

  it('(5) trims whitespace from item text', () => {
    const body = `## Staged Decisions\n- de_001:   Lots of whitespace   \n`;
    const result = parseStagedSections(body);

    assert.equal(result.decisions[0].text, 'Lots of whitespace');
  });

  it('(5b) parses owner/direction from action item text', () => {
    const body = `## Staged Action Items
- ai_001: [@john-smith → @sarah-chen] Send the report
- ai_002: [@sarah-chen ←] Review proposal
- ai_003: Regular action without owner
`;
    const result = parseStagedSections(body);

    assert.equal(result.actionItems.length, 3);
    
    // First item: owner → counterparty (i_owe_them)
    assert.equal(result.actionItems[0].ownerSlug, 'john-smith');
    assert.equal(result.actionItems[0].direction, 'i_owe_them');
    assert.equal(result.actionItems[0].counterpartySlug, 'sarah-chen');
    assert.equal(result.actionItems[0].text, 'Send the report');
    
    // Second item: owner ← (they_owe_me), no counterparty
    assert.equal(result.actionItems[1].ownerSlug, 'sarah-chen');
    assert.equal(result.actionItems[1].direction, 'they_owe_me');
    assert.equal(result.actionItems[1].counterpartySlug, undefined);
    assert.equal(result.actionItems[1].text, 'Review proposal');
    
    // Third item: no owner notation
    assert.equal(result.actionItems[2].ownerSlug, undefined);
    assert.equal(result.actionItems[2].direction, undefined);
    assert.equal(result.actionItems[2].text, 'Regular action without owner');
  });
});

// ---------------------------------------------------------------------------
// 6–8: parseStagedItemStatus
// ---------------------------------------------------------------------------

describe('parseStagedItemStatus', () => {
  it('(6) returns {} when content has no frontmatter', () => {
    const result = parseStagedItemStatus('# Just a heading\nNo frontmatter here.');
    assert.deepEqual(result, {});
  });

  it('(7) returns {} when frontmatter has no staged_item_status field', () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody text.`;
    const result = parseStagedItemStatus(content);
    assert.deepEqual(result, {});
  });

  it('(8) reads staged_item_status map correctly', () => {
    const result = parseStagedItemStatus(FRONTMATTER_WITH_STATUS);
    assert.deepEqual(result, {
      ai_001: 'pending',
      de_001: 'approved',
      le_001: 'skipped',
    });
  });
});

// ---------------------------------------------------------------------------
// 8a–8c: parseStagedItemEdits
// ---------------------------------------------------------------------------

const FRONTMATTER_WITH_EDITS = `---
title: Meeting
status: processed
staged_item_edits:
  ai_001: "Edited action item text"
  de_001: "Edited decision text"
---

Body content.
`;

describe('parseStagedItemEdits', () => {
  it('(8a) returns {} when content has no frontmatter', () => {
    const result = parseStagedItemEdits('# Just a heading\nNo frontmatter here.');
    assert.deepEqual(result, {});
  });

  it('(8b) returns {} when frontmatter has no staged_item_edits field', () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody text.`;
    const result = parseStagedItemEdits(content);
    assert.deepEqual(result, {});
  });

  it('(8c) reads staged_item_edits map correctly', () => {
    const result = parseStagedItemEdits(FRONTMATTER_WITH_EDITS);
    assert.deepEqual(result, {
      ai_001: 'Edited action item text',
      de_001: 'Edited decision text',
    });
  });
});

// ---------------------------------------------------------------------------
// parseStagedItemOwner
// ---------------------------------------------------------------------------

const FRONTMATTER_WITH_OWNER = `---
title: Meeting
status: processed
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
    direction: i_owe_them
    counterpartySlug: sarah-chen
  ai_002:
    ownerSlug: sarah-chen
    direction: they_owe_me
  ai_003:
    ownerSlug: mike-jones
---

Body content.
`;

describe('parseStagedItemOwner', () => {
  it('returns {} when content has no frontmatter', () => {
    const result = parseStagedItemOwner('# Just a heading\nNo frontmatter here.');
    assert.deepEqual(result, {});
  });

  it('returns {} when frontmatter has no staged_item_owner field', () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody text.`;
    const result = parseStagedItemOwner(content);
    assert.deepEqual(result, {});
  });

  it('reads staged_item_owner map correctly', () => {
    const result = parseStagedItemOwner(FRONTMATTER_WITH_OWNER);
    assert.deepEqual(result, {
      ai_001: {
        ownerSlug: 'john-koht',
        direction: 'i_owe_them',
        counterpartySlug: 'sarah-chen',
      },
      ai_002: {
        ownerSlug: 'sarah-chen',
        direction: 'they_owe_me',
      },
      ai_003: {
        ownerSlug: 'mike-jones',
      },
    });
  });

  it('skips invalid direction values', () => {
    const content = `---
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
    direction: invalid_direction
---

Body.`;
    const result = parseStagedItemOwner(content);
    // Should still have the item, just without direction
    assert.deepEqual(result, {
      ai_001: {
        ownerSlug: 'john-koht',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// 9–12: writeItemStatusToFile
// ---------------------------------------------------------------------------

describe('writeItemStatusToFile', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('(9) round-trip: written status is readable via parseStagedItemStatus', async () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody.`;
    storage.files.set(MEETING_FILE, content);

    await writeItemStatusToFile(storage, MEETING_FILE, 'ai_001', { status: 'approved' });

    const updated = storage.files.get(MEETING_FILE)!;
    const statusMap = parseStagedItemStatus(updated);
    assert.equal(statusMap['ai_001'], 'approved');
  });

  it('(10) preserves existing frontmatter fields after write', async () => {
    const content = `---\ntitle: "Important Meeting"\ndate: "2026-03-01"\nstatus: synced\n---\n\nBody.`;
    storage.files.set(MEETING_FILE, content);

    await writeItemStatusToFile(storage, MEETING_FILE, 'de_001', { status: 'skipped' });

    const updated = storage.files.get(MEETING_FILE)!;
    const { data } = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as { data: unknown };
    const frontmatter = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.equal(frontmatter['title'], 'Important Meeting');
    assert.equal(frontmatter['date'], '2026-03-01');
    assert.equal(frontmatter['status'], 'synced');
  });

  it('(11) stores editedText in staged_item_edits when provided', async () => {
    const content = `---\ntitle: "Meeting"\n---\n\nBody.`;
    storage.files.set(MEETING_FILE, content);

    await writeItemStatusToFile(storage, MEETING_FILE, 'de_001', {
      status: 'approved',
      editedText: 'Updated decision text',
    });

    const updated = storage.files.get(MEETING_FILE)!;
    const frontmatter = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    const edits = frontmatter['staged_item_edits'] as Record<string, string>;
    assert.equal(edits['de_001'], 'Updated decision text');
  });

  it('(12) throws when file not found', async () => {
    await assert.rejects(
      () => writeItemStatusToFile(storage, '/nonexistent/file.md', 'ai_001', { status: 'approved' }),
      (err: Error) => {
        assert.ok(err.message.includes('not found'), `Expected "not found" in: "${err.message}"`);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// 13–18: commitApprovedItems
// ---------------------------------------------------------------------------

describe('commitApprovedItems', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
    storage.files.set(MEETING_FILE, FULL_MEETING);
  });

  it('(13) writes approved decisions to decisions.md with proper format', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.ok(decisions, 'decisions.md should be created');
    // Check proper entry format: ## Title, - **Date**, - **Source**, - content
    assert.ok(decisions.includes('## Prioritize enterprise tier'), 'should have entry header');
    assert.ok(decisions.includes('- **Date**: 2026-03-01'), 'should have date line');
    assert.ok(decisions.includes('- **Source**: Strategy Review (John Koht, Jamie Burk)'), 'should have source line with attendees');
    assert.ok(decisions.includes('- Prioritize enterprise tier'), 'should have content line');
  });

  it('(14) writes approved learnings to learnings.md with proper format', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`);
    assert.ok(learnings, 'learnings.md should be created');
    // Check proper entry format: ## Title, - **Date**, - **Source**, - content
    assert.ok(learnings.includes('## Enterprise customers care about audit logs'), 'should have entry header');
    assert.ok(learnings.includes('- **Date**: 2026-03-01'), 'should have date line');
    assert.ok(learnings.includes('- **Source**: Strategy Review (John Koht, Jamie Burk)'), 'should have source line with attendees');
    assert.ok(learnings.includes('- Enterprise customers care about audit logs'), 'should have content line');
  });

  it('(15) does NOT write action items to any memory file', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`) ?? '';

    assert.ok(
      !decisions.includes('Follow up on pricing model'),
      'action item text must NOT appear in decisions.md'
    );
    assert.ok(
      !learnings.includes('Follow up on pricing model'),
      'action item text must NOT appear in learnings.md'
    );
  });

  it('(16) removes all staged sections from the meeting body', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    assert.ok(!updated.includes('## Staged Action Items'), 'Staged Action Items header should be removed');
    assert.ok(!updated.includes('## Staged Decisions'), 'Staged Decisions header should be removed');
    assert.ok(!updated.includes('## Staged Learnings'), 'Staged Learnings header should be removed');
    assert.ok(!updated.includes('ai_001:'), 'action item line should be removed');
    assert.ok(!updated.includes('de_001:'), 'decision item line should be removed');
    assert.ok(!updated.includes('le_001:'), 'learning item line should be removed');
  });

  it('(17) sets status: approved, approved_at, and clears staged_item_status/edits', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    const frontmatterMatch = updated.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(frontmatterMatch, 'file must still have frontmatter');

    const frontmatter = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
    assert.equal(frontmatter['status'], 'approved', 'status must be set to approved');
    assert.ok(frontmatter['approved_at'], 'approved_at must be set');
    assert.ok(!('staged_item_status' in frontmatter), 'staged_item_status must be removed');
    assert.ok(!('staged_item_edits' in frontmatter), 'staged_item_edits must be removed');
  });

  it('(18) uses edited text from staged_item_edits when available', async () => {
    const meetingWithEdits = FULL_MEETING.replace(
      'staged_item_status:',
      'staged_item_edits:\n  de_001: "Custom edited decision"\nstaged_item_status:'
    );
    storage.files.set(MEETING_FILE, meetingWithEdits);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    assert.ok(
      decisions.includes('## Custom edited decision'),
      'should use the edited text in header'
    );
    assert.ok(
      decisions.includes('- Custom edited decision'),
      'should use the edited text in content'
    );
    assert.ok(
      !decisions.includes('Prioritize enterprise tier'),
      'original staged text should not appear when edit is present'
    );
  });

  it('skips items that are not approved (pending/skipped)', async () => {
    const meetingWithMixed = `---
title: "Mixed"
date: "2026-03-01"
status: processed
staged_item_status:
  de_001: approved
  de_002: skipped
  le_001: pending
---

## Staged Decisions
- de_001: Approved decision
- de_002: Skipped decision

## Staged Learnings
- le_001: Pending learning
`;
    storage.files.set(MEETING_FILE, meetingWithMixed);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    assert.ok(decisions.includes('Approved decision'), 'approved item should appear');
    assert.ok(!decisions.includes('Skipped decision'), 'skipped item should not appear');

    // learnings.md should not exist (no approved learnings)
    assert.ok(!storage.files.has(`${MEMORY_DIR}/learnings.md`), 'learnings.md should not be created when no approved learnings');
  });

  it('appends to existing memory files (does not overwrite)', async () => {
    storage.files.set(`${MEMORY_DIR}/decisions.md`, '# Decisions\n\n## Existing decision\n- **Date**: 2026-02-01\n- **Source**: Old Meeting\n- Existing decision content\n');

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    assert.ok(decisions.includes('Existing decision'), 'existing content must be preserved');
    assert.ok(decisions.includes('## Prioritize enterprise tier'), 'new decision must be appended with header');
  });

  it('(28) handles attendees as plain strings (not objects)', async () => {
    const meetingWithStringAttendees = `---
title: "Simple Meeting"
date: "2026-03-15"
attendees:
  - Alice Smith
  - Bob Jones
staged_item_status:
  le_001: approved
---

## Staged Learnings
- le_001: Teams prefer async communication
`;
    storage.files.set(MEETING_FILE, meetingWithStringAttendees);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`) ?? '';
    assert.ok(learnings.includes('- **Source**: Simple Meeting (Alice Smith, Bob Jones)'), 'should extract names from string attendees');
  });

  it('(29) handles missing attendees gracefully', async () => {
    const meetingWithoutAttendees = `---
title: "Solo Meeting"
date: "2026-03-20"
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Decision without attendees
`;
    storage.files.set(MEETING_FILE, meetingWithoutAttendees);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    // Source should just be the title when no attendees
    assert.ok(decisions.includes('- **Source**: Solo Meeting'), 'should use just title when no attendees');
    assert.ok(!decisions.includes('()'), 'should not have empty parentheses');
  });

  it('(30) truncates long item text for entry title', async () => {
    const meetingWithLongItem = `---
title: "Long Item Meeting"
date: "2026-03-25"
staged_item_status:
  le_001: approved
---

## Staged Learnings
- le_001: This is a very long learning item that exceeds eighty characters and should be truncated in the header but preserved in full in the content line below
`;
    storage.files.set(MEETING_FILE, meetingWithLongItem);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`) ?? '';
    // Header should be truncated (at word boundary around 77 chars + ...)
    assert.ok(learnings.includes('## This is a very long learning item that exceeds eighty characters and should...'), 'header should be truncated with ellipsis');
    // Full content should be preserved
    assert.ok(learnings.includes('- This is a very long learning item that exceeds eighty characters and should be truncated in the header but preserved in full in the content line below'), 'full content should be preserved');
  });

  it('(31) parses ISO date strings correctly', async () => {
    const meetingWithISODate = `---
title: "ISO Date Meeting"
date: "2026-04-01T14:30:00.000Z"
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Decision with ISO date
`;
    storage.files.set(MEETING_FILE, meetingWithISODate);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`) ?? '';
    assert.ok(decisions.includes('- **Date**: 2026-04-01'), 'should extract YYYY-MM-DD from ISO string');
  });

  it('(20) writes ## Approved Action Items section to meeting body', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    assert.ok(updated.includes('## Approved Action Items'), 'should have Approved Action Items section');
    assert.ok(updated.includes('- [ ] Follow up on pricing model'), 'action item should be in section');
  });

  it('(21) writes ## Approved Decisions section to meeting body', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    assert.ok(updated.includes('## Approved Decisions'), 'should have Approved Decisions section');
    assert.ok(updated.includes('- Prioritize enterprise tier'), 'decision should be in section');
  });

  it('(22) writes ## Approved Learnings section to meeting body', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    assert.ok(updated.includes('## Approved Learnings'), 'should have Approved Learnings section');
    assert.ok(updated.includes('- Enterprise customers care about audit logs'), 'learning should be in section');
  });

  it('(23) approved sections appear before ## Transcript', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    const actionItemsIndex = updated.indexOf('## Approved Action Items');
    const decisionsIndex = updated.indexOf('## Approved Decisions');
    const learningsIndex = updated.indexOf('## Approved Learnings');
    const transcriptIndex = updated.indexOf('## Transcript');

    assert.ok(actionItemsIndex < transcriptIndex, 'Approved Action Items should be before Transcript');
    assert.ok(decisionsIndex < transcriptIndex, 'Approved Decisions should be before Transcript');
    assert.ok(learningsIndex < transcriptIndex, 'Approved Learnings should be before Transcript');
  });

  it('(24) only writes sections for item types that have approved items', async () => {
    const meetingOnlyDecisions = `---
title: "Decisions Only"
date: "2026-03-01"
status: processed
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Only decision

## Transcript
Content here.
`;
    storage.files.set(MEETING_FILE, meetingOnlyDecisions);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    assert.ok(updated.includes('## Approved Decisions'), 'should have Approved Decisions section');
    assert.ok(!updated.includes('## Approved Action Items'), 'should NOT have Approved Action Items section (no items)');
    assert.ok(!updated.includes('## Approved Learnings'), 'should NOT have Approved Learnings section (no items)');
  });

  it('(25) includes direction-aware arrow notation from staged_item_owner in approved action items', async () => {
    const meetingWithOwner = `---
title: "Meeting with Owner"
date: "2026-03-01"
status: processed
staged_item_status:
  ai_001: approved
  ai_002: approved
  ai_003: approved
  ai_004: approved
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
    direction: i_owe_them
    counterpartySlug: lindsay-gray
  ai_002:
    ownerSlug: jamie-burk
    direction: they_owe_me
    counterpartySlug: john-koht
  ai_003:
    ownerSlug: jamie-burk
    direction: they_owe_me
---

## Staged Action Items
- ai_001: Send the Q1 report
- ai_002: Review proposal draft
- ai_003: Check the metrics
- ai_004: Action without owner

## Transcript
Content here.
`;
    storage.files.set(MEETING_FILE, meetingWithOwner);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;

    // i_owe_them with counterparty → uses →
    assert.ok(
      updated.includes('- [ ] Send the Q1 report (@john-koht → @lindsay-gray)'),
      'i_owe_them should use → arrow with counterparty'
    );
    // they_owe_me with counterparty → uses ←
    assert.ok(
      updated.includes('- [ ] Review proposal draft (@jamie-burk ← @john-koht)'),
      'they_owe_me should use ← arrow with counterparty'
    );
    // they_owe_me without counterparty → uses ← (owner-only with trailing arrow)
    assert.ok(
      updated.includes('- [ ] Check the metrics (@jamie-burk ←)'),
      'they_owe_me without counterparty should use trailing ← arrow'
    );
    // No owner metadata → plain text
    assert.ok(
      updated.includes('- [ ] Action without owner'),
      'should include plain text for items without owner'
    );
    assert.ok(
      !updated.includes('- [ ] Action without owner ('),
      'should NOT have parentheses for items without owner'
    );
  });

  it('(26) stores direction-aware owner notation in approved_items frontmatter', async () => {
    const meetingWithOwner = `---
title: "Meeting with Owner"
date: "2026-03-01"
status: processed
staged_item_status:
  ai_001: approved
  ai_002: approved
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
    direction: i_owe_them
    counterpartySlug: lindsay-gray
  ai_002:
    ownerSlug: anthony-avina
    direction: they_owe_me
    counterpartySlug: john-koht
---

## Staged Action Items
- ai_001: Send the Q1 report
- ai_002: Store exposure type in config

## Transcript
Content here.
`;
    storage.files.set(MEETING_FILE, meetingWithOwner);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    const frontmatterMatch = updated.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>;
    const approvedItems = frontmatter['approved_items'] as { actionItems: string[] };

    assert.ok(
      approvedItems.actionItems[0].includes('(@john-koht → @lindsay-gray)'),
      'i_owe_them should use → in approved_items'
    );
    assert.ok(
      approvedItems.actionItems[1].includes('(@anthony-avina ← @john-koht)'),
      'they_owe_me should use ← in approved_items'
    );
  });

  it('(27) cleans up all staged metadata from frontmatter', async () => {
    const meetingWithAllMetadata = `---
title: "Full Meeting"
date: "2026-03-01"
status: processed
staged_item_status:
  ai_001: approved
staged_item_edits:
  ai_001: "Edited text"
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
staged_item_source:
  ai_001: ai
staged_item_confidence:
  ai_001: 0.9
---

## Staged Action Items
- ai_001: Original text

## Transcript
Content here.
`;
    storage.files.set(MEETING_FILE, meetingWithAllMetadata);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE)!;
    const frontmatterMatch = updated.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>;
    
    assert.ok(!('staged_item_status' in frontmatter), 'staged_item_status should be removed');
    assert.ok(!('staged_item_edits' in frontmatter), 'staged_item_edits should be removed');
    assert.ok(!('staged_item_owner' in frontmatter), 'staged_item_owner should be removed');
    assert.ok(!('staged_item_source' in frontmatter), 'staged_item_source should be removed');
    assert.ok(!('staged_item_confidence' in frontmatter), 'staged_item_confidence should be removed');
  });
});

// ---------------------------------------------------------------------------
// 19: generateItemId
// ---------------------------------------------------------------------------

describe('generateItemId', () => {
  it('(19) produces correct IDs for each type', () => {
    assert.equal(generateItemId('ai', 1), 'ai_001');
    assert.equal(generateItemId('de', 42), 'de_042');
    assert.equal(generateItemId('le', 100), 'le_100');
  });
});
