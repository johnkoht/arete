/**
 * Tests for meeting context service.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMeetingContext } from '../../src/services/meeting-context.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { getSearchProvider } from '../../src/search/factory.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { MeetingContextDeps } from '../../src/services/meeting-context.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeMeetingFile(
  root: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body: string,
): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => `  - ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n')}`;
      }
      return `${k}: ${v == null ? '' : JSON.stringify(v)}`;
    })
    .join('\n');
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n\n${body}`, 'utf8');
}

function writeAgendaFile(
  root: string,
  filename: string,
  content: string,
): void {
  const dir = join(root, 'now', 'agendas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content, 'utf8');
}

function writePersonFile(
  root: string,
  category: string,
  slug: string,
  frontmatter: Record<string, unknown>,
  body: string = '',
): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${yaml}\n---\n\n# ${frontmatter.name}\n\n${body}`,
    'utf8',
  );
}

function createDeps(root: string, paths: WorkspacePaths): MeetingContextDeps {
  const storage = new FileStorageAdapter();
  const search = getSearchProvider(root);
  const entity = new EntityService(storage, search);
  const context = new ContextService(storage, search);
  const memory = new MemoryService(storage, search);
  const intelligence = new IntelligenceService(context, memory, entity);
  return { storage, intelligence, entity, paths };
}

describe('buildMeetingContext', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let deps: MeetingContextDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meeting-ctx-'));
    paths = makePaths(tmpDir);
    deps = createDeps(tmpDir, paths);
    // Create workspace marker
    mkdirSync(join(tmpDir, '.arete'), { recursive: true });
    writeFileSync(join(tmpDir, 'arete.yaml'), 'version: 1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('meeting parsing', () => {
    it('reads meeting file with title, date, and transcript', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-product-sync.md', {
        title: 'Product Sync',
        date: '2026-03-19',
        attendees: [],
      }, '## Transcript\n\nThis is the meeting transcript.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-product-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.equal(bundle.meeting.title, 'Product Sync');
      assert.equal(bundle.meeting.date, '2026-03-19');
      assert.ok(bundle.meeting.transcript.includes('This is the meeting transcript'));
    });

    it('handles ISO date with time', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-standup.md', {
        title: 'Standup',
        date: '2026-03-19T10:00:00.000Z',
        attendees: [],
      }, 'Standup notes.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-standup.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.equal(bundle.meeting.date, '2026-03-19');
    });

    it('extracts attendees from frontmatter array', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-team.md', {
        title: 'Team Meeting',
        date: '2026-03-19',
        attendees: [
          { name: 'Jane Doe', email: 'jane@acme.com' },
          { name: 'John Smith', email: 'john@acme.com' },
        ],
      }, 'Meeting content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-team.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.deepEqual(bundle.meeting.attendees, ['jane@acme.com', 'john@acme.com']);
    });

    it('throws error for missing meeting file', async () => {
      const meetingPath = join(tmpDir, 'resources', 'meetings', 'nonexistent.md');
      await assert.rejects(
        buildMeetingContext(meetingPath, deps),
        /Meeting file not found/,
      );
    });
  });

  describe('agenda lookup', () => {
    it('finds agenda from frontmatter agenda field', async () => {
      writeAgendaFile(tmpDir, '2026-03-19-product-sync.md', `---
title: Product Sync Agenda
---

## Topics
- [ ] Item 1
- [x] Item 2
- [ ] Item 3
`);

      writeMeetingFile(tmpDir, '2026-03-19-product-sync.md', {
        title: 'Product Sync',
        date: '2026-03-19',
        attendees: [],
        agenda: 'now/agendas/2026-03-19-product-sync.md',
      }, 'Meeting content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-product-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.ok(bundle.agenda, 'Agenda should be found');
      assert.equal(bundle.agenda!.items.length, 3);
      assert.deepEqual(bundle.agenda!.unchecked, ['Item 1', 'Item 3']);
    });

    it('finds agenda via fuzzy match when no frontmatter', async () => {
      writeAgendaFile(tmpDir, '2026-03-19-product-sync.md', `---
title: Product Sync
---

## Topics
- [ ] Unchecked item
`);

      writeMeetingFile(tmpDir, '2026-03-19-product-sync.md', {
        title: 'Product Sync',
        date: '2026-03-19',
        attendees: [],
        // No agenda field - should fuzzy match by date and title
      }, 'Meeting content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-product-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.ok(bundle.agenda, 'Agenda should be found via fuzzy match');
      assert.ok(bundle.agenda!.unchecked.includes('Unchecked item'));
    });

    it('skips agenda lookup when skipAgenda option is true', async () => {
      writeAgendaFile(tmpDir, '2026-03-19-product-sync.md', `- [ ] Item`);

      writeMeetingFile(tmpDir, '2026-03-19-product-sync.md', {
        title: 'Product Sync',
        date: '2026-03-19',
        attendees: [],
        agenda: 'now/agendas/2026-03-19-product-sync.md',
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-product-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipAgenda: true });

      assert.equal(bundle.agenda, null);
    });

    it('returns null agenda when no matching agenda found', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-random.md', {
        title: 'Random Meeting',
        date: '2026-03-19',
        attendees: [],
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-random.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.equal(bundle.agenda, null);
    });
  });

  describe('attendee resolution', () => {
    it('resolves known attendees to person profiles', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
        role: 'Product Manager',
      }, 'Jane is a product manager at Acme.');

      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [{ name: 'Jane Doe', email: 'jane@acme.com' }],
      }, 'Meeting with Jane.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.equal(bundle.attendees.length, 1);
      assert.equal(bundle.attendees[0].slug, 'jane-doe');
      assert.equal(bundle.attendees[0].name, 'Jane Doe');
      assert.equal(bundle.attendees[0].category, 'internal');
      assert.equal(bundle.unknownAttendees.length, 0);
    });

    it('collects unknown attendees', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-external.md', {
        title: 'External Meeting',
        date: '2026-03-19',
        attendees: [{ name: 'Unknown Person', email: 'unknown@external.com' }],
      }, 'Meeting content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-external.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.equal(bundle.attendees.length, 0);
      assert.equal(bundle.unknownAttendees.length, 1);
      assert.equal(bundle.unknownAttendees[0].email, 'unknown@external.com');
      assert.equal(bundle.unknownAttendees[0].name, 'Unknown Person');
    });

    it('adds warning for unresolved attendees', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-meeting.md', {
        title: 'Meeting',
        date: '2026-03-19',
        attendees: [{ name: 'Nobody', email: 'nobody@nowhere.com' }],
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-meeting.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.ok(bundle.warnings.some((w) => w.includes('No profile found')));
    });

    it('skips attendee resolution when skipPeople option is true', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });

      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [{ name: 'Jane Doe', email: 'jane@acme.com' }],
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.equal(bundle.attendees.length, 0);
      assert.equal(bundle.unknownAttendees.length, 0);
    });
  });

  describe('warnings', () => {
    it('collects agenda warnings when agenda file not found', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-meeting.md', {
        title: 'Meeting',
        date: '2026-03-19',
        attendees: [],
        agenda: 'now/agendas/nonexistent.md',
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-meeting.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      assert.ok(bundle.warnings.some((w) => w.includes('Agenda file not found')));
      assert.equal(bundle.agenda, null);
    });
  });

  describe('related context', () => {
    it('returns empty related context when brief service has no results', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-empty.md', {
        title: 'Empty Meeting',
        date: '2026-03-19',
        attendees: [],
      }, 'No related content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-empty.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      // Should have empty arrays (brief service may not find anything)
      assert.ok(Array.isArray(bundle.relatedContext.goals));
      assert.ok(Array.isArray(bundle.relatedContext.projects));
      assert.ok(Array.isArray(bundle.relatedContext.recentDecisions));
      assert.ok(Array.isArray(bundle.relatedContext.recentLearnings));
    });
  });

  describe('attendee_ids parsing', () => {
    it('parses attendee_ids from frontmatter as string[]', async () => {
      // Create a person to resolve
      writePersonFile(tmpDir, 'internal', 'slug-a', {
        name: 'Person A',
        email: 'a@example.com',
        category: 'internal',
      });

      // Create meeting with attendee_ids
      writeMeetingFile(tmpDir, '2026-03-19-with-ids.md', {
        title: 'Meeting With IDs',
        date: '2026-03-19',
        attendees: [{ name: 'Person A', email: 'a@example.com' }],
        attendee_ids: ['slug-a', 'slug-b'],
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-with-ids.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      // Meeting should parse successfully
      assert.equal(bundle.meeting.title, 'Meeting With IDs');
      assert.equal(bundle.meeting.date, '2026-03-19');
    });

    it('handles frontmatter without attendee_ids gracefully', async () => {
      // Create meeting WITHOUT attendee_ids
      writeMeetingFile(tmpDir, '2026-03-19-no-ids.md', {
        title: 'Meeting Without IDs',
        date: '2026-03-19',
        attendees: [],
      }, 'Content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-no-ids.md');
      
      // Should not throw - attendee_ids: undefined is valid
      const bundle = await buildMeetingContext(meetingPath, deps);
      assert.equal(bundle.meeting.title, 'Meeting Without IDs');
    });

    it('finds person in recent meetings via attendee_ids when not in attendees array', async () => {
      // Create person - they will be found via attendee_ids
      writePersonFile(tmpDir, 'internal', 'bob-smith', {
        name: 'Bob Smith',
        email: 'bob@example.com',
        category: 'internal',
      });

      // Create another person whose meeting we'll build context for
      writePersonFile(tmpDir, 'internal', 'alice-jones', {
        name: 'Alice Jones',
        email: 'alice@example.com',
        category: 'internal',
      });

      // Create a meeting where Bob is in attendee_ids but NOT in attendees array
      writeMeetingFile(tmpDir, '2026-03-18-past-meeting.md', {
        title: 'Past Meeting with Bob',
        date: '2026-03-18',
        attendees: [],  // Bob is NOT in attendees array
        attendee_ids: ['bob-smith'],  // But IS in attendee_ids
      }, 'This meeting had Bob.');

      // Create the main meeting (with Alice) to build context for
      writeMeetingFile(tmpDir, '2026-03-19-current.md', {
        title: 'Current Meeting',
        date: '2026-03-19',
        attendees: [{ name: 'Bob Smith', email: 'bob@example.com' }],
      }, 'Meeting content.');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-current.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      // Bob should be resolved and his recentMeetings should include 'Past Meeting with Bob'
      const bob = bundle.attendees.find(a => a.slug === 'bob-smith');
      assert.ok(bob, 'Bob should be resolved');
      assert.ok(
        bob.recentMeetings.includes('Past Meeting with Bob'),
        `Bob's recent meetings should include 'Past Meeting with Bob', got: ${bob.recentMeetings.join(', ')}`
      );
    });
  });

  describe('integration: meeting with agenda and known attendees', () => {
    it('builds complete context bundle', async () => {
      // Create person
      writePersonFile(
        tmpDir,
        'customers',
        'alice-jones',
        {
          name: 'Alice Jones',
          email: 'alice@customer.com',
          category: 'customers',
          company: 'Customer Corp',
        },
        `Alice is a key stakeholder.

### Stances
- **Pricing**: prefers: Annual contracts are preferred

### Open Items (I owe them)
- Send updated roadmap
`,
      );

      // Create agenda
      writeAgendaFile(tmpDir, '2026-03-19-customer-sync.md', `---
title: Customer Sync Agenda
---

## Discussion
- [ ] Review contract terms
- [x] Discuss timeline
- [ ] Next steps
`);

      // Create meeting
      writeMeetingFile(tmpDir, '2026-03-19-customer-sync.md', {
        title: 'Customer Sync',
        date: '2026-03-19',
        attendees: [{ name: 'Alice Jones', email: 'alice@customer.com' }],
        agenda: 'now/agendas/2026-03-19-customer-sync.md',
      }, `## Summary
We discussed contract terms with Alice.

## Transcript
Alice: Can we review the contract terms?
Me: Sure, let me walk through the key points.
`);

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-customer-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      // Verify meeting section
      assert.equal(bundle.meeting.title, 'Customer Sync');
      assert.equal(bundle.meeting.date, '2026-03-19');
      assert.deepEqual(bundle.meeting.attendees, ['alice@customer.com']);
      assert.ok(bundle.meeting.transcript.length > 0);

      // Verify agenda section
      assert.ok(bundle.agenda, 'Agenda should exist');
      assert.equal(bundle.agenda!.items.length, 3);
      assert.deepEqual(bundle.agenda!.unchecked, ['Review contract terms', 'Next steps']);

      // Verify attendee resolution
      assert.equal(bundle.attendees.length, 1);
      assert.equal(bundle.attendees[0].slug, 'alice-jones');
      assert.equal(bundle.attendees[0].name, 'Alice Jones');
      assert.equal(bundle.attendees[0].category, 'customers');
      assert.ok(bundle.attendees[0].profile.includes('key stakeholder'));
      assert.ok(bundle.attendees[0].stances.length >= 1);
      assert.ok(bundle.attendees[0].openItems.length >= 1);

      // Verify no unknown attendees
      assert.equal(bundle.unknownAttendees.length, 0);

      // Verify warnings (should be empty or only brief service warnings)
      const realWarnings = bundle.warnings.filter((w) => !w.includes('Brief service'));
      assert.equal(realWarnings.length, 0, `Unexpected warnings: ${realWarnings.join(', ')}`);
    });
  });
});
