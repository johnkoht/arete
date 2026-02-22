import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { SearchProvider, SearchResult } from '../../src/search/types.js';

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

function writePerson(root: string, category: string, slug: string, name: string): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\nname: "${name}"\ncategory: "${category}"\n---\n\n# ${name}\n\n## Notes\n\n- Existing note.\n`,
    'utf8',
  );
}

function writeMeeting(root: string, filename: string, content: string): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content, 'utf8');
}

describe('EntityService.refreshPersonMemory', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'person-memory-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes repeated asks and concerns into the auto memory section', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');

    writeMeeting(
      tmpDir,
      '2026-02-10-sync.md',
      `---
title: "Status Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about timeline risk for launch.
Jane Doe is concerned about budget runway.
`,
    );

    writeMeeting(
      tmpDir,
      '2026-02-12-review.md',
      `---
title: "Review"
date: "2026-02-12"
attendee_ids:
  - jane-doe
---

Jane Doe asked about timeline risk for launch.
Jane Doe is concerned about budget runway.
`,
    );

    const result = await service.refreshPersonMemory(paths);
    assert.equal(result.updated, 1);
    assert.equal(result.skippedFresh, 0);

    const personContent = readFileSync(
      join(tmpDir, 'people', 'internal', 'jane-doe.md'),
      'utf8',
    );

    assert.ok(personContent.includes('## Memory Highlights (Auto)'));
    assert.ok(personContent.includes('timeline risk for launch'));
    assert.ok(personContent.includes('budget runway'));
    assert.ok(personContent.includes('mentioned 2 times'));
  });

  it('skips refresh when memory is fresh and ifStaleDays is set', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const dir = join(tmpDir, 'people', 'internal');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'jane-doe.md'),
      `---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n\n<!-- AUTO_PERSON_MEMORY:START -->\n## Memory Highlights (Auto)\n\nLast refreshed: ${today}\n\n### Repeated asks\n- **timeline** — mentioned 2 times\n\n### Repeated concerns\n- None detected yet.\n<!-- AUTO_PERSON_MEMORY:END -->\n`,
      'utf8',
    );

    const result = await service.refreshPersonMemory(paths, { ifStaleDays: 7 });
    assert.equal(result.updated, 0);
    assert.equal(result.skippedFresh, 1);
  });

  it('is idempotent and does not duplicate auto section', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');

    writeMeeting(
      tmpDir,
      '2026-02-10-sync.md',
      `---
title: "Status Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about budget timeline.
Jane Doe asked about budget timeline.
`,
    );

    await service.refreshPersonMemory(paths);
    await service.refreshPersonMemory(paths);

    const personContent = readFileSync(
      join(tmpDir, 'people', 'internal', 'jane-doe.md'),
      'utf8',
    );

    const markerMatches = personContent.match(/AUTO_PERSON_MEMORY:START/g) ?? [];
    assert.equal(markerMatches.length, 1);
  });
});

// ---------------------------------------------------------------------------
// refreshPersonMemory — conversation scanning
// ---------------------------------------------------------------------------

describe('EntityService.refreshPersonMemory — conversation scanning', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'person-memory-conv-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConversation(root: string, filename: string, content: string): void {
    const dir = join(root, 'resources', 'conversations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, 'utf8');
  }

  it('scannedConversations is present in result', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');
    writeConversation(
      tmpDir,
      '2026-02-20-discussion.md',
      '---\ntitle: "Discussion"\ndate: "2026-02-20"\n---\n\nJane Doe mentioned the API.\n',
    );
    const result = await service.refreshPersonMemory(paths);
    assert.notEqual(result.scannedConversations, undefined);
    assert.equal(result.scannedConversations, 1);
  });

  it('scannedConversations is 0 when no conversations directory exists', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');
    const result = await service.refreshPersonMemory(paths);
    assert.equal(result.scannedConversations, 0);
  });

  it('scans conversation body for person mentions', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');

    writeConversation(
      tmpDir,
      '2026-02-20-api.md',
      `---
title: "API Discussion"
date: "2026-02-20"
---

Jane Doe asked about the API authentication approach.
Jane Doe asked about the API authentication approach.
`,
    );

    const result = await service.refreshPersonMemory(paths);
    assert.equal(result.scannedConversations, 1);
    // Verify signals were actually collected and the person file was written —
    // not just that the section header exists (it's written even on zero signals)
    assert.equal(result.updated, 1, 'Person file should be updated when conversation signals meet threshold');

    const personContent = readFileSync(
      join(tmpDir, 'people', 'internal', 'jane-doe.md'),
      'utf8',
    );
    assert.ok(personContent.includes('## Memory Highlights (Auto)'));
    assert.ok(personContent.includes('api authentication'), 'Signal keyword from conversation should appear in memory highlights');
  });

  it('meeting scan still works when conversations also exist (no regression)', async () => {
    writePerson(tmpDir, 'internal', 'jane-doe', 'Jane Doe');

    writeMeeting(
      tmpDir,
      '2026-02-18-sync.md',
      `---
title: "Sync"
date: "2026-02-18"
attendee_ids:
  - jane-doe
---

Jane Doe asked about budget concerns.
Jane Doe asked about budget concerns.
`,
    );

    writeConversation(
      tmpDir,
      '2026-02-20-chat.md',
      '---\ntitle: "Chat"\ndate: "2026-02-20"\n---\n\nJane Doe mentioned the timeline.\n',
    );

    const result = await service.refreshPersonMemory(paths);
    assert.equal(result.scannedMeetings, 1);
    assert.equal(result.scannedConversations, 1);
    assert.equal(result.updated, 1);
  });
});

// ---------------------------------------------------------------------------
// refreshPersonMemory — SearchProvider pre-filter
// ---------------------------------------------------------------------------

function makeMockSearchProvider(resultsByPersonName: Map<string, string[]>): SearchProvider {
  return {
    name: 'mock',
    isAvailable: async () => true,
    search: async (): Promise<SearchResult[]> => [],
    semanticSearch: async (query: string): Promise<SearchResult[]> => {
      const paths = resultsByPersonName.get(query) ?? [];
      return paths.map((p) => ({ path: p, content: '', score: 1.0, matchType: 'semantic' as const }));
    },
  };
}

describe('EntityService.refreshPersonMemory — SearchProvider pre-filter', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'person-memory-search-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CRITICAL: empty SearchProvider results → falls back to full scan and finds signals', async () => {
    // Write a person file
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );

    // Write meeting with repeated signals
    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    writeFileSync(
      join(meetingDir, '2026-02-10-sync.md'),
      `---
title: "Status Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about deployment timeline.
Jane Doe asked about deployment timeline.
`,
      'utf8',
    );

    // SearchProvider returns [] for "Jane Doe" → must fall back to full scan
    const emptyProvider = makeMockSearchProvider(new Map([['Jane Doe', []]]));
    const service = new EntityService(new FileStorageAdapter(), emptyProvider);

    const result = await service.refreshPersonMemory(paths);

    // Should have found and written signals — full scan executed
    assert.equal(result.updated, 1, 'Must update person even when SearchProvider returns empty results');
    assert.equal(result.scannedMeetings, 1, 'scannedMeetings reflects total available meetings');

    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(
      personContent.includes('deployment timeline'),
      'Full-scan fallback must find signals from all meeting files',
    );
  });

  it('SearchProvider with results → only candidate files are scanned per person', async () => {
    // Write two people
    const internalDir = join(tmpDir, 'people', 'internal');
    mkdirSync(internalDir, { recursive: true });
    writeFileSync(
      join(internalDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );
    writeFileSync(
      join(internalDir, 'bob-smith.md'),
      '---\nname: "Bob Smith"\ncategory: "internal"\n---\n\n# Bob Smith\n',
      'utf8',
    );

    // Write two meeting files
    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    const janesFile = join(meetingDir, '2026-02-10-jane.md');
    const bobsFile = join(meetingDir, '2026-02-11-bob.md');

    writeFileSync(
      janesFile,
      `---
title: "Jane Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about release schedule.
Jane Doe asked about release schedule.
`,
      'utf8',
    );

    writeFileSync(
      bobsFile,
      `---
title: "Bob Sync"
date: "2026-02-11"
attendee_ids:
  - bob-smith
---

Bob Smith asked about release schedule.
Bob Smith asked about release schedule.
`,
      'utf8',
    );

    // Provider returns only Jane's file for "Jane Doe" and only Bob's file for "Bob Smith"
    const filteredProvider = makeMockSearchProvider(
      new Map([
        ['Jane Doe', [janesFile]],
        ['Bob Smith', [bobsFile]],
      ]),
    );
    const service = new EntityService(new FileStorageAdapter(), filteredProvider);

    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.updated, 2, 'Both people should be updated from their respective candidate files');
    // scannedMeetings = total available meetings, not candidate count
    assert.equal(result.scannedMeetings, 2);

    const janeContent = readFileSync(join(internalDir, 'jane-doe.md'), 'utf8');
    const bobContent = readFileSync(join(internalDir, 'bob-smith.md'), 'utf8');
    assert.ok(janeContent.includes('release schedule'), "Jane's memory should have signals from her candidate file");
    assert.ok(bobContent.includes('release schedule'), "Bob's memory should have signals from his candidate file");
  });

  it('no SearchProvider → behavior identical to existing implementation', async () => {
    // Write person and meeting
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );

    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    writeFileSync(
      join(meetingDir, '2026-02-10-sync.md'),
      `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about pricing strategy.
Jane Doe asked about pricing strategy.
`,
      'utf8',
    );

    // No search provider passed — second arg omitted
    const service = new EntityService(new FileStorageAdapter());

    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.updated, 1);
    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(personContent.includes('pricing strategy'), 'Signals should be found without a SearchProvider');
  });

  it('limit-overflow fallback: SearchProvider returning exactly LIMIT results triggers full scan', async () => {
    // Write a person
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );

    // Write a meeting file that is NOT in the 100 provider results
    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    const hiddenMeeting = join(meetingDir, '2026-02-15-hidden.md');
    writeFileSync(
      hiddenMeeting,
      `---
title: "Hidden Meeting"
date: "2026-02-15"
attendee_ids:
  - jane-doe
---

Jane Doe asked about infrastructure costs.
Jane Doe asked about infrastructure costs.
`,
      'utf8',
    );

    // Create a SearchProvider that returns exactly 100 results (all fake paths
    // except none point to `hiddenMeeting`). This triggers the limit-overflow
    // fallback, which should cause a full scan that finds hiddenMeeting.
    const hundredFakePaths = Array.from({ length: 100 }, (_, i) =>
      join(meetingDir, `fake-meeting-${i}.md`),
    );
    const overflowProvider = makeMockSearchProvider(
      new Map([['Jane Doe', hundredFakePaths]]),
    );
    const service = new EntityService(new FileStorageAdapter(), overflowProvider);

    const result = await service.refreshPersonMemory(paths);

    // Full scan should have found the hidden meeting
    assert.equal(result.updated, 1, 'Limit-overflow fallback must trigger full scan');
    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(
      personContent.includes('infrastructure costs'),
      'Full scan after limit overflow must find signals from meeting NOT in the 100 results',
    );
  });

  it('path normalization: SearchProvider returning relative path → person file updated', async () => {
    // Write a person
    const personDir = join(tmpDir, 'people', 'internal');
    mkdirSync(personDir, { recursive: true });
    writeFileSync(
      join(personDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );

    // Write meeting file
    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    writeFileSync(
      join(meetingDir, '2026-02-10-sync.md'),
      `---
title: "Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
---

Jane Doe asked about migration plan.
Jane Doe asked about migration plan.
`,
      'utf8',
    );

    // SearchProvider returns a RELATIVE path (as qmd might when running with cwd: workspaceRoot)
    const relativeProvider = makeMockSearchProvider(
      new Map([['Jane Doe', ['resources/meetings/2026-02-10-sync.md']]]),
    );
    const service = new EntityService(new FileStorageAdapter(), relativeProvider);

    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.updated, 1, 'Relative path from SearchProvider must be resolved and read successfully');
    const personContent = readFileSync(join(personDir, 'jane-doe.md'), 'utf8');
    assert.ok(
      personContent.includes('migration plan'),
      'Signals should be found when SearchProvider returns a relative path',
    );
  });

  it('meeting content cache: two people in the same meeting → storage.read called once for that file', async () => {
    // Write two people
    const internalDir = join(tmpDir, 'people', 'internal');
    mkdirSync(internalDir, { recursive: true });
    writeFileSync(
      join(internalDir, 'jane-doe.md'),
      '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\n# Jane Doe\n',
      'utf8',
    );
    writeFileSync(
      join(internalDir, 'bob-smith.md'),
      '---\nname: "Bob Smith"\ncategory: "internal"\n---\n\n# Bob Smith\n',
      'utf8',
    );

    // Write one meeting that mentions both people
    const meetingDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingDir, { recursive: true });
    const sharedMeeting = join(meetingDir, '2026-02-10-team.md');
    writeFileSync(
      sharedMeeting,
      `---
title: "Team Sync"
date: "2026-02-10"
attendee_ids:
  - jane-doe
  - bob-smith
---

Jane Doe asked about deployment timing.
Jane Doe asked about deployment timing.
Bob Smith asked about deployment timing.
Bob Smith asked about deployment timing.
`,
      'utf8',
    );

    // Track read calls with a wrapping storage adapter
    const realStorage = new FileStorageAdapter();
    const readCalls: string[] = [];
    const trackingStorage: typeof realStorage = Object.create(realStorage);
    trackingStorage.read = async (path: string) => {
      readCalls.push(path);
      return realStorage.read(path);
    };

    // No search provider — both people get the full meetingFiles list
    const service = new EntityService(trackingStorage);
    const result = await service.refreshPersonMemory(paths);

    assert.equal(result.updated, 2, 'Both people should be updated');

    // Count how many times the shared meeting file was read in the meeting scan.
    // The normalized path is used as cache key; the file should be read at most once
    // during the meeting scan (plus reads for person files, which we exclude).
    const normalizedShared = resolve(sharedMeeting);
    const meetingReadCount = readCalls.filter((p) => resolve(p) === normalizedShared).length;
    assert.equal(
      meetingReadCount,
      1,
      `Meeting file should be read exactly once (cache hit for second person), but was read ${meetingReadCount} times`,
    );
  });
});
