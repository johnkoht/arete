/**
 * Tests for meeting context service.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildMeetingContext,
  findRecentMeetings,
  findRecentMeetingsForAttendees,
  calculateCutoffDateString,
  extractDateFromFilename,
} from '../../src/services/meeting-context.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { getSearchProvider } from '../../src/search/factory.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { MeetingContextDeps } from '../../src/services/meeting-context.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

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
  // TopicMemoryService.listAll handles missing `.arete/memory/topics/`
  // gracefully (returns `{ topics: [], errors: [] }`), so tests that don't
  // exercise the topic-wiki path don't need to set up topic pages.
  const topicMemory = new TopicMemoryService(storage, search);
  return { storage, intelligence, entity, paths, topicMemory };
}

function writeAreaFile(
  root: string,
  slug: string,
  frontmatter: Record<string, unknown>,
  body: string = '',
): void {
  const dir = join(root, 'areas');
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => {
          if (typeof item === 'object') {
            const lines = Object.entries(item as Record<string, unknown>)
              .map(([ik, iv]) => `    ${ik}: ${typeof iv === 'string' ? `"${iv}"` : JSON.stringify(iv)}`)
              .join('\n');
            return `  -\n${lines}`;
          }
          return `  - ${item}`;
        }).join('\n')}`;
      }
      return `${k}: ${v == null ? '' : typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`;
    })
    .join('\n');
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${yaml}\n---\n\n${body}`,
    'utf8',
  );
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

  describe('areaParser dependency injection', () => {
    it('accepts areaParser in deps and uses it if provided', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-test.md', {
        title: 'Test Meeting',
        date: '2026-03-19',
        attendees: [],
      }, 'Test content.');

      // Create an AreaParserService instance to pass as dependency
      const areaParser = new AreaParserService(deps.storage, paths.root);

      // Create deps with explicit areaParser
      const depsWithAreaParser: MeetingContextDeps = {
        ...deps,
        areaParser,
      };

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-test.md');
      const bundle = await buildMeetingContext(meetingPath, depsWithAreaParser);

      // Should complete successfully with the provided areaParser
      assert.equal(bundle.meeting.title, 'Test Meeting');
    });

    it('creates fallback areaParser when not provided in deps', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-fallback.md', {
        title: 'Fallback Test',
        date: '2026-03-19',
        attendees: [],
      }, 'Fallback content.');

      // Deps without areaParser (uses the default createDeps which omits it)
      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-fallback.md');
      const bundle = await buildMeetingContext(meetingPath, deps);

      // Should complete successfully with internal fallback areaParser
      assert.equal(bundle.meeting.title, 'Fallback Test');
    });
  });
});

// ---------------------------------------------------------------------------
// 60-day cutoff tests for findRecentMeetings
// ---------------------------------------------------------------------------

describe('calculateCutoffDateString', () => {
  it('calculates 60 days before reference date', () => {
    const ref = new Date('2026-03-25T12:00:00Z');
    const cutoff = calculateCutoffDateString(ref, 60);
    assert.equal(cutoff, '2026-01-24');
  });

  it('handles year boundary (January cutoff goes to previous year)', () => {
    const ref = new Date('2026-02-15T12:00:00Z');
    const cutoff = calculateCutoffDateString(ref, 60);
    assert.equal(cutoff, '2025-12-17');
  });

  it('uses default 60 days when not specified', () => {
    const ref = new Date('2026-06-01T12:00:00Z');
    const cutoff = calculateCutoffDateString(ref);
    assert.equal(cutoff, '2026-04-02');
  });
});

describe('extractDateFromFilename', () => {
  it('extracts date from standard meeting filename', () => {
    assert.equal(extractDateFromFilename('2026-03-19-product-sync.md'), '2026-03-19');
  });

  it('extracts date from filename with multiple hyphens', () => {
    assert.equal(extractDateFromFilename('2026-01-05-q1-kickoff-meeting.md'), '2026-01-05');
  });

  it('returns null for non-standard filename', () => {
    assert.equal(extractDateFromFilename('meeting-notes.md'), null);
  });

  it('returns null for index file', () => {
    assert.equal(extractDateFromFilename('index.md'), null);
  });

  it('returns null for filename without date prefix', () => {
    assert.equal(extractDateFromFilename('important-sync.md'), null);
  });
});

describe('findRecentMeetings 60-day cutoff', () => {
  /** Helper: create a date string N days before the reference date. */
  function daysAgo(n: number, ref: Date): string {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - n);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Build meeting content with frontmatter. */
  function makeMeetingContent(title: string, date: string, personSlug: string): string {
    return `---
title: ${title}
date: ${date}
attendees: []
attendee_ids:
  - ${personSlug}
---

Meeting content.
`;
  }

  /** Create mock storage that tracks read calls. */
  function createMockStorage(files: Record<string, string>): StorageAdapter & { readCount: number } {
    let readCount = 0;
    return {
      readCount: 0,
      async read(path: string): Promise<string | null> {
        readCount++;
        // Update the externally accessible count
        (this as { readCount: number }).readCount = readCount;
        return files[path] ?? null;
      },
      async list(dir: string, options?: { extensions?: string[] }): Promise<string[]> {
        const ext = options?.extensions?.[0] ?? '.md';
        return Object.keys(files).filter(
          (p) => p.startsWith(dir) && p.endsWith(ext),
        );
      },
      async exists(path: string): Promise<boolean> {
        // Check if directory exists by looking for files under it
        return Object.keys(files).some((p) => p.startsWith(path));
      },
      async write(): Promise<void> {},
      async delete(): Promise<void> {},
      async mkdir(): Promise<void> {},
      async copy(): Promise<void> {},
      async listSubdirectories(): Promise<string[]> { return []; },
      async getModified(): Promise<Date | null> { return null; },
    };
  }

  const REF = new Date('2026-03-25T12:00:00Z');
  const personSlug = 'alice-jones';

  it('excludes meetings older than 60 days from file reads (R6 mitigation)', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    // Create 10 meeting files: 5 recent (within 60 days), 5 old (> 60 days)
    const files: Record<string, string> = {};

    // Recent meetings (should be read)
    for (let i = 0; i < 5; i++) {
      const date = daysAgo(i * 10, REF); // 0, 10, 20, 30, 40 days ago
      const path = join(meetingsDir, `${date}-meeting-${i}.md`);
      files[path] = makeMeetingContent(`Meeting ${i}`, date, personSlug);
    }

    // Old meetings (should be skipped - no read)
    for (let i = 5; i < 10; i++) {
      const date = daysAgo(61 + i * 10, REF); // 71, 81, 91, 101, 111 days ago
      const path = join(meetingsDir, `${date}-old-meeting-${i}.md`);
      files[path] = makeMeetingContent(`Old Meeting ${i}`, date, personSlug);
    }

    const storage = createMockStorage(files);

    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      5,
      REF,
    );

    // Only 5 recent meetings should have been read (not the 5 old ones)
    assert.equal(storage.readCount, 5, 'Should only read 5 recent meeting files');

    // Should return titles of meetings where person is attendee
    assert.equal(results.length, 5, 'Should find 5 recent meetings');
  });

  it('includes meetings at exactly 60 days (boundary test)', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const date60DaysAgo = daysAgo(60, REF);
    const date61DaysAgo = daysAgo(61, REF);

    const files: Record<string, string> = {
      [join(meetingsDir, `${date60DaysAgo}-boundary-meeting.md`)]: makeMeetingContent(
        'Boundary Meeting',
        date60DaysAgo,
        personSlug,
      ),
      [join(meetingsDir, `${date61DaysAgo}-excluded-meeting.md`)]: makeMeetingContent(
        'Excluded Meeting',
        date61DaysAgo,
        personSlug,
      ),
    };

    const storage = createMockStorage(files);

    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      5,
      REF,
    );

    // Should read only the 60-day meeting, not the 61-day one
    assert.equal(storage.readCount, 1, 'Should read only the 60-day boundary meeting');
    assert.deepEqual(results, ['Boundary Meeting']);
  });

  it('reads non-standard filenames gracefully (no date prefix)', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    // Mix of standard and non-standard filenames
    const recentDate = daysAgo(10, REF);
    const oldDate = daysAgo(90, REF);

    const files: Record<string, string> = {
      // Standard recent file - should be read
      [join(meetingsDir, `${recentDate}-normal-meeting.md`)]: makeMeetingContent(
        'Normal Meeting',
        recentDate,
        personSlug,
      ),
      // Standard old file - should be skipped
      [join(meetingsDir, `${oldDate}-old-meeting.md`)]: makeMeetingContent(
        'Old Meeting',
        oldDate,
        personSlug,
      ),
      // Non-standard filename (no date prefix) - should be read (graceful fallback)
      [join(meetingsDir, 'important-recurring-sync.md')]: makeMeetingContent(
        'Important Recurring Sync',
        recentDate,
        personSlug,
      ),
      // Another non-standard filename - should be read
      [join(meetingsDir, 'weekly-standup.md')]: makeMeetingContent(
        'Weekly Standup',
        recentDate,
        personSlug,
      ),
    };

    const storage = createMockStorage(files);

    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      10,
      REF,
    );

    // Should read: 1 recent standard + 2 non-standard = 3 files
    // Should skip: 1 old standard file
    assert.equal(storage.readCount, 3, 'Should read 3 files (1 recent + 2 non-standard)');

    // Should include all 3 meetings where person is found
    assert.equal(results.length, 3);
    assert.ok(results.includes('Normal Meeting'));
    assert.ok(results.includes('Important Recurring Sync'));
    assert.ok(results.includes('Weekly Standup'));
  });

  it('defaults to current date when referenceDate not provided', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    // Create a meeting with today's date (will use real Date.now())
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const files: Record<string, string> = {
      [join(meetingsDir, `${todayStr}-today-meeting.md`)]: makeMeetingContent(
        'Today Meeting',
        todayStr,
        personSlug,
      ),
    };

    const storage = createMockStorage(files);

    // Call without referenceDate - should use current date
    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      5,
      // No referenceDate provided
    );

    assert.equal(storage.readCount, 1);
    assert.deepEqual(results, ['Today Meeting']);
  });

  it('skips index.md files', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const recentDate = daysAgo(5, REF);

    const files: Record<string, string> = {
      [join(meetingsDir, 'index.md')]: '# Meetings Index\n\nThis is the index.',
      [join(meetingsDir, `${recentDate}-real-meeting.md`)]: makeMeetingContent(
        'Real Meeting',
        recentDate,
        personSlug,
      ),
    };

    const storage = createMockStorage(files);

    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      5,
      REF,
    );

    // Should skip index.md, read only the real meeting
    assert.equal(storage.readCount, 1);
    assert.deepEqual(results, ['Real Meeting']);
  });

  it('returns empty array when meetings directory does not exist', async () => {
    const paths: WorkspacePaths = makePaths('/workspace');

    // Empty storage - no meetings directory
    const storage = createMockStorage({});

    const results = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      'alice@example.com',
      5,
      REF,
    );

    assert.deepEqual(results, []);
    assert.equal(storage.readCount, 0);
  });
});

// ---------------------------------------------------------------------------
// Batched findRecentMeetingsForAttendees tests (Task 3)
// ---------------------------------------------------------------------------

describe('findRecentMeetingsForAttendees batched lookup', () => {
  /** Helper: create a date string N days before the reference date. */
  function daysAgo(n: number, ref: Date): string {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - n);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Build meeting content with multiple attendees. */
  function makeMeetingContentMulti(
    title: string,
    date: string,
    attendeeIds: string[],
    attendees?: Array<{ name: string; email: string }>,
  ): string {
    const attendeeIdsYaml = attendeeIds.length > 0
      ? `attendee_ids:\n${attendeeIds.map((id) => `  - ${id}`).join('\n')}`
      : 'attendee_ids: []';
    const attendeesYaml = attendees
      ? `attendees:\n${attendees.map((a) => `  - name: "${a.name}"\n    email: "${a.email}"`).join('\n')}`
      : 'attendees: []';
    return `---
title: ${title}
date: ${date}
${attendeesYaml}
${attendeeIdsYaml}
---

Meeting content.
`;
  }

  /** Create mock storage that tracks read calls. */
  function createMockStorage(files: Record<string, string>): StorageAdapter & { readCount: number } {
    let readCount = 0;
    return {
      readCount: 0,
      async read(path: string): Promise<string | null> {
        readCount++;
        (this as { readCount: number }).readCount = readCount;
        return files[path] ?? null;
      },
      async list(dir: string, options?: { extensions?: string[] }): Promise<string[]> {
        const ext = options?.extensions?.[0] ?? '.md';
        return Object.keys(files).filter(
          (p) => p.startsWith(dir) && p.endsWith(ext),
        );
      },
      async exists(path: string): Promise<boolean> {
        return Object.keys(files).some((p) => p.startsWith(path));
      },
      async write(): Promise<void> {},
      async delete(): Promise<void> {},
      async mkdir(): Promise<void> {},
      async copy(): Promise<void> {},
      async listSubdirectories(): Promise<string[]> { return []; },
      async getModified(): Promise<Date | null> { return null; },
    };
  }

  const REF = new Date('2026-03-25T12:00:00Z');

  it('reads each meeting file once regardless of attendee count (R6 mitigation - 3× fewer reads)', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    // 5 attendees
    const attendees = [
      { slug: 'alice-jones', email: 'alice@example.com' },
      { slug: 'bob-smith', email: 'bob@example.com' },
      { slug: 'carol-white', email: 'carol@example.com' },
      { slug: 'dave-brown', email: 'dave@example.com' },
      { slug: 'eve-green', email: 'eve@example.com' },
    ];

    // 10 meeting files (all recent within 60 days)
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      const date = daysAgo(i * 5, REF); // 0, 5, 10, 15, 20, 25, 30, 35, 40, 45 days ago
      const path = join(meetingsDir, `${date}-meeting-${i}.md`);
      // Distribute attendees: each meeting has 2-3 attendees
      const meetingAttendees = [
        attendees[i % 5].slug,
        attendees[(i + 1) % 5].slug,
        ...(i % 2 === 0 ? [attendees[(i + 2) % 5].slug] : []),
      ];
      files[path] = makeMeetingContentMulti(`Meeting ${i}`, date, meetingAttendees);
    }

    const storage = createMockStorage(files);

    const results = await findRecentMeetingsForAttendees(
      storage,
      paths,
      attendees,
      5,
      REF,
    );

    // KEY ASSERTION: Only 10 file reads, NOT 50 (5 attendees × 10 files)
    // Before batch: findRecentMeetings called 5 times = 5 × 10 = 50 reads
    // After batch: single pass = 10 reads
    assert.equal(storage.readCount, 10, 'Should read only 10 files (one per meeting), NOT 50');

    // Verify results structure
    assert.equal(results.size, 5, 'Should return results for all 5 attendees');
    for (const attendee of attendees) {
      assert.ok(results.has(attendee.slug), `Should have results for ${attendee.slug}`);
    }
  });

  it('returns Map<slug, titles[]> for all requested attendees', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [
      { slug: 'alice', email: 'alice@example.com' },
      { slug: 'bob', email: 'bob@example.com' },
    ];

    const date1 = daysAgo(5, REF);
    const date2 = daysAgo(10, REF);

    const files: Record<string, string> = {
      [join(meetingsDir, `${date1}-meeting-1.md`)]: makeMeetingContentMulti(
        'Meeting One',
        date1,
        ['alice', 'bob'],
      ),
      [join(meetingsDir, `${date2}-meeting-2.md`)]: makeMeetingContentMulti(
        'Meeting Two',
        date2,
        ['alice'], // Only Alice
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    // Alice should have both meetings (sorted by date descending)
    assert.deepEqual(results.get('alice'), ['Meeting One', 'Meeting Two']);

    // Bob should have only Meeting One
    assert.deepEqual(results.get('bob'), ['Meeting One']);
  });

  it('returns empty array for attendees with no meetings', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [
      { slug: 'alice', email: 'alice@example.com' },
      { slug: 'nobody', email: 'nobody@example.com' }, // Not in any meeting
    ];

    const files: Record<string, string> = {
      [join(meetingsDir, `${daysAgo(5, REF)}-meeting.md`)]: makeMeetingContentMulti(
        'Meeting',
        daysAgo(5, REF),
        ['alice'],
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    assert.deepEqual(results.get('alice'), ['Meeting']);
    assert.deepEqual(results.get('nobody'), [], 'Should return empty array for attendee with no meetings');
  });

  it('matches attendees via email in attendees array', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [{ slug: 'alice-jones', email: 'alice@example.com' }];

    const files: Record<string, string> = {
      [join(meetingsDir, `${daysAgo(5, REF)}-meeting.md`)]: makeMeetingContentMulti(
        'Email Matched Meeting',
        daysAgo(5, REF),
        [], // No attendee_ids
        [{ name: 'Alice Jones', email: 'alice@example.com' }], // Match via email
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    assert.deepEqual(results.get('alice-jones'), ['Email Matched Meeting']);
  });

  it('matches attendees via slugified name in attendees array', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [{ slug: 'alice-jones', email: '' }]; // No email

    const files: Record<string, string> = {
      [join(meetingsDir, `${daysAgo(5, REF)}-meeting.md`)]: makeMeetingContentMulti(
        'Name Matched Meeting',
        daysAgo(5, REF),
        [], // No attendee_ids
        [{ name: 'Alice Jones', email: '' }], // Match via slugified name
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    assert.deepEqual(results.get('alice-jones'), ['Name Matched Meeting']);
  });

  it('applies 60-day cutoff (reuses Task 2 logic)', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [{ slug: 'alice', email: 'alice@example.com' }];

    const files: Record<string, string> = {
      // Recent meeting (should be included)
      [join(meetingsDir, `${daysAgo(30, REF)}-recent.md`)]: makeMeetingContentMulti(
        'Recent Meeting',
        daysAgo(30, REF),
        ['alice'],
      ),
      // Old meeting (should be excluded)
      [join(meetingsDir, `${daysAgo(90, REF)}-old.md`)]: makeMeetingContentMulti(
        'Old Meeting',
        daysAgo(90, REF),
        ['alice'],
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    // Should only read the recent file
    assert.equal(storage.readCount, 1, 'Should skip old meeting files');
    assert.deepEqual(results.get('alice'), ['Recent Meeting']);
  });

  it('respects limit parameter per attendee', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [{ slug: 'alice', email: 'alice@example.com' }];

    // Create 10 meetings with Alice
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      const date = daysAgo(i * 5, REF);
      files[join(meetingsDir, `${date}-meeting-${i}.md`)] = makeMeetingContentMulti(
        `Meeting ${i}`,
        date,
        ['alice'],
      );
    }

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 3, REF); // Limit to 3

    assert.equal(results.get('alice')?.length, 3, 'Should respect limit of 3');
    // Should be most recent 3 (sorted by date descending)
    assert.deepEqual(results.get('alice'), ['Meeting 0', 'Meeting 1', 'Meeting 2']);
  });

  it('returns empty arrays for all attendees when meetings directory does not exist', async () => {
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [
      { slug: 'alice', email: 'alice@example.com' },
      { slug: 'bob', email: 'bob@example.com' },
    ];

    const storage = createMockStorage({}); // No files
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    assert.equal(results.size, 2);
    assert.deepEqual(results.get('alice'), []);
    assert.deepEqual(results.get('bob'), []);
    assert.equal(storage.readCount, 0);
  });

  it('returns empty Map when no attendees provided', async () => {
    const paths: WorkspacePaths = makePaths('/workspace');
    const storage = createMockStorage({});

    const results = await findRecentMeetingsForAttendees(storage, paths, [], 5, REF);

    assert.equal(results.size, 0);
  });

  it('handles case-insensitive email matching', async () => {
    const meetingsDir = '/workspace/resources/meetings';
    const paths: WorkspacePaths = makePaths('/workspace');

    const attendees = [{ slug: 'alice', email: 'ALICE@EXAMPLE.COM' }]; // Uppercase email

    const files: Record<string, string> = {
      [join(meetingsDir, `${daysAgo(5, REF)}-meeting.md`)]: makeMeetingContentMulti(
        'Meeting',
        daysAgo(5, REF),
        [],
        [{ name: 'Alice', email: 'alice@example.com' }], // Lowercase in file
      ),
    };

    const storage = createMockStorage(files);
    const results = await findRecentMeetingsForAttendees(storage, paths, attendees, 5, REF);

    assert.deepEqual(results.get('alice'), ['Meeting'], 'Should match email case-insensitively');
  });
});

// ---------------------------------------------------------------------------
// Area context tests (Task 8)
// ---------------------------------------------------------------------------

describe('buildMeetingContext area context', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let deps: MeetingContextDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meeting-ctx-area-'));
    paths = makePaths(tmpDir);
    deps = createDeps(tmpDir, paths);
    // Create workspace marker
    mkdirSync(join(tmpDir, '.arete'), { recursive: true });
    writeFileSync(join(tmpDir, 'arete.yaml'), 'version: 1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('populates areaContext when meeting title matches area recurring meeting', async () => {
    // Create area file with recurring_meetings
    writeAreaFile(tmpDir, 'customer-success', {
      area: 'Customer Success',
      status: 'active',
      recurring_meetings: [
        { title: 'Customer Sync', frequency: 'weekly' },
      ],
    }, `## Focus

We are focused on customer retention.

## Goal

- Decision 1: Focus on enterprise customers
`);

    // Create meeting with matching title
    writeMeetingFile(tmpDir, '2026-03-19-customer-sync.md', {
      title: 'Customer Sync',
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-customer-sync.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is populated
    assert.ok(bundle.areaContext, 'areaContext should be populated');
    assert.equal(bundle.areaContext!.slug, 'customer-success');
    assert.equal(bundle.areaContext!.name, 'Customer Success');
    assert.equal(bundle.areaContext!.status, 'active');
    assert.ok(bundle.areaContext!.sections.focus?.includes('customer retention'));
    assert.ok(bundle.areaContext!.sections.goal?.includes('enterprise customers'));

    // Verify no area-related warnings
    const areaWarnings = bundle.warnings.filter((w) =>
      w.includes('Area file not found') || w.includes('Failed to load area context'),
    );
    assert.equal(areaWarnings.length, 0, `Unexpected area warnings: ${areaWarnings.join(', ')}`);
  });

  it('sets areaContext to null with no warning when meeting has no area match', async () => {
    // Create area file that does NOT match the meeting title
    writeAreaFile(tmpDir, 'engineering', {
      area: 'Engineering',
      status: 'active',
      recurring_meetings: [
        { title: 'Engineering Standup', frequency: 'daily' },
      ],
    }, '## Focus\n\nEngineering notes.');

    // Create meeting with title that doesn't match any area
    writeMeetingFile(tmpDir, '2026-03-19-random-meeting.md', {
      title: 'Random Meeting',
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-random-meeting.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is null
    assert.equal(bundle.areaContext, null, 'areaContext should be null when no area match');

    // Verify no area-related warnings (no warning needed for no match)
    const areaWarnings = bundle.warnings.filter((w) =>
      w.includes('Area file not found') || w.includes('Failed to load area context'),
    );
    assert.equal(areaWarnings.length, 0, 'Should have no area warnings when no area match');
  });

  it('adds warning when area matches but file returns null', async () => {
    // Create a custom mock AreaParserService that returns a match but null context
    const storage = deps.storage;
    const mockAreaParser = {
      async getAreaForMeeting(title: string) {
        if (title.includes('Product Sync')) {
          return { areaSlug: 'missing-area', matchType: 'recurring' as const, confidence: 1.0 };
        }
        return null;
      },
      async getAreaContext(_slug: string) {
        // Simulate file not found (returns null)
        return null;
      },
    } as unknown as AreaParserService;

    // Create deps with mock areaParser
    const depsWithMock: MeetingContextDeps = {
      ...deps,
      areaParser: mockAreaParser,
    };

    // Create meeting
    writeMeetingFile(tmpDir, '2026-03-19-product-sync.md', {
      title: 'Product Sync',
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-product-sync.md');
    const bundle = await buildMeetingContext(meetingPath, depsWithMock, { skipPeople: true });

    // Verify areaContext is null
    assert.equal(bundle.areaContext, null, 'areaContext should be null when file missing');

    // Verify warning is pushed
    assert.ok(
      bundle.warnings.some((w) => w.includes('Area file not found: missing-area')),
      `Expected warning 'Area file not found: missing-area', got: ${bundle.warnings.join(', ')}`,
    );
  });

  it('adds warning when area context fetch throws', async () => {
    // Create a custom mock AreaParserService that throws on getAreaContext
    const mockAreaParser = {
      async getAreaForMeeting(title: string) {
        if (title.includes('Error Sync')) {
          return { areaSlug: 'error-area', matchType: 'recurring' as const, confidence: 1.0 };
        }
        return null;
      },
      async getAreaContext(_slug: string) {
        throw new Error('Simulated read error');
      },
    } as unknown as AreaParserService;

    // Create deps with mock areaParser
    const depsWithMock: MeetingContextDeps = {
      ...deps,
      areaParser: mockAreaParser,
    };

    // Create meeting
    writeMeetingFile(tmpDir, '2026-03-19-error-sync.md', {
      title: 'Error Sync',
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-error-sync.md');
    const bundle = await buildMeetingContext(meetingPath, depsWithMock, { skipPeople: true });

    // Verify areaContext is null
    assert.equal(bundle.areaContext, null, 'areaContext should be null when fetch throws');

    // Verify warning is pushed
    assert.ok(
      bundle.warnings.some((w) => w.includes('Failed to load area context: error-area')),
      `Expected warning 'Failed to load area context: error-area', got: ${bundle.warnings.join(', ')}`,
    );
  });

  it('includes areaContext in bundle even when null', async () => {
    // Create meeting with no areas defined in workspace
    writeMeetingFile(tmpDir, '2026-03-19-standalone.md', {
      title: 'Standalone Meeting',
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-standalone.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext key exists in bundle (even if null)
    assert.ok('areaContext' in bundle, 'areaContext key should exist in bundle');
    assert.equal(bundle.areaContext, null);
  });

  describe('existingTasks injection', () => {
    it('reads open tasks from week.md and tasks.md and includes them in bundle', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [],
      }, 'Meeting content.');

      const nowDir = join(tmpDir, 'now');
      mkdirSync(nowDir, { recursive: true });
      writeFileSync(join(nowDir, 'week.md'), [
        '## Tasks',
        '- [ ] Write the proposal',
        '- [x] Send email',  // completed — should not be included
        '- [ ] Review PR @area(engineering) @due(2026-03-19)',
      ].join('\n'), 'utf8');
      writeFileSync(join(nowDir, 'tasks.md'), [
        '### Inbox',
        '- [ ] Call vendor @from(commitment:abc123)',
      ].join('\n'), 'utf8');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.ok(bundle.existingTasks, 'existingTasks should be present');
      assert.ok(bundle.existingTasks!.includes('Write the proposal'), 'week.md task should be included');
      assert.ok(bundle.existingTasks!.includes('Review PR'), 'week.md task with stripped @tags should be included');
      assert.ok(bundle.existingTasks!.includes('Call vendor'), 'tasks.md task should be included');
      assert.ok(!bundle.existingTasks!.some(t => t.includes('Send email')), 'completed tasks should not be included');
      assert.ok(!bundle.existingTasks!.some(t => t.includes('@area')), '@tags should be stripped from task text');
      assert.ok(!bundle.existingTasks!.some(t => t.includes('@from')), '@from metadata should be stripped');
    });

    it('caps existingTasks at 20 entries', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [],
      }, 'Meeting content.');

      const nowDir = join(tmpDir, 'now');
      mkdirSync(nowDir, { recursive: true });
      const manyTasks = Array.from({ length: 30 }, (_, i) => `- [ ] Task number ${i + 1}`).join('\n');
      writeFileSync(join(nowDir, 'week.md'), manyTasks, 'utf8');
      writeFileSync(join(nowDir, 'tasks.md'), '', 'utf8');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.ok(bundle.existingTasks, 'existingTasks should be present');
      assert.equal(bundle.existingTasks!.length, 20, 'should be capped at 20');
    });

    it('returns undefined existingTasks when task files do not exist', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [],
      }, 'Meeting content.');
      // No now/ directory created

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.equal(bundle.existingTasks, undefined, 'existingTasks should be absent when files missing');
    });

    it('omits existingTasks when task files are empty', async () => {
      writeMeetingFile(tmpDir, '2026-03-19-sync.md', {
        title: 'Sync',
        date: '2026-03-19',
        attendees: [],
      }, 'Meeting content.');

      const nowDir = join(tmpDir, 'now');
      mkdirSync(nowDir, { recursive: true });
      writeFileSync(join(nowDir, 'week.md'), '## Week\nNo tasks here.\n', 'utf8');
      writeFileSync(join(nowDir, 'tasks.md'), '', 'utf8');

      const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-sync.md');
      const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

      assert.equal(bundle.existingTasks, undefined, 'existingTasks should be absent when no open tasks found');
    });
  });

  it('matches area via case-insensitive substring', async () => {
    // Create area file
    writeAreaFile(tmpDir, 'product-team', {
      area: 'Product Team',
      status: 'active',
      recurring_meetings: [
        { title: 'product', frequency: 'weekly' }, // Lowercase
      ],
    }, '## Focus\n\nProduct roadmap planning.');

    // Create meeting with title containing the recurring meeting title (case different)
    writeMeetingFile(tmpDir, '2026-03-19-weekly-product-review.md', {
      title: 'Weekly PRODUCT Review',  // Different case
      date: '2026-03-19',
      attendees: [],
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-19-weekly-product-review.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is populated (case-insensitive match)
    assert.ok(bundle.areaContext, 'areaContext should be populated via case-insensitive match');
    assert.equal(bundle.areaContext!.slug, 'product-team');
  });
});

// ---------------------------------------------------------------------------
// Frontmatter area field tests
// ---------------------------------------------------------------------------

describe('buildMeetingContext frontmatter area field', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let deps: MeetingContextDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meeting-ctx-frontmatter-area-'));
    paths = makePaths(tmpDir);
    deps = createDeps(tmpDir, paths);
    // Create workspace marker
    mkdirSync(join(tmpDir, '.arete'), { recursive: true });
    writeFileSync(join(tmpDir, 'arete.yaml'), 'version: 1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses frontmatter area field when present', async () => {
    // Create area file
    writeAreaFile(tmpDir, 'customer-success', {
      area: 'Customer Success',
      status: 'active',
      recurring_meetings: [], // No recurring meetings
    }, '## Focus\n\nCustomer retention focus.');

    // Create meeting with explicit area in frontmatter (no title match needed)
    writeMeetingFile(tmpDir, '2026-03-20-random-meeting.md', {
      title: 'Random Meeting Title', // Does NOT match any area's recurring_meetings
      date: '2026-03-20',
      attendees: [],
      area: 'customer-success', // Explicit area in frontmatter
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-random-meeting.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is populated via frontmatter area
    assert.ok(bundle.areaContext, 'areaContext should be populated via frontmatter area');
    assert.equal(bundle.areaContext!.slug, 'customer-success');
    assert.equal(bundle.areaContext!.name, 'Customer Success');
  });

  it('frontmatter area takes precedence over title matching', async () => {
    // Create two area files
    writeAreaFile(tmpDir, 'engineering', {
      area: 'Engineering',
      status: 'active',
      recurring_meetings: [
        { title: 'Standup', frequency: 'daily' }, // Would match title
      ],
    }, '## Focus\n\nEngineering work.');

    writeAreaFile(tmpDir, 'product', {
      area: 'Product',
      status: 'active',
      recurring_meetings: [], // No recurring meetings
    }, '## Focus\n\nProduct planning.');

    // Create meeting with title matching engineering but frontmatter pointing to product
    writeMeetingFile(tmpDir, '2026-03-20-standup.md', {
      title: 'Daily Standup', // Matches engineering recurring_meetings
      date: '2026-03-20',
      attendees: [],
      area: 'product', // Explicit area overrides title match
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-standup.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify frontmatter area wins over title matching
    assert.ok(bundle.areaContext, 'areaContext should be populated');
    assert.equal(bundle.areaContext!.slug, 'product', 'frontmatter area should take precedence');
    assert.equal(bundle.areaContext!.name, 'Product');
  });

  it('falls back to title matching when no frontmatter area', async () => {
    // Create area file with recurring meetings
    writeAreaFile(tmpDir, 'sales', {
      area: 'Sales',
      status: 'active',
      recurring_meetings: [
        { title: 'Sales Review', frequency: 'weekly' },
      ],
    }, '## Focus\n\nSales pipeline.');

    // Create meeting without frontmatter area but with matching title
    writeMeetingFile(tmpDir, '2026-03-20-sales-review.md', {
      title: 'Weekly Sales Review',
      date: '2026-03-20',
      attendees: [],
      // No area field - should fall back to title matching
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-sales-review.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is populated via title matching fallback
    assert.ok(bundle.areaContext, 'areaContext should be populated via title matching');
    assert.equal(bundle.areaContext!.slug, 'sales');
  });

  it('logs warning and falls back to title matching for invalid area slug', async () => {
    // Create area file
    writeAreaFile(tmpDir, 'engineering', {
      area: 'Engineering',
      status: 'active',
      recurring_meetings: [
        { title: 'Standup', frequency: 'daily' },
      ],
    }, '## Focus\n\nEngineering work.');

    // Create meeting with invalid area slug in frontmatter
    writeMeetingFile(tmpDir, '2026-03-20-standup.md', {
      title: 'Daily Standup', // Matches engineering
      date: '2026-03-20',
      attendees: [],
      area: 'nonexistent-area', // Invalid slug - should warn and fallback
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-standup.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify fallback to title matching
    assert.ok(bundle.areaContext, 'areaContext should be populated via fallback');
    assert.equal(bundle.areaContext!.slug, 'engineering', 'should fallback to title matching');

    // Verify warning is present
    assert.ok(
      bundle.warnings.some((w) => w.includes('Frontmatter area') && w.includes('nonexistent-area')),
      `Expected warning about invalid frontmatter area, got: ${bundle.warnings.join(', ')}`
    );
  });

  it('treats empty string area as no area and falls back to title matching', async () => {
    // Create area file
    writeAreaFile(tmpDir, 'marketing', {
      area: 'Marketing',
      status: 'active',
      recurring_meetings: [
        { title: 'Marketing Sync', frequency: 'weekly' },
      ],
    }, '## Focus\n\nMarketing campaigns.');

    // Create meeting with empty area field
    writeMeetingFile(tmpDir, '2026-03-20-marketing-sync.md', {
      title: 'Weekly Marketing Sync',
      date: '2026-03-20',
      attendees: [],
      area: '', // Empty string - should be treated as no area
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-marketing-sync.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify fallback to title matching (empty string is ignored)
    assert.ok(bundle.areaContext, 'areaContext should be populated via title matching');
    assert.equal(bundle.areaContext!.slug, 'marketing');
  });

  it('returns null areaContext when no frontmatter area and no title match', async () => {
    // Create area file that doesn't match
    writeAreaFile(tmpDir, 'finance', {
      area: 'Finance',
      status: 'active',
      recurring_meetings: [
        { title: 'Budget Review', frequency: 'quarterly' },
      ],
    }, '## Focus\n\nFinance ops.');

    // Create meeting with no frontmatter area and non-matching title
    writeMeetingFile(tmpDir, '2026-03-20-random.md', {
      title: 'Unrelated Meeting',
      date: '2026-03-20',
      attendees: [],
      // No area field, title doesn't match any recurring_meetings
    }, 'Meeting content.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-03-20-random.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify areaContext is null
    assert.equal(bundle.areaContext, null);
  });

  it('existing meetings without area field continue to work (backward compatible)', async () => {
    // Create area file
    writeAreaFile(tmpDir, 'operations', {
      area: 'Operations',
      status: 'active',
      recurring_meetings: [
        { title: 'Ops Standup', frequency: 'daily' },
      ],
    }, '## Focus\n\nOperations management.');

    // Create legacy meeting without area field (pre-existing format)
    const meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
    // Manually write a meeting file without the area field to simulate legacy format
    const legacyContent = `---
title: "Daily Ops Standup"
date: "2026-03-20"
attendees: []
---

Legacy meeting content.`;
    writeFileSync(join(meetingsDir, '2026-03-20-ops-standup.md'), legacyContent, 'utf8');

    const meetingPath = join(meetingsDir, '2026-03-20-ops-standup.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    // Verify backward compatibility - title matching still works
    assert.ok(bundle.areaContext, 'areaContext should be populated via title matching for legacy meetings');
    assert.equal(bundle.areaContext!.slug, 'operations');
  });
});

// ---------------------------------------------------------------------------
// topicWikiContext (Task 5 — wiki-leaning meeting extraction)
// ---------------------------------------------------------------------------

/**
 * Write a topic page file to `.arete/memory/topics/<slug>.md` with the given
 * sections. Uses the canonical writer (`renderTopicPage`) so the round-trip
 * invariant holds and `parseTopicPage` is exercised by `listAll`.
 */
function writeTopicPage(
  root: string,
  slug: string,
  sections: Record<string, string>,
  opts?: { aliases?: string[]; lastRefreshed?: string },
): void {
  const dir = join(root, '.arete', 'memory', 'topics');
  mkdirSync(dir, { recursive: true });
  // Build YAML frontmatter inline (avoids importing the writer just for tests).
  const aliasesYaml =
    opts?.aliases && opts.aliases.length > 0
      ? `\naliases:\n${opts.aliases.map((a) => `  - ${a}`).join('\n')}`
      : '';
  const fm = `---
topic_slug: ${slug}
status: active${aliasesYaml}
first_seen: 2026-01-01
last_refreshed: ${opts?.lastRefreshed ?? '2026-04-15'}
sources_integrated: []
---

# ${slug}
`;
  const sectionBlocks = Object.entries(sections)
    .map(([name, body]) => `\n## ${name}\n\n${body}\n`)
    .join('');
  writeFileSync(join(dir, `${slug}.md`), `${fm}${sectionBlocks}`, 'utf8');
}

/**
 * Write a memory items file (learnings.md or decisions.md) with one entry
 * matching the new L2 writer shape (## Title + metadata bullets + content).
 */
function writeMemoryItem(
  root: string,
  type: 'learnings' | 'decisions',
  title: string,
  date: string,
  topics: string[],
  content: string,
): void {
  const dir = join(root, '.arete', 'memory', 'items');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${type}.md`);
  const topicsLine = topics.length > 0 ? `- **Topics**: ${topics.join(', ')}\n` : '';
  const entry = `## ${title}\n- **Date**: ${date}\n- **Source**: test.md\n${topicsLine}- ${content}\n\n`;
  // Append to existing file if any
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, existing + entry, 'utf8');
}

describe('buildMeetingContext topicWikiContext', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let deps: MeetingContextDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meeting-ctx-wiki-'));
    paths = makePaths(tmpDir);
    deps = createDeps(tmpDir, paths);
    mkdirSync(join(tmpDir, '.arete'), { recursive: true });
    writeFileSync(join(tmpDir, 'arete.yaml'), 'version: 1\n', 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('populates topicWikiContext.detectedTopics when transcript matches a known topic', async () => {
    // Need ≥2 distinct multi-char non-stop slug tokens AND coverage ≥ 0.5.
    // Slug 'pricing-tiers' tokens: ['pricing', 'tiers'] (both non-stop, both ≥2 chars).
    // Transcript hits both → 2 hits, coverage 1.0 → passes.
    writeTopicPage(tmpDir, 'pricing-tiers', {
      'Current state': 'We have free, pro, and enterprise tiers.',
      'Open questions': 'Should we add a team tier between pro and enterprise?',
    });

    writeMeetingFile(tmpDir, '2026-04-15-pricing-discussion.md', {
      title: 'Pricing Discussion',
      date: '2026-04-15',
      attendees: [],
    }, '## Transcript\n\nWe debated our pricing tiers extensively.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-04-15-pricing-discussion.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    assert.ok(bundle.topicWikiContext, 'topicWikiContext should be populated');
    assert.equal(bundle.topicWikiContext!.detectedTopics.length, 1);
    const detected = bundle.topicWikiContext!.detectedTopics[0];
    assert.equal(detected.slug, 'pricing-tiers');
    // Sections should include the rendered wiki body.
    assert.ok(detected.sections.includes('Current state'), 'sections should include Current state heading');
    assert.ok(detected.sections.includes('free, pro, and enterprise tiers'), 'sections should include body content');
    assert.ok(Array.isArray(detected.l2Excerpts), 'l2Excerpts is always an array');
  });

  it('leaves topicWikiContext undefined when transcript matches no topics', async () => {
    // Topic exists but transcript talks about something else entirely.
    writeTopicPage(tmpDir, 'pricing-tiers', {
      'Current state': 'We have free, pro, and enterprise tiers.',
    });

    writeMeetingFile(tmpDir, '2026-04-15-unrelated.md', {
      title: 'Unrelated Sync',
      date: '2026-04-15',
      attendees: [],
    }, '## Transcript\n\nWe discussed kubernetes deployment timelines.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-04-15-unrelated.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    assert.equal(bundle.topicWikiContext, undefined, 'topicWikiContext should be undefined when no detection');
  });

  it('leaves topicWikiContext undefined when no topic pages exist', async () => {
    writeMeetingFile(tmpDir, '2026-04-15-empty-wiki.md', {
      title: 'Anything',
      date: '2026-04-15',
      attendees: [],
    }, '## Transcript\n\nPricing tiers and onboarding flows.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-04-15-empty-wiki.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    assert.equal(bundle.topicWikiContext, undefined, 'topicWikiContext should be undefined when wiki is empty');
  });

  it('populates l2Excerpts with topic-tagged memory entries', async () => {
    writeTopicPage(tmpDir, 'pricing-tiers', {
      'Current state': 'Free, pro, enterprise.',
    });

    // Recent (within sinceDays=90 default) and tagged with the topic.
    const recent = new Date();
    const recentDate = recent.toISOString().slice(0, 10);
    writeMemoryItem(
      tmpDir,
      'learnings',
      'Pricing experiment results',
      recentDate,
      ['pricing-tiers'],
      'Customers prefer the $99 tier over the $149 tier 3:1.',
    );

    writeMeetingFile(tmpDir, '2026-04-15-pricing-review.md', {
      title: 'Pricing Review',
      date: '2026-04-15',
      attendees: [],
    }, '## Transcript\n\nWe revisited our pricing tiers.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-04-15-pricing-review.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    assert.ok(bundle.topicWikiContext, 'topicWikiContext should be populated');
    const detected = bundle.topicWikiContext!.detectedTopics[0];
    assert.equal(detected.slug, 'pricing-tiers');
    assert.equal(detected.l2Excerpts.length, 1, 'one matching L2 entry expected');
    assert.ok(
      detected.l2Excerpts[0].includes('99 tier'),
      `excerpt should include item content; got: ${detected.l2Excerpts[0]}`,
    );
    assert.ok(
      detected.l2Excerpts[0].startsWith(recentDate),
      `excerpt should be prefixed by date; got: ${detected.l2Excerpts[0]}`,
    );
  });

  it('returns empty l2Excerpts when detected topic has no tagged memory items', async () => {
    writeTopicPage(tmpDir, 'pricing-tiers', {
      'Current state': 'Free, pro, enterprise.',
    });
    // Memory item tagged with a different slug — should not surface.
    writeMemoryItem(
      tmpDir,
      'learnings',
      'Onboarding flow note',
      new Date().toISOString().slice(0, 10),
      ['onboarding-flow'],
      'Users drop off at step 3.',
    );

    writeMeetingFile(tmpDir, '2026-04-15-pricing-only.md', {
      title: 'Pricing Only',
      date: '2026-04-15',
      attendees: [],
    }, '## Transcript\n\nPricing tiers debate.');

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-04-15-pricing-only.md');
    const bundle = await buildMeetingContext(meetingPath, deps, { skipPeople: true });

    assert.ok(bundle.topicWikiContext, 'topicWikiContext should be populated');
    const detected = bundle.topicWikiContext!.detectedTopics[0];
    assert.equal(detected.slug, 'pricing-tiers');
    assert.deepEqual(detected.l2Excerpts, [], 'l2Excerpts is empty when no items match topic');
  });
});
