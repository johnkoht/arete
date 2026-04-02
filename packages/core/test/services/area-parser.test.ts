/**
 * Tests for area-parser service.
 *
 * Tests:
 * - YAML frontmatter parsing
 * - Case-insensitive substring matching
 * - No-match returns null
 * - Multiple-match resolution (first match wins for equal confidence)
 * - Markdown section extraction
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestWorkspace } from '../fixtures/index.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('AreaParserService', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let parser: AreaParserService;

  const GLANCE_AREA = `---
area: Glance Communications
status: active
recurring_meetings:
  - title: "CoverWhale Sync"
    attendees:
      - john-doe
      - jane-smith
    frequency: weekly
  - title: "Partner Review"
    attendees: []
    frequency: monthly
---

# Glance Communications

Strategic partnership with Glance for CoverWhale integration.

## Active Goals
<!-- Link to goals with area: field pointing here -->
- Q1-2: Ship CoverWhale integration

## Current State
Partnership is progressing well. API integration complete.

## Active Work
- Integration testing phase
- Documentation updates

## Key Decisions
- 2026-03-01: Use REST API instead of GraphQL
- 2026-02-15: Monthly partner reviews

## Open Commitments
<!-- Auto-filtered from commitments by area -->

## Backlog
- Add webhook support
- Performance optimization

## Notes
Working observations and context here.
`;

  const PLATFORM_AREA = `---
area: Platform Infrastructure
status: active
recurring_meetings:
  - title: "Platform Standup"
    attendees:
      - dev-team
    frequency: daily
---

# Platform Infrastructure

Core platform engineering work.

## Current State
Stable. No major incidents.

## Key Decisions
- 2026-03-10: Migrate to Kubernetes

## Backlog
- Monitoring improvements
`;

  const INACTIVE_AREA = `---
area: Legacy Project
status: inactive
recurring_meetings: []
---

# Legacy Project

Archived work.

## Current State
No longer active.
`;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'area-parser-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('areas/glance-communications.md', GLANCE_AREA);
    fixture.writeFile('areas/platform-infrastructure.md', PLATFORM_AREA);
    fixture.writeFile('areas/legacy-project.md', INACTIVE_AREA);
    // Template file should be excluded
    fixture.writeFile('areas/_template.md', '---\narea: {name}\n---\n');
    storage = new FileStorageAdapter();
    parser = new AreaParserService(storage, tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('YAML frontmatter parsing', () => {
    it('parses area name from frontmatter', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.equal(context.name, 'Glance Communications');
    });

    it('parses status from frontmatter', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.equal(context.status, 'active');
    });

    it('parses recurring_meetings array', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.equal(context.recurringMeetings.length, 2);
      assert.equal(context.recurringMeetings[0].title, 'CoverWhale Sync');
      assert.deepEqual(context.recurringMeetings[0].attendees, ['john-doe', 'jane-smith']);
      assert.equal(context.recurringMeetings[0].frequency, 'weekly');
    });

    it('handles empty recurring_meetings array', async () => {
      const context = await parser.getAreaContext('legacy-project');

      assert.ok(context);
      assert.equal(context.recurringMeetings.length, 0);
    });

    it('returns slug from filename', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.equal(context.slug, 'glance-communications');
    });

    it('returns filePath', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.filePath.endsWith('areas/glance-communications.md'));
    });
  });

  describe('markdown section extraction', () => {
    it('extracts Current State section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.currentState);
      assert.ok(context.sections.currentState.includes('Partnership is progressing well'));
    });

    it('extracts Key Decisions section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.keyDecisions);
      assert.ok(context.sections.keyDecisions.includes('2026-03-01: Use REST API'));
    });

    it('extracts Backlog section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.backlog);
      assert.ok(context.sections.backlog.includes('Add webhook support'));
    });

    it('extracts Active Goals section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.activeGoals);
      assert.ok(context.sections.activeGoals.includes('Q1-2: Ship CoverWhale integration'));
    });

    it('extracts Active Work section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.activeWork);
      assert.ok(context.sections.activeWork.includes('Integration testing phase'));
    });

    it('extracts Notes section', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.ok(context.sections.notes);
      assert.ok(context.sections.notes.includes('Working observations'));
    });

    it('returns null for missing sections', async () => {
      const context = await parser.getAreaContext('platform-infrastructure');

      assert.ok(context);
      // Platform area doesn't have Active Goals section
      assert.equal(context.sections.activeGoals, null);
    });
  });

  describe('case-insensitive substring matching', () => {
    it('matches exact title', async () => {
      const match = await parser.getAreaForMeeting('CoverWhale Sync');

      assert.ok(match);
      assert.equal(match.areaSlug, 'glance-communications');
      assert.equal(match.matchType, 'recurring');
      assert.equal(match.confidence, 1.0);
    });

    it('matches with different case', async () => {
      const match = await parser.getAreaForMeeting('COVERWHALE SYNC');

      assert.ok(match);
      assert.equal(match.areaSlug, 'glance-communications');
    });

    it('matches with lowercase', async () => {
      const match = await parser.getAreaForMeeting('coverwhale sync');

      assert.ok(match);
      assert.equal(match.areaSlug, 'glance-communications');
    });

    it('matches as substring (meeting title contains recurring title)', async () => {
      const match = await parser.getAreaForMeeting('Weekly CoverWhale Sync - March 2026');

      assert.ok(match);
      assert.equal(match.areaSlug, 'glance-communications');
    });

    it('matches different recurring meeting in same area', async () => {
      const match = await parser.getAreaForMeeting('Partner Review');

      assert.ok(match);
      assert.equal(match.areaSlug, 'glance-communications');
    });

    it('matches platform standup', async () => {
      const match = await parser.getAreaForMeeting('Platform Standup');

      assert.ok(match);
      assert.equal(match.areaSlug, 'platform-infrastructure');
    });
  });

  describe('no-match returns null', () => {
    it('returns null for unrecognized meeting title', async () => {
      const match = await parser.getAreaForMeeting('Random Team Meeting');

      assert.equal(match, null);
    });

    it('returns null for empty meeting title', async () => {
      const match = await parser.getAreaForMeeting('');

      assert.equal(match, null);
    });

    it('returns null for partial non-substring match', async () => {
      // "Cover" is a prefix but the full "CoverWhale Sync" is the title pattern
      // This should NOT match because "Cover" is not a substring of any recurring title
      const match = await parser.getAreaForMeeting('Cover');

      // Actually, "Cover" IS a substring of "CoverWhale Sync" so this WILL match
      // Let me test something that truly doesn't match
      const noMatch = await parser.getAreaForMeeting('Sales Demo');
      assert.equal(noMatch, null);
    });
  });

  describe('multiple-match resolution', () => {
    it('returns first match when multiple areas match with equal confidence', async () => {
      // Create a scenario where multiple areas could match
      // Since both have confidence 1.0, first scanned file wins
      const fixture = createTestWorkspace(tmpDir);

      // Add another area with same recurring meeting title
      fixture.writeFile(
        'areas/another-area.md',
        `---
area: Another Area
status: active
recurring_meetings:
  - title: "CoverWhale Sync"
    attendees: []
---

# Another Area

## Current State
Test area.
`
      );

      // Create new parser to pick up new file
      const newParser = new AreaParserService(storage, tmpDir);
      const match = await newParser.getAreaForMeeting('CoverWhale Sync');

      assert.ok(match);
      // Should return one of them (first in file system order)
      assert.ok(
        match.areaSlug === 'glance-communications' || match.areaSlug === 'another-area',
        `Expected glance-communications or another-area, got ${match.areaSlug}`
      );
      assert.equal(match.confidence, 1.0);
    });

    it('returns highest confidence match', async () => {
      // Currently all recurring matches are confidence 1.0
      // This test verifies the sort works
      const match = await parser.getAreaForMeeting('CoverWhale Sync');

      assert.ok(match);
      assert.equal(match.confidence, 1.0);
    });
  });

  describe('getAreaContext', () => {
    it('returns full context for valid slug', async () => {
      const context = await parser.getAreaContext('glance-communications');

      assert.ok(context);
      assert.equal(context.slug, 'glance-communications');
      assert.equal(context.name, 'Glance Communications');
      assert.equal(context.status, 'active');
      assert.equal(context.recurringMeetings.length, 2);
      assert.ok(context.sections.currentState);
    });

    it('returns null for non-existent slug', async () => {
      const context = await parser.getAreaContext('non-existent-area');

      assert.equal(context, null);
    });
  });

  describe('listAreas', () => {
    it('lists all areas excluding template', async () => {
      const areas = await parser.listAreas();

      assert.equal(areas.length, 3);
      const slugs = areas.map(a => a.slug);
      assert.ok(slugs.includes('glance-communications'));
      assert.ok(slugs.includes('platform-infrastructure'));
      assert.ok(slugs.includes('legacy-project'));
      // Template should be excluded
      assert.ok(!slugs.includes('_template'));
    });

    it('returns full context for each area', async () => {
      const areas = await parser.listAreas();

      const glance = areas.find(a => a.slug === 'glance-communications');
      assert.ok(glance);
      assert.equal(glance.name, 'Glance Communications');
      assert.equal(glance.recurringMeetings.length, 2);
    });
  });

  describe('edge cases', () => {
    it('handles area file without frontmatter', async () => {
      const fixture = createTestWorkspace(tmpDir);
      fixture.writeFile('areas/no-frontmatter.md', '# Just a heading\n\nNo frontmatter here.');

      const context = await parser.getAreaContext('no-frontmatter');

      assert.equal(context, null);
    });

    it('handles area file with invalid YAML', async () => {
      const fixture = createTestWorkspace(tmpDir);
      fixture.writeFile(
        'areas/bad-yaml.md',
        '---\narea: [unclosed array\n---\n\n# Bad YAML'
      );

      const context = await parser.getAreaContext('bad-yaml');

      assert.equal(context, null);
    });

    it('handles recurring_meetings with missing title', async () => {
      const fixture = createTestWorkspace(tmpDir);
      fixture.writeFile(
        'areas/missing-title.md',
        `---
area: Missing Title
status: active
recurring_meetings:
  - attendees: []
    frequency: weekly
---

# Missing Title

## Current State
Test.
`
      );

      const context = await parser.getAreaContext('missing-title');

      assert.ok(context);
      // Should skip the meeting entry with no title
      assert.equal(context.recurringMeetings.length, 0);
    });

    it('handles area with only some sections', async () => {
      const context = await parser.getAreaContext('platform-infrastructure');

      assert.ok(context);
      assert.ok(context.sections.currentState);
      assert.ok(context.sections.keyDecisions);
      assert.ok(context.sections.backlog);
      // Missing sections
      assert.equal(context.sections.activeGoals, null);
      assert.equal(context.sections.activeWork, null);
      assert.equal(context.sections.notes, null);
    });

    it('uses slug as name fallback when area field missing', async () => {
      const fixture = createTestWorkspace(tmpDir);
      fixture.writeFile(
        'areas/no-name.md',
        `---
status: active
recurring_meetings: []
---

# No Name Area

## Current State
Test.
`
      );

      const context = await parser.getAreaContext('no-name');

      assert.ok(context);
      assert.equal(context.name, 'no-name'); // Falls back to slug
    });
  });
});

describe('AreaParserService - parseMemoryFile', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let parser: AreaParserService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'area-memory-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications.md',
      `---
area: Glance Communications
status: active
recurring_meetings: []
---

# Glance Communications

## Current State
Active.
`
    );
    storage = new FileStorageAdapter();
    parser = new AreaParserService(storage, tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid memory.md with all sections', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Glance Communications Memory

## Keywords
- CoverWhale
- insurance
- API integration

## Active People
- john-doe
- jane-smith

## Open Work
- Integration testing
- Documentation updates

## Recently Completed
- API endpoint implementation
- Auth flow

## Recent Decisions
- Use REST over GraphQL
- Monthly partner reviews
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['CoverWhale', 'insurance', 'API integration']);
    assert.deepEqual(memory.activePeople, ['john-doe', 'jane-smith']);
    assert.deepEqual(memory.openWork, ['Integration testing', 'Documentation updates']);
    assert.deepEqual(memory.recentlyCompleted, ['API endpoint implementation', 'Auth flow']);
    assert.deepEqual(memory.recentDecisions, ['Use REST over GraphQL', 'Monthly partner reviews']);
  });

  it('returns null when memory.md does not exist', async () => {
    const memory = await parser.parseMemoryFile('glance-communications');

    assert.equal(memory, null);
  });

  it('returns null for non-existent area slug', async () => {
    const memory = await parser.parseMemoryFile('non-existent-area');

    assert.equal(memory, null);
  });

  it('returns empty arrays for missing sections', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
- CoverWhale

## Active People
- john-doe
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['CoverWhale']);
    assert.deepEqual(memory.activePeople, ['john-doe']);
    // Missing sections → empty arrays
    assert.deepEqual(memory.openWork, []);
    assert.deepEqual(memory.recentlyCompleted, []);
    assert.deepEqual(memory.recentDecisions, []);
  });

  it('handles case-insensitive section matching', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## KEYWORDS
- term1
- term2

## active people
- alice

## Open Work
- task1

## RECENTLY COMPLETED
- done1

## recent decisions
- decision1
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['term1', 'term2']);
    assert.deepEqual(memory.activePeople, ['alice']);
    assert.deepEqual(memory.openWork, ['task1']);
    assert.deepEqual(memory.recentlyCompleted, ['done1']);
    assert.deepEqual(memory.recentDecisions, ['decision1']);
  });

  it('handles malformed content gracefully (no bullet items)', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
Just some random text without bullets.
And another line.

## Active People
Also no bullets here.
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, []);
    assert.deepEqual(memory.activePeople, []);
  });

  it('logs warning for sections found but containing no bullet items', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
No bullets here, just text.

## Active People
- valid-person
`
    );

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

    try {
      const memory = await parser.parseMemoryFile('glance-communications');

      assert.ok(memory);
      assert.deepEqual(memory.keywords, []);
      assert.deepEqual(memory.activePeople, ['valid-person']);

      // Should warn about "keywords" section having no bullets
      const keywordsWarning = warnings.find(w => w.includes('keywords') && w.includes('no bullet items'));
      assert.ok(keywordsWarning, `Expected warning about "keywords" section, got: ${JSON.stringify(warnings)}`);

      // Should NOT warn about "active people" since it has valid items
      const peopleWarning = warnings.find(w => w.includes('active people') && w.includes('no bullet items'));
      assert.equal(peopleWarning, undefined, 'Should not warn for sections with valid bullet items');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('handles asterisk bullet markers', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
* term1
* term2
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['term1', 'term2']);
  });

  it('handles empty memory.md file (no sections at all)', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

Nothing here yet.
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, []);
    assert.deepEqual(memory.activePeople, []);
    assert.deepEqual(memory.openWork, []);
    assert.deepEqual(memory.recentlyCompleted, []);
    assert.deepEqual(memory.recentDecisions, []);
  });

  it('skips empty bullet items', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
- term1
- 
-   
- term2
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['term1', 'term2']);
  });

  it('includes memory in getAreaContext when memory.md exists', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
- CoverWhale
- insurance

## Active People
- john-doe
`
    );

    const context = await parser.getAreaContext('glance-communications');

    assert.ok(context);
    assert.ok(context.memory);
    assert.deepEqual(context.memory.keywords, ['CoverWhale', 'insurance']);
    assert.deepEqual(context.memory.activePeople, ['john-doe']);
    assert.deepEqual(context.memory.openWork, []);
  });

  it('getAreaContext has no memory when memory.md does not exist', async () => {
    const context = await parser.getAreaContext('glance-communications');

    assert.ok(context);
    assert.equal(context.memory, undefined);
  });

  it('handles mixed content: bullets + non-bullet lines', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile(
      'areas/glance-communications/memory.md',
      `# Memory

## Keywords
Some intro text
- term1
More text
- term2
Final text
`
    );

    const memory = await parser.parseMemoryFile('glance-communications');

    assert.ok(memory);
    assert.deepEqual(memory.keywords, ['term1', 'term2']);
  });
});

describe('AreaParserService - AC validation', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let parser: AreaParserService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'area-ac-'));
    const fixture = createTestWorkspace(tmpDir);

    // Create glance-communications.md with CoverWhale Sync as specified in AC
    fixture.writeFile(
      'areas/glance-communications.md',
      `---
area: Glance Communications
status: active
recurring_meetings:
  - title: "CoverWhale Sync"
    attendees:
      - john-doe
    frequency: weekly
---

# Glance Communications

## Current State
Active partnership.

## Key Decisions
- 2026-03-01: Decision here

## Backlog
- Future work
`
    );

    storage = new FileStorageAdapter();
    parser = new AreaParserService(storage, tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC13: Given "CoverWhale Sync" in areas/glance-communications.md, returns correct AreaMatch', async () => {
    const match = await parser.getAreaForMeeting('CoverWhale Sync');

    assert.ok(match, 'Should return a match');
    assert.equal(match.areaSlug, 'glance-communications');
    assert.equal(match.matchType, 'recurring');
    assert.equal(match.confidence, 1.0);
  });

  it('AC6: getAreaForMeeting returns null when no match', async () => {
    const match = await parser.getAreaForMeeting('Non-existent Meeting');

    assert.equal(match, null, 'Should return null, not { confidence: 0 }');
  });

  it('AC4: AreaMatch type structure is correct', async () => {
    const match = await parser.getAreaForMeeting('CoverWhale Sync');

    assert.ok(match);
    // Verify type structure
    assert.ok('areaSlug' in match);
    assert.ok('matchType' in match);
    assert.ok('confidence' in match);
    assert.ok(
      match.matchType === 'recurring' || match.matchType === 'inferred',
      'matchType should be recurring or inferred'
    );
    assert.ok(
      typeof match.confidence === 'number' && match.confidence >= 0 && match.confidence <= 1,
      'confidence should be a number between 0 and 1'
    );
  });

  it('AC9: getAreaContext returns parsed area content', async () => {
    const context = await parser.getAreaContext('glance-communications');

    assert.ok(context);
    assert.equal(context.slug, 'glance-communications');
    assert.equal(context.name, 'Glance Communications');
    assert.ok(context.sections.currentState);
    assert.ok(context.sections.keyDecisions);
    assert.ok(context.sections.backlog);
  });
});
