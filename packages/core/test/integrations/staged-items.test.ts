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
 * 32. appendToMemoryFile — emits **Topics** line when topics non-empty
 * 33. appendToMemoryFile — omits **Topics** line when topics absent
 * 34. appendToMemoryFile — omits **Topics** line when topics is empty array
 * 35. appendToMemoryFile — filters non-string / empty-string topic entries
 * 36. appendToMemoryFile — orders **Topics** between **Source** and content
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import {
  generateItemId,
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemElevated,
  parseStagedItemEdits,
  parseStagedItemOwner,
  parseStagedItemSkipReason,
  writeItemStatusToFile,
  writeItemElevatedToFile,
  removeItemElevatedFromFile,
  writeMeetingTopicsToFile,
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
// parseStagedItemSkipReason — phase-10-followup-2 Step 1
// ---------------------------------------------------------------------------

const FRONTMATTER_WITH_SKIP_REASON = `---
title: "Test Meeting"
date: "2026-06-04"
staged_item_status:
  ai_0042: skipped
  ai_0043: pending
staged_item_skip_reason:
  ai_0042:
    reason: already fulfilled via slack-dm
    evidence: "Slack DM → Jamie Burk, 2026-06-04"
    setBy: chef
    setAt: 2026-06-04T18:42:11Z
  ai_0099:
    reason: discussed at standup
    evidence: "Standup notes 2026-06-03"
    setBy: chef-proposed
    setAt: 2026-06-04T18:42:14Z
---

Body content.
`;

describe('parseStagedItemSkipReason (phase-10-followup-2 Step 1)', () => {
  it('returns {} when content has no frontmatter (M3 first-ship default)', () => {
    const result = parseStagedItemSkipReason('# Just a heading\nNo frontmatter here.');
    assert.deepEqual(result, {});
  });

  it('returns {} when frontmatter has no staged_item_skip_reason field (M3 first-ship)', () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody text.`;
    const result = parseStagedItemSkipReason(content);
    assert.deepEqual(result, {});
  });

  it('reads chef + chef-proposed entries with full payload preserved', () => {
    const result = parseStagedItemSkipReason(FRONTMATTER_WITH_SKIP_REASON);
    assert.deepEqual(result, {
      ai_0042: {
        reason: 'already fulfilled via slack-dm',
        evidence: 'Slack DM → Jamie Burk, 2026-06-04',
        setBy: 'chef',
        setAt: '2026-06-04T18:42:11Z',
      },
      ai_0099: {
        reason: 'discussed at standup',
        evidence: 'Standup notes 2026-06-03',
        setBy: 'chef-proposed',
        setAt: '2026-06-04T18:42:14Z',
      },
    });
  });

  it('accepts setBy: user (override path)', () => {
    const content = `---
staged_item_skip_reason:
  ai_0001:
    reason: I already sent this
    evidence: "Manual override"
    setBy: user
    setAt: 2026-06-05T08:13:02Z
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.equal(result['ai_0001']?.setBy, 'user');
  });

  it('parses the optional kind discriminator (theme-render W2)', () => {
    const content = `---
staged_item_skip_reason:
  de_0001:
    reason: superseded by 15:00 spec-sync
    evidence: "[[de_0004@later]]"
    setBy: chef
    setAt: 2026-06-18T15:05:00Z
    matchedRef: de_0004@later
    kind: superseded
  ai_0009:
    reason: dupe_of_ai_003
    evidence: "Slack DM"
    setBy: chef
    setAt: 2026-06-18T15:05:00Z
    matchedRef: Map the roadmap
    kind: dedup
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.equal(result['de_0001']?.kind, 'superseded');
    assert.equal(result['ai_0009']?.kind, 'dedup');
  });

  it('omits kind when absent or an unknown value (defaults to dedup semantics)', () => {
    const content = `---
staged_item_skip_reason:
  ai_0001:
    reason: dupe_of_ai_003
    evidence: ok
    setBy: chef
    setAt: 2026-06-18T15:05:00Z
    matchedRef: Map the roadmap
  ai_0002:
    reason: ok
    evidence: ok
    setBy: chef
    setAt: 2026-06-18T15:05:00Z
    kind: bogus-value
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    // Absent: no kind key at all (so render falls through to dedup framing).
    assert.ok(!('kind' in (result['ai_0001'] ?? {})));
    // Unknown value drops, rest of the entry survives.
    assert.ok(!('kind' in (result['ai_0002'] ?? {})));
    assert.equal(result['ai_0002']?.reason, 'ok');
  });

  it('drops entries with invalid setBy value', () => {
    const content = `---
staged_item_skip_reason:
  ai_0001:
    reason: foo
    evidence: bar
    setBy: typo-not-allowed
    setAt: 2026-06-04T18:42:11Z
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.deepEqual(result, {});
  });

  it('drops entries missing required fields (reason/evidence/setAt)', () => {
    const content = `---
staged_item_skip_reason:
  ai_0001:
    reason: only-reason-no-evidence
    setBy: chef
    setAt: 2026-06-04T18:42:11Z
  ai_0002:
    reason: ok
    evidence: ok
    setBy: chef
    # missing setAt
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.deepEqual(result, {});
  });

  it('drops entries where meta is non-object (null, string, array)', () => {
    const content = `---
staged_item_skip_reason:
  ai_0001: null
  ai_0002: "string value"
  ai_0003:
    - element1
    - element2
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.deepEqual(result, {});
  });

  it('returns {} when staged_item_skip_reason is an array (wrong shape)', () => {
    const content = `---
staged_item_skip_reason:
  - reason: foo
---

Body.`;
    const result = parseStagedItemSkipReason(content);
    assert.deepEqual(result, {});
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

  it('(11b/N2) a status-only write does NOT create an empty staged_item_edits map', async () => {
    const content = `---\ntitle: "Meeting"\nstatus: synced\n---\n\nBody.`;
    storage.files.set(MEETING_FILE, content);

    await writeItemStatusToFile(storage, MEETING_FILE, 'ai_001', { status: 'skipped' });

    const updated = storage.files.get(MEETING_FILE)!;
    const frontmatter = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.ok(!('staged_item_edits' in frontmatter), 'no empty staged_item_edits map written');
    // The reader still treats the absent map as {} (no regression).
    assert.deepEqual(parseStagedItemEdits(updated), {});
    // Status was still recorded.
    assert.equal(parseStagedItemStatus(updated)['ai_001'], 'skipped');
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

  it('(26) writes direction-aware owner notation to ## Approved Action Items body section', async () => {
    // Phase 2 (Areté v2): the `frontmatter.approved_items` field is gone.
    // Owner notation lives in the ## Approved Action Items body section.
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

    // Body sections — single source of truth post-Phase-2
    assert.ok(
      updated.includes('(@john-koht → @lindsay-gray)'),
      'i_owe_them should use → in ## Approved Action Items body section',
    );
    assert.ok(
      updated.includes('(@anthony-avina ← @john-koht)'),
      'they_owe_me should use ← in ## Approved Action Items body section',
    );

    // Frontmatter no longer carries the third-copy duplicate
    const frontmatterMatch = updated.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = parseYaml(frontmatterMatch![1]) as Record<string, unknown>;
    assert.ok(
      !('approved_items' in frontmatter),
      'frontmatter.approved_items should be removed (Phase 2 third-copy cleanup)',
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

// ---------------------------------------------------------------------------
// Topics on memory entries (Task 1 — wiki-leaning-meeting-extraction)
//
// `extractMeetingMetadata` and `appendToMemoryFile` are internal helpers,
// so we exercise them through `commitApprovedItems`, the existing pattern.
// ---------------------------------------------------------------------------

describe('appendToMemoryFile — topics line', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('emits **Topics** line when topics non-empty', async () => {
    const meetingWithTopics = `---
title: "Pricing Strategy"
date: "2026-04-15"
attendees:
  - name: John Koht
topics:
  - pricing-tiers
  - q2-launch
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Lock in tiered pricing for Q2
`;
    storage.files.set(MEETING_FILE, meetingWithTopics);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.ok(decisions, 'decisions.md should be created');
    assert.ok(
      decisions.includes('- **Topics**: pricing-tiers, q2-launch'),
      'should emit Topics line with comma-separated slugs',
    );
    // Spot-check entry shape stays correct around the new line.
    assert.ok(decisions.includes('## Lock in tiered pricing for Q2'), 'header preserved');
    assert.ok(decisions.includes('- **Date**: 2026-04-15'), 'date preserved');
    assert.ok(decisions.includes('- **Source**: Pricing Strategy (John Koht)'), 'source preserved');
    assert.ok(decisions.includes('- Lock in tiered pricing for Q2'), 'content preserved');
  });

  it('omits **Topics** line entirely when topics absent', async () => {
    const meetingWithoutTopics = `---
title: "No Topics Meeting"
date: "2026-04-16"
attendees:
  - name: John Koht
staged_item_status:
  le_001: approved
---

## Staged Learnings
- le_001: Customer success team needs more telemetry
`;
    storage.files.set(MEETING_FILE, meetingWithoutTopics);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`);
    assert.ok(learnings, 'learnings.md should be created');
    assert.ok(
      !learnings.includes('**Topics**'),
      'should NOT emit any Topics line when frontmatter has no topics',
    );
    // Sanity-check: the entry still has the standard fields.
    assert.ok(learnings.includes('- **Date**: 2026-04-16'));
    assert.ok(learnings.includes('- **Source**: No Topics Meeting (John Koht)'));
  });

  it('omits **Topics** line when topics is an empty array', async () => {
    const meetingEmptyTopics = `---
title: "Empty Topics"
date: "2026-04-17"
attendees:
  - name: John Koht
topics: []
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Decision with empty topics array
`;
    storage.files.set(MEETING_FILE, meetingEmptyTopics);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.ok(decisions, 'decisions.md should be created');
    assert.ok(
      !decisions.includes('**Topics**'),
      'empty topics array must not produce a blank Topics line',
    );
  });

  it('filters non-string and empty-string entries from topics frontmatter', async () => {
    // Defensive: malformed frontmatter shouldn't break entry shape.
    const meetingMalformedTopics = `---
title: "Malformed Topics"
date: "2026-04-18"
attendees:
  - name: John Koht
topics:
  - valid-slug
  - ""
  - other-slug
staged_item_status:
  de_001: approved
---

## Staged Decisions
- de_001: Decision body
`;
    storage.files.set(MEETING_FILE, meetingMalformedTopics);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.ok(decisions);
    assert.ok(
      decisions.includes('- **Topics**: valid-slug, other-slug'),
      'empty-string entries must be dropped, valid slugs preserved in order',
    );
  });

  it('places **Topics** line between **Source** and the content bullet', async () => {
    const meetingWithTopics = `---
title: "Order Test"
date: "2026-04-19"
attendees:
  - name: John Koht
topics:
  - ordering-check
staged_item_status:
  le_001: approved
---

## Staged Learnings
- le_001: Order matters for parser stability
`;
    storage.files.set(MEETING_FILE, meetingWithTopics);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const learnings = storage.files.get(`${MEMORY_DIR}/learnings.md`)!;
    const sourceIdx = learnings.indexOf('- **Source**:');
    const topicsIdx = learnings.indexOf('- **Topics**:');
    const contentIdx = learnings.indexOf('- Order matters for parser stability');

    assert.ok(sourceIdx >= 0 && topicsIdx >= 0 && contentIdx >= 0, 'all three lines present');
    assert.ok(sourceIdx < topicsIdx, 'Topics comes after Source');
    assert.ok(topicsIdx < contentIdx, 'Topics comes before the content line');
  });
});

// ---------------------------------------------------------------------------
// onApproved observer error containment (Phase 0 instrumentation contract)
// ---------------------------------------------------------------------------
// commitApprovedItems internalizes try/catch around the onApproved callback
// so a misbehaving observer can never break the commit. Errors are logged
// to stderr; the commit completes normally and all approved items are
// persisted to memory files + the meeting file.

describe('commitApprovedItems — onApproved observer error containment', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
    storage.files.set(MEETING_FILE, FULL_MEETING);
  });

  it('completes the commit normally when onApproved throws synchronously', async () => {
    // Capture stderr writes to assert the failure is logged but non-fatal.
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR, {
        onApproved: async () => {
          throw new Error('observer boom');
        },
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    // The commit's own writes must have happened despite the observer throwing.
    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated, 'meeting file still written');
    const fmMatch = updated!.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch, 'frontmatter present');
    const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;
    assert.equal(fm['status'], 'approved', 'status set to approved');

    // Memory files written too.
    assert.ok(
      storage.files.get(`${MEMORY_DIR}/decisions.md`),
      'decisions.md written despite observer failure',
    );
    assert.ok(
      storage.files.get(`${MEMORY_DIR}/learnings.md`),
      'learnings.md written despite observer failure',
    );

    // Stderr captured at least one observer-failure message (one per approved
    // item that triggered the throw).
    const stderr = stderrChunks.join('');
    assert.match(
      stderr,
      /\[commitApprovedItems\] onApproved observer failed/,
      'stderr should record the observer failure',
    );
    assert.match(stderr, /observer boom/, 'underlying error message surfaces in stderr');
  });

  it('logs each observer failure independently and processes all approved items', async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    const seen: string[] = [];
    try {
      await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR, {
        onApproved: async (item) => {
          seen.push(item.id);
          throw new Error(`fail-${item.id}`);
        },
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    // All three approved items (ai_001, de_001, le_001) were observed even
    // though each throw — internal catch must not abort the loop.
    assert.deepEqual(seen.sort(), ['ai_001', 'de_001', 'le_001']);

    const stderr = stderrChunks.join('');
    assert.match(stderr, /fail-ai_001/);
    assert.match(stderr, /fail-de_001/);
    assert.match(stderr, /fail-le_001/);
  });
});

// ---------------------------------------------------------------------------
// phase-10-followup-2 Step 4 / Step 4a — apply honors skip + F5 cleanup
// ---------------------------------------------------------------------------

const MEETING_WITH_CHEF_SKIP = `---
title: "John ↔ Jamie 2026-06-04"
date: "2026-06-04"
status: synced
attendees:
  - name: John Koht
  - name: Jamie Burk
staged_item_status:
  ai_0042: skipped
  ai_0043: approved
staged_item_skip_reason:
  ai_0042:
    reason: already fulfilled via slack-dm
    evidence: "Slack DM → Jamie Burk, 2026-06-04"
    setBy: chef
    setAt: 2026-06-04T18:42:11Z
---

## Staged Action Items
- ai_0042: Share the Notion claim-review-process doc with Jamie
- ai_0043: Schedule follow-up next week

## Transcript
Stuff.
`;

describe('commitApprovedItems — AC3 chef skip honored on apply (phase-10-followup-2)', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
    storage.files.set(MEETING_FILE, MEETING_WITH_CHEF_SKIP);
  });

  it('AC3 — skipped item is NOT in the Approved Action Items section', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    // ai_0043 was approved → present.
    assert.match(updated!, /Schedule follow-up next week/);
    // ai_0042 was skipped → must NOT appear in the Approved Action Items.
    const approvedSectionMatch = updated!.match(
      /## Approved Action Items\n([\s\S]*?)(?=\n## |$)/,
    );
    assert.ok(approvedSectionMatch, 'expected ## Approved Action Items section');
    assert.doesNotMatch(approvedSectionMatch![1], /Share the Notion/);
  });

  it('AC3 — ## Skipped on Apply section lists the skipped item with reason + setBy', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    assert.match(updated!, /## Skipped on Apply/);
    // The skipped item line includes id, text, reason, setBy.
    assert.match(updated!, /\[ai_0042\] Share the Notion/);
    assert.match(updated!, /skipped: already fulfilled via slack-dm/);
    assert.match(updated!, /\(chef,/);
  });

  it('AC3 — post-commit cleanup: approved IDs gone, skipped IDs gone, pending preserved (F5)', async () => {
    // Add a pending item to verify it survives the F5 cleanup.
    const fixture = MEETING_WITH_CHEF_SKIP.replace(
      'ai_0043: approved',
      `ai_0043: approved
  ai_0044: pending`,
    ).replace(
      '- ai_0043: Schedule follow-up next week',
      `- ai_0043: Schedule follow-up next week
- ai_0044: Some pending item not acted on`,
    );
    storage.files.set(MEETING_FILE, fixture);

    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    const fmMatch = updated!.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch);
    const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;

    // F5 contract: cleanup filters by approvedIds. ai_0043 (approved)
    // gets removed. ai_0042 (skipped, NOT approved) and ai_0044 (pending,
    // NOT approved) BOTH survive. This is the v3 spec — skip_reason for
    // skipped items lives in the audit trail (## Skipped on Apply body
    // section) AND can be re-reviewed next round.
    const status = fm['staged_item_status'] as Record<string, string> | undefined;
    assert.ok(status, 'staged_item_status should still exist (ai_0044 pending)');
    assert.ok(!('ai_0043' in status!), 'approved ai_0043 cleaned');
    assert.equal(status!['ai_0042'], 'skipped', 'skipped ai_0042 SURVIVES (not in approvedIds — F5)');
    assert.equal(status!['ai_0044'], 'pending', 'pending ai_0044 preserved');

    // F5 critical: skip_reason for the skipped ai_0042 also survives the
    // filter (ai_0042 was skipped, not approved).
    const skipReason = fm['staged_item_skip_reason'] as Record<string, Record<string, unknown>> | undefined;
    assert.ok(skipReason, 'skip_reason should survive for non-approved IDs');
    assert.ok(skipReason!['ai_0042'], 'ai_0042 skip_reason preserved (was skipped, not approved)');
  });

  it('AC11 / F5 — week-1 unskip survival: unsked pending item + skip_reason both survive apply cleanup', async () => {
    // Simulate the week-1 chef-proposed → user unskip flow:
    // 1. Chef proposed ai_0099 as chef-proposed (status: pending, reason: chef-proposed)
    // 2. User added [[unskip]] (skip_reason deleted, status stays pending)
    // 3. Separately user approves ai_0042 and runs apply
    // 4. Assert ai_0099 still present in staged_item_status as pending
    const fixture = `---
title: "Test"
date: "2026-06-07"
status: synced
attendees:
  - name: John Koht
staged_item_status:
  ai_0042: approved
  ai_0099: pending
staged_item_skip_reason:
  ai_0099:
    reason: discussed at standup
    evidence: "Standup notes 2026-06-06"
    setBy: chef-proposed
    setAt: 2026-06-06T18:42:14Z
---

## Staged Action Items
- ai_0042: Send the deck
- ai_0099: A pending chef-proposed item

## Transcript
.
`;
    storage.files.set(MEETING_FILE, fixture);
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    const fmMatch = updated!.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch);
    const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;

    // ai_0099 must STILL be in staged_item_status as pending (NOT cleared
    // by wholesale wipe). Closes F5/AC11.
    const status = fm['staged_item_status'] as Record<string, string>;
    assert.ok(status, 'staged_item_status survives because ai_0099 still pending');
    assert.equal(status['ai_0099'], 'pending', 'ai_0099 pending entry survives');
    assert.ok(!('ai_0042' in status), 'approved ai_0042 cleaned');

    // Skip reason for ai_0099 survives too (chef-proposed lapsed, but
    // skip_reason is preserved so next round chef can re-propose).
    const skipReason = fm['staged_item_skip_reason'] as Record<string, Record<string, unknown>>;
    assert.ok(skipReason['ai_0099'], 'ai_0099 chef-proposed skip_reason survives');
    assert.equal(skipReason['ai_0099']['setBy'], 'chef-proposed');
  });

  it('finding #12 — single_pass judgment + owner maps are filtered CONSISTENTLY by approvedIds', async () => {
    // Reproduces the claim-portal vs john-phil-shadow asymmetry: an approved
    // action item and a skipped one, each with a FULL single_pass overlay
    // (owner + importance + uncertain + links). Pre-fix, commit stripped
    // staged_item_owner for the approved id but LEFT staged_item_importance/
    // _uncertain/_links behind — orphan bookkeeping that made a post-approve
    // render show tiers without owner. Now every staged sibling map is filtered
    // the same way: the approved id vanishes from ALL of them; the skipped id
    // survives in ALL of them.
    const fixture = `---
title: "Single-pass overlay"
date: "2026-06-16"
status: processed
attendees:
  - name: John Koht
  - name: Phil Whisenhunt
staged_item_status:
  ai_001: approved
  ai_002: skipped
staged_item_owner:
  ai_001:
    ownerSlug: john-koht
    direction: i_owe_them
    counterpartySlug: phil-whisenhunt
  ai_002:
    ownerSlug: phil-whisenhunt
    direction: they_owe_me
    counterpartySlug: john-koht
staged_item_importance:
  ai_001: high
  ai_002: normal
staged_item_uncertain:
  ai_002: expressed as intention, not a firm commitment
staged_item_links:
  ai_001:
    continuationOf: prior-thread
---

## Staged Action Items
- ai_001: Ship the dual-slug verification (@john-koht → @phil-whisenhunt)
- ai_002: Phil to undraft the PR (@phil-whisenhunt → @john-koht)

## Transcript
.
`;
    storage.files.set(MEETING_FILE, fixture);
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);

    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    const fmMatch = updated!.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch);
    const fm = parseYaml(fmMatch![1]) as Record<string, unknown>;

    // For EACH staged sibling map: approved ai_001 gone, skipped ai_002 kept.
    for (const key of [
      'staged_item_status',
      'staged_item_owner',
      'staged_item_importance',
    ] as const) {
      const map = fm[key] as Record<string, unknown> | undefined;
      assert.ok(map, `${key} should survive (ai_002 not approved)`);
      assert.ok(!('ai_001' in map!), `${key}: approved ai_001 must be stripped`);
      assert.ok('ai_002' in map!, `${key}: skipped ai_002 must survive`);
    }
    // _uncertain only ever had ai_002 → survives intact.
    const uncertain = fm['staged_item_uncertain'] as Record<string, unknown> | undefined;
    assert.ok(uncertain && 'ai_002' in uncertain, 'uncertain ai_002 survives');
    // _links only ever had the approved ai_001 → all entries approved →
    // the whole key is dropped (legacy post-apply shape), NOT left orphaned.
    assert.ok(
      !('staged_item_links' in fm),
      'staged_item_links (only ai_001, approved) must be removed entirely — no orphan bookkeeping',
    );
  });

  it('AC9 — onSkipped observer fires per skipped item with payload', async () => {
    const observed: Array<Record<string, unknown>> = [];
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR, {
      onSkipped: async (rec) => {
        observed.push({ id: rec.id, reason: rec.reason, setBy: rec.setBy });
      },
    });
    assert.equal(observed.length, 1, 'one skipped item');
    assert.equal(observed[0].id, 'ai_0042');
    assert.equal(observed[0].reason, 'already fulfilled via slack-dm');
    assert.equal(observed[0].setBy, 'chef');
  });

  it('onSkipped error containment — observer throw does not abort the commit', async () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrChunks: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR, {
        onSkipped: async () => {
          throw new Error('observer-boom');
        },
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    // Commit completed despite observer throwing.
    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    assert.match(updated!, /Skipped on Apply/);
    assert.match(stderrChunks.join(''), /observer-boom/);
  });

  it('handles missing skip_reason gracefully (extract-time skip with no reason)', async () => {
    // Item is `'skipped'` but has no entry in staged_item_skip_reason —
    // this can happen for extract-time existing-task matches.
    const fixture = `---
title: "Test"
date: "2026-06-04"
status: synced
attendees:
  - name: John Koht
staged_item_status:
  ai_0042: skipped
---

## Staged Action Items
- ai_0042: A line dropped at extract time

## Transcript
.
`;
    storage.files.set(MEETING_FILE, fixture);
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    const updated = storage.files.get(MEETING_FILE);
    assert.ok(updated);
    assert.match(updated!, /Skipped on Apply/);
    assert.match(updated!, /extract-time, no reason recorded/);
  });
});

// ---------------------------------------------------------------------------
// W4 B-2: staged_item_elevated — structural elevation marker
// ---------------------------------------------------------------------------

describe('parseStagedItemElevated (W4 B-2)', () => {
  it('returns {} when the field is absent (pre-W4 meeting)', () => {
    assert.deepEqual(parseStagedItemElevated(FRONTMATTER_WITH_STATUS), {});
  });

  it('returns {} when there is no frontmatter', () => {
    assert.deepEqual(parseStagedItemElevated('# heading\nno frontmatter'), {});
  });

  it('reads true entries and drops non-true values', () => {
    const content = `---
title: M
staged_item_elevated:
  ai_001: true
  ai_002: false
  ai_003: "true"
  ai_004: 1
---

## Staged Action Items
- ai_001: keep me
`;
    const result = parseStagedItemElevated(content);
    // Only the strict-true entry survives — false/string/number all drop.
    assert.deepEqual(result, { ai_001: true });
  });
});

describe('writeItemElevatedToFile (W4 B-2)', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('round-trips: written elevation is readable via parseStagedItemElevated', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    const updated = storage.files.get(MEETING_FILE)!;
    assert.deepEqual(parseStagedItemElevated(updated), { ai_001: true });
  });

  it('does NOT touch staged_item_status (elevation ≠ commit-readiness)', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    const updated = storage.files.get(MEETING_FILE)!;
    // ai_001 stays 'pending' — elevation only adds to the elevated map.
    const status = parseStagedItemStatus(updated);
    assert.equal(status['ai_001'], 'pending');
    assert.equal(status['de_001'], 'approved');
    assert.equal(status['le_001'], 'skipped');
  });

  it('preserves other frontmatter fields', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    const updated = storage.files.get(MEETING_FILE)!;
    const fm = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.equal(fm['title'], 'Test Meeting');
    assert.equal(fm['date'], '2026-03-01');
    assert.equal(fm['status'], 'synced');
  });

  it('throws when the file is not found', async () => {
    await assert.rejects(
      () => writeItemElevatedToFile(storage, '/nonexistent.md', 'ai_001'),
      /not found/,
    );
  });
});

describe('removeItemElevatedFromFile (W4 B-2 / FF-1 --remove)', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('deletes only the named id; preserves siblings in the elevated map', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    await writeItemElevatedToFile(storage, MEETING_FILE, 'de_001');
    await removeItemElevatedFromFile(storage, MEETING_FILE, 'ai_001');
    assert.deepEqual(parseStagedItemElevated(storage.files.get(MEETING_FILE)!), { de_001: true });
  });

  it('drops the elevated key entirely when the map empties', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    await removeItemElevatedFromFile(storage, MEETING_FILE, 'ai_001');
    const fm = parseYaml(storage.files.get(MEETING_FILE)!.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.equal('staged_item_elevated' in fm, false);
  });

  it('removing an absent id is a no-op (not an error)', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    await removeItemElevatedFromFile(storage, MEETING_FILE, 'de_999');
    assert.deepEqual(parseStagedItemElevated(storage.files.get(MEETING_FILE)!), { ai_001: true });
  });

  it('does NOT touch staged_item_status', async () => {
    storage.files.set(MEETING_FILE, FRONTMATTER_WITH_STATUS);
    await writeItemElevatedToFile(storage, MEETING_FILE, 'ai_001');
    await removeItemElevatedFromFile(storage, MEETING_FILE, 'ai_001');
    const status = parseStagedItemStatus(storage.files.get(MEETING_FILE)!);
    assert.equal(status['ai_001'], 'pending');
    assert.equal(status['de_001'], 'approved');
    assert.equal(status['le_001'], 'skipped');
  });
});

describe('AC-B2: commitment-rot invariant — elevation never commits (W4 B-2, BLOCKING)', () => {
  let storage: ReturnType<typeof createMockStorage>;

  // A meeting whose decision is ELEVATED (chef confident keep) but NOT
  // approved — the exact reconcile-time on-disk shape.
  const ELEVATED_ONLY = `---
title: "Elevation Test"
date: "2026-06-17"
status: processed
staged_item_status:
  de_001: pending
staged_item_elevated:
  de_001: true
---

## Staged Decisions
- de_001: A confidently-kept decision

## Transcript
t.
`;

  beforeEach(() => {
    storage = createMockStorage();
    storage.files.set(MEETING_FILE, ELEVATED_ONLY);
  });

  it('meeting approve (commitApprovedItems) alone commits NOTHING for an elevated-only item', async () => {
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    // No memory file gets the elevated decision — elevation is not commit-readiness.
    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.equal(decisions, undefined, 'elevated-only item must NOT reach decisions.md via meeting approve');
  });

  it('the apply checkbox-diff promotion (status→approved, then commit) IS the sole commit path', async () => {
    // Starting from the elevated-only on-disk shape, simulate the winddown
    // apply checkbox-diff: a left-checked `[x]` item is promoted to status
    // 'approved' (winddown-apply.ts:505-506 via setItemStatus →
    // writeItemStatusToFile) BEFORE commitMeeting. (No prior meeting approve —
    // in checklist mode apply is the sole commit path; B-5 forbids the SKILL
    // from calling meeting approve.)
    await writeItemStatusToFile(storage, MEETING_FILE, 'de_001', { status: 'approved' });

    // commit — NOW it lands in memory.
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    const decisions = storage.files.get(`${MEMORY_DIR}/decisions.md`);
    assert.ok(decisions, 'after apply promotes status→approved, the item commits');
    assert.ok(decisions!.includes('A confidently-kept decision'));
  });

  it('cleanup filter strips staged_item_elevated on commit (no orphan elevated:true)', async () => {
    // Promote + commit, then assert the elevated map is gone from frontmatter.
    await writeItemStatusToFile(storage, MEETING_FILE, 'de_001', { status: 'approved' });
    await commitApprovedItems(storage, MEETING_FILE, MEMORY_DIR);
    const updated = storage.files.get(MEETING_FILE)!;
    assert.deepEqual(parseStagedItemElevated(updated), {}, 'committed item must not keep an orphan elevated:true');
  });
});

// ---------------------------------------------------------------------------
// writeMeetingTopicsToFile (CHR-W4 Piece 2 — chef topic-review write surface)
// ---------------------------------------------------------------------------

describe('writeMeetingTopicsToFile', () => {
  const FILE = '/workspace/meetings/status-letter.md';

  const meetingWithTopics = (topics: string): string => `---
title: "John / Jamie — Status Letter"
date: "2026-06-18"
status: synced
attendees:
  - name: John Koht
    email: john@example.com
${topics}staged_item_status:
  ai_001: pending
  de_001: approved
staged_item_elevated:
  de_001: true
---

## Staged Action Items
- ai_001: Draft the status letter

## Transcript
Body text.
`;

  let storage: ReturnType<typeof createMockStorage>;
  beforeEach(() => {
    storage = createMockStorage();
  });

  it('set: replaces the whole topics list', async () => {
    storage.files.set(FILE, meetingWithTopics('topics:\n  - glance-2-mvp\n  - multi-agent-strategy\n'));
    const res = await writeMeetingTopicsToFile(storage, FILE, 'set', [
      'status-letter-automation',
    ]);
    assert.equal(res.changed, true);
    assert.deepEqual(res.topics, ['status-letter-automation']);
    const data = parseYaml(storage.files.get(FILE)!.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.deepEqual(data['topics'], ['status-letter-automation']);
  });

  it('add: unions new slugs onto the existing list (existing order kept)', async () => {
    storage.files.set(FILE, meetingWithTopics('topics:\n  - glance-2-mvp\n'));
    const res = await writeMeetingTopicsToFile(storage, FILE, 'add', [
      'status-letter-automation',
      'glance-2-mvp', // already present — must not duplicate
    ]);
    assert.equal(res.changed, true);
    assert.deepEqual(res.topics, ['glance-2-mvp', 'status-letter-automation']);
  });

  it('remove: drops the named slugs', async () => {
    storage.files.set(
      FILE,
      meetingWithTopics('topics:\n  - glance-2-mvp\n  - multi-agent-strategy\n  - status-letter-automation\n'),
    );
    const res = await writeMeetingTopicsToFile(storage, FILE, 'remove', [
      'multi-agent-strategy',
    ]);
    assert.equal(res.changed, true);
    assert.deepEqual(res.topics, ['glance-2-mvp', 'status-letter-automation']);
  });

  it('the retag example: +status-letter-automation, -multi-agent-strategy via add+remove', async () => {
    storage.files.set(
      FILE,
      meetingWithTopics('topics:\n  - glance-2-mvp\n  - multi-agent-strategy\n'),
    );
    await writeMeetingTopicsToFile(storage, FILE, 'add', ['status-letter-automation']);
    const res = await writeMeetingTopicsToFile(storage, FILE, 'remove', ['multi-agent-strategy']);
    assert.deepEqual(res.topics, ['glance-2-mvp', 'status-letter-automation']);
  });

  it('PRESERVES sibling frontmatter — NEVER touches staged_item_status / staged_item_elevated', async () => {
    storage.files.set(FILE, meetingWithTopics('topics:\n  - glance-2-mvp\n'));
    await writeMeetingTopicsToFile(storage, FILE, 'set', ['status-letter-automation']);
    const updated = storage.files.get(FILE)!;
    // Staged-item maps untouched (the orthogonality AC).
    assert.deepEqual(parseStagedItemStatus(updated), {
      ai_001: 'pending',
      de_001: 'approved',
    });
    assert.deepEqual(parseStagedItemElevated(updated), { de_001: true });
    // Other scalar frontmatter preserved.
    const data = parseYaml(updated.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.equal(data['title'], 'John / Jamie — Status Letter');
    assert.equal(data['date'], '2026-06-18');
    assert.equal(data['status'], 'synced');
    assert.ok(Array.isArray(data['attendees']));
    // Body preserved.
    assert.ok(updated.includes('## Transcript'));
    assert.ok(updated.includes('- ai_001: Draft the status letter'));
  });

  it('add onto a meeting with NO topics field initializes it', async () => {
    storage.files.set(FILE, meetingWithTopics(''));
    const res = await writeMeetingTopicsToFile(storage, FILE, 'add', ['status-letter-automation']);
    assert.equal(res.changed, true);
    assert.deepEqual(res.topics, ['status-letter-automation']);
  });

  it('remove that empties the list drops the topics key entirely', async () => {
    storage.files.set(FILE, meetingWithTopics('topics:\n  - glance-2-mvp\n'));
    const res = await writeMeetingTopicsToFile(storage, FILE, 'remove', ['glance-2-mvp']);
    assert.equal(res.changed, true);
    assert.deepEqual(res.topics, []);
    const data = parseYaml(storage.files.get(FILE)!.match(/^---\n([\s\S]*?)\n---/)![1]) as Record<string, unknown>;
    assert.ok(!('topics' in data), 'empty topics key should be dropped');
  });

  it('idempotent: a no-op set returns changed:false and does not rewrite', async () => {
    storage.files.set(FILE, meetingWithTopics('topics:\n  - glance-2-mvp\n'));
    const before = storage.files.get(FILE)!;
    const res = await writeMeetingTopicsToFile(storage, FILE, 'set', ['glance-2-mvp']);
    assert.equal(res.changed, false);
    assert.equal(storage.files.get(FILE)!, before, 'no-op must not rewrite the file');
  });

  it('trims and dedups input slugs; ignores blanks', async () => {
    storage.files.set(FILE, meetingWithTopics(''));
    const res = await writeMeetingTopicsToFile(storage, FILE, 'set', [
      '  status-letter-automation  ',
      'status-letter-automation',
      '',
      '   ',
    ]);
    assert.deepEqual(res.topics, ['status-letter-automation']);
  });

  it('throws when the meeting file does not exist', async () => {
    await assert.rejects(
      () => writeMeetingTopicsToFile(storage, '/workspace/meetings/missing.md', 'add', ['x']),
      /Meeting file not found/,
    );
  });
});
