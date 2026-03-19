/**
 * Tests for goal-parser service.
 *
 * Tests:
 * - New format: individual .md files with frontmatter
 * - Legacy format: quarter.md with Format A or Format B
 * - Empty directory
 * - Malformed files
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestWorkspace } from '../fixtures/index.js';
import {
  parseGoals,
  parseIndividualGoals,
  parseLegacyQuarterFile,
} from '../../src/services/goal-parser.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('parseGoals - New Format', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  const GOAL_1 = `---
id: "Q1-1"
title: "Ship onboarding v2"
status: active
quarter: "2026-Q1"
type: outcome
orgAlignment: "Pillar 2: Retention"
successCriteria: "90% completion rate"
---

This is the goal body content.
`;

  const GOAL_2 = `---
id: "Q1-2"
title: "Launch API v3"
status: complete
quarter: "2026-Q1"
type: milestone
orgAlignment: "Pillar 1: Platform"
successCriteria: "200 API customers"
---

API launch details.
`;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-new-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/2026-Q1-1-ship-onboarding-v2.md', GOAL_1);
    fixture.writeFile('goals/2026-Q1-2-launch-api-v3.md', GOAL_2);
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses individual goal files with frontmatter', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals.length, 2);
  });

  it('extracts all frontmatter fields correctly', async () => {
    const goals = await parseGoals(goalsDir, storage);

    const goal1 = goals.find(g => g.id === 'Q1-1');
    assert.ok(goal1, 'Goal Q1-1 should be found');
    assert.equal(goal1.title, 'Ship onboarding v2');
    assert.equal(goal1.status, 'active');
    assert.equal(goal1.quarter, '2026-Q1');
    assert.equal(goal1.type, 'outcome');
    assert.equal(goal1.orgAlignment, 'Pillar 2: Retention');
    assert.equal(goal1.successCriteria, '90% completion rate');
    assert.ok(goal1.body?.includes('goal body content'));
  });

  it('handles different status and type values', async () => {
    const goals = await parseGoals(goalsDir, storage);

    const goal2 = goals.find(g => g.id === 'Q1-2');
    assert.ok(goal2, 'Goal Q1-2 should be found');
    assert.equal(goal2.status, 'complete');
    assert.equal(goal2.type, 'milestone');
  });

  it('generates slug from filename', async () => {
    const goals = await parseGoals(goalsDir, storage);

    const goal1 = goals.find(g => g.id === 'Q1-1');
    assert.ok(goal1, 'Goal Q1-1 should be found');
    assert.equal(goal1.slug, '2026-q1-1-ship-onboarding-v2');
  });

  it('includes file path in goal', async () => {
    const goals = await parseGoals(goalsDir, storage);

    const goal1 = goals.find(g => g.id === 'Q1-1');
    assert.ok(goal1, 'Goal Q1-1 should be found');
    assert.ok(goal1.filePath.includes('2026-Q1-1-ship-onboarding-v2.md'));
  });

  it('excludes strategy.md from parsing', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/strategy.md', `---
id: "strategy"
title: "Strategy"
quarter: "2026-Q1"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    const strategyGoal = goals.find(g => g.id === 'strategy');
    assert.equal(strategyGoal, undefined, 'strategy.md should be excluded');
  });

  it('excludes backup files from parsing', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/backup.md.backup', `---
id: "backup"
title: "Backup"
quarter: "2026-Q1"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    const backupGoal = goals.find(g => g.id === 'backup');
    assert.equal(backupGoal, undefined, 'backup files should be excluded');
  });
});

describe('parseGoals - Legacy Format A', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  const FORMAT_A_CONTENT = `# Q1 2026 Goals

**Quarter**: 2026-Q1

## Goal 1: Ship onboarding v2

**Strategic Pillar**: Pillar 1: User Growth

### Key Outcomes
- [ ] Drop-off reduced by 50%
- [ ] NPS score above 8

Some additional context about this goal.

## Goal 2: Launch API v3

**Strategic Pillar**: Pillar 2: Platform

### Key Outcomes
- [ ] 200 API customers activated
- [ ] 99.9% uptime

API launch details here.
`;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-a-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_A_CONTENT);
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses Format A goals from quarter.md', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals.length, 2);
  });

  it('extracts goal ID correctly', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].id, 'Q1-1');
    assert.equal(goals[1].id, 'Q1-2');
  });

  it('extracts title from Format A', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].title, 'Ship onboarding v2');
    assert.equal(goals[1].title, 'Launch API v3');
  });

  it('extracts orgAlignment from Strategic Pillar', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].orgAlignment, 'Pillar 1: User Growth');
    assert.equal(goals[1].orgAlignment, 'Pillar 2: Platform');
  });

  it('extracts successCriteria from Key Outcomes', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].successCriteria, 'Drop-off reduced by 50%; NPS score above 8');
    assert.equal(goals[1].successCriteria, '200 API customers activated; 99.9% uptime');
  });

  it('sets default status and type for legacy goals', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].status, 'active');
    assert.equal(goals[0].type, 'outcome');
  });

  it('generates slug from title', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].slug, 'ship-onboarding-v2');
  });
});

describe('parseGoals - Legacy Format B', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  const FORMAT_B_CONTENT = `# Q1 2026 Goals

**Quarter**: 2026-Q1

## Outcomes

### Q1-1 Ship onboarding v2

**Success criteria**: Drop-off reduced by 50%
**Org alignment**: Pillar 1: User Growth

### Q1-2 Launch API v3

**Success criteria**: 200 API customers activated
**Org alignment**: Pillar 2: Platform
`;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-b-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_B_CONTENT);
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses Format B goals from quarter.md', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals.length, 2);
  });

  it('extracts goal ID from Format B header', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].id, 'Q1-1');
    assert.equal(goals[1].id, 'Q1-2');
  });

  it('extracts title from Format B header', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].title, 'Ship onboarding v2');
    assert.equal(goals[1].title, 'Launch API v3');
  });

  it('extracts successCriteria from Success criteria field', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].successCriteria, 'Drop-off reduced by 50%');
  });

  it('extracts orgAlignment from Org alignment field', async () => {
    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals[0].orgAlignment, 'Pillar 1: User Growth');
  });
});

describe('parseGoals - Fallback behavior', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-fallback-'));
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to legacy when no individual files exist', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', `# Q1 2026 Goals

**Quarter**: 2026-Q1

### Q1-1 Test Goal

**Success criteria**: Test
`);

    const goals = await parseGoals(goalsDir, storage);

    assert.equal(goals.length, 1);
    assert.equal(goals[0].id, 'Q1-1');
  });

  it('prefers individual files over legacy when both exist', async () => {
    const fixture = createTestWorkspace(tmpDir);
    
    // Add individual goal file
    fixture.writeFile('goals/2026-Q1-1-individual.md', `---
id: "individual-1"
title: "Individual Goal"
quarter: "2026-Q1"
---
`);

    // Add legacy quarter.md
    fixture.writeFile('goals/quarter.md', `# Q1 2026 Goals

**Quarter**: 2026-Q1

### Q1-1 Legacy Goal

**Success criteria**: Test
`);

    const goals = await parseGoals(goalsDir, storage);

    // Should only have the individual goal, not the legacy one
    assert.equal(goals.length, 1);
    assert.equal(goals[0].id, 'individual-1');
  });
});

describe('parseGoals - Empty directory', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-empty-'));
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when goals directory does not exist', async () => {
    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('returns empty array when goals directory is empty', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/.gitkeep', ''); // Creates directory

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('returns empty array when only non-goal files exist', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/strategy.md', '# Strategy');
    fixture.writeFile('goals/index.md', '# Index');

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });
});

describe('parseGoals - Malformed files', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-malformed-'));
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips files without frontmatter', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/no-frontmatter.md', '# Just a heading\n\nNo frontmatter here.');

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('skips files with invalid YAML frontmatter', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/bad-yaml.md', `---
id: "test
title: unclosed quote
---

Content
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('skips files missing required id field', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/missing-id.md', `---
title: "Test Goal"
quarter: "2026-Q1"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('skips files missing required title field', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/missing-title.md', `---
id: "Q1-1"
quarter: "2026-Q1"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('skips files missing required quarter field', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/missing-quarter.md', `---
id: "Q1-1"
title: "Test Goal"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('handles mix of valid and invalid files', async () => {
    const fixture = createTestWorkspace(tmpDir);
    
    // Valid file
    fixture.writeFile('goals/valid.md', `---
id: "Q1-1"
title: "Valid Goal"
quarter: "2026-Q1"
---
`);

    // Invalid file (missing id)
    fixture.writeFile('goals/invalid.md', `---
title: "Invalid Goal"
quarter: "2026-Q1"
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].id, 'Q1-1');
  });

  it('defaults invalid status to active', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/bad-status.md', `---
id: "Q1-1"
title: "Test Goal"
quarter: "2026-Q1"
status: invalid_status
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].status, 'active');
  });

  it('defaults invalid type to outcome', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/bad-type.md', `---
id: "Q1-1"
title: "Test Goal"
quarter: "2026-Q1"
type: invalid_type
---
`);

    const goals = await parseGoals(goalsDir, storage);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].type, 'outcome');
  });
});

describe('parseIndividualGoals - Direct tests', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-individual-'));
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when directory does not exist', async () => {
    const goals = await parseIndividualGoals(goalsDir, storage);
    assert.equal(goals.length, 0);
  });
});

describe('parseLegacyQuarterFile - Direct tests', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let goalsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-parser-legacy-'));
    storage = new FileStorageAdapter();
    goalsDir = join(tmpDir, 'goals');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when quarter.md does not exist', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/.gitkeep', '');

    const goals = await parseLegacyQuarterFile(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('returns empty array when quarter.md has unrecognized format', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', '# Goals\n\nJust some random text.');

    const goals = await parseLegacyQuarterFile(goalsDir, storage);
    assert.equal(goals.length, 0);
  });

  it('extracts quarter from Q# YYYY format', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', `# Goals

**Quarter**: Q3 2025

### Q3-1 Test Goal

Content here.
`);

    const goals = await parseLegacyQuarterFile(goalsDir, storage);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].quarter, '2025-Q3');
  });
});
