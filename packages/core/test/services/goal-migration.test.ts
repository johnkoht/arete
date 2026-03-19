/**
 * Tests for GoalMigrationService.
 *
 * Tests both legacy formats:
 * - Format A: `## Goal N: Title`
 * - Format B: `### Qn-N Title`
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestWorkspace } from '../fixtures/index.js';
import { GoalMigrationService, slugifyTitle, extractQuarter } from '../../src/services/goal-migration.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('slugifyTitle', () => {
  it('converts spaces to hyphens', () => {
    assert.equal(slugifyTitle('Ship onboarding v2'), 'ship-onboarding-v2');
  });

  it('removes special characters', () => {
    assert.equal(slugifyTitle("Ship it! Now."), 'ship-it-now');
  });

  it('truncates to 50 characters', () => {
    const longTitle = 'This is a very long title that exceeds fifty characters easily';
    assert.ok(slugifyTitle(longTitle).length <= 50);
  });

  it('handles multiple spaces and hyphens', () => {
    assert.equal(slugifyTitle('Ship   onboarding--v2'), 'ship-onboarding-v2');
  });

  it('removes leading and trailing hyphens', () => {
    assert.equal(slugifyTitle('-Ship-'), 'ship');
  });
});

describe('extractQuarter', () => {
  it('extracts YYYY-Qn format', () => {
    const content = '**Quarter**: 2026-Q1\n\nSome content';
    assert.equal(extractQuarter(content), '2026-Q1');
  });

  it('extracts Qn YYYY format', () => {
    const content = '**Quarter**: Q2 2026\n\nSome content';
    assert.equal(extractQuarter(content), '2026-Q2');
  });

  it('falls back to current quarter when not found', () => {
    const content = 'No quarter here';
    const result = extractQuarter(content);
    // Should be current year-Qn
    assert.match(result, /^\d{4}-Q[1-4]$/);
  });
});

describe('GoalMigrationService - Format A', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let service: GoalMigrationService;

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
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-migration-a-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_A_CONTENT);
    storage = new FileStorageAdapter();
    service = new GoalMigrationService(storage);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('migrates Format A goals to individual files', async () => {
    const result = await service.migrate(tmpDir);

    assert.equal(result.migrated, true);
    assert.equal(result.goalsCount, 2);
    assert.equal(result.backupPath, '.quarter.md.backup');
  });

  it('creates correctly named files', async () => {
    await service.migrate(tmpDir);

    assert.ok(existsSync(join(tmpDir, 'goals', '2026-Q1-1-ship-onboarding-v2.md')));
    assert.ok(existsSync(join(tmpDir, 'goals', '2026-Q1-2-launch-api-v3.md')));
  });

  it('creates backup of original quarter.md', async () => {
    await service.migrate(tmpDir);

    assert.ok(existsSync(join(tmpDir, 'goals', '.quarter.md.backup')));
    assert.ok(!existsSync(join(tmpDir, 'goals', 'quarter.md')));
  });

  it('creates frontmatter with correct structure', async () => {
    await service.migrate(tmpDir);

    const goal1Content = readFileSync(
      join(tmpDir, 'goals', '2026-Q1-1-ship-onboarding-v2.md'),
      'utf8'
    );

    assert.ok(goal1Content.includes('---'));
    assert.ok(goal1Content.includes('id: "Q1-1"'));
    assert.ok(goal1Content.includes('title: "Ship onboarding v2"'));
    assert.ok(goal1Content.includes('status: active'));
    assert.ok(goal1Content.includes('quarter: "2026-Q1"'));
    assert.ok(goal1Content.includes('type: outcome'));
    assert.ok(goal1Content.includes('orgAlignment: "Pillar 1: User Growth"'));
    assert.ok(goal1Content.includes('successCriteria: "Drop-off reduced by 50%; NPS score above 8"'));
  });

  it('preserves goal body content', async () => {
    await service.migrate(tmpDir);

    const goal1Content = readFileSync(
      join(tmpDir, 'goals', '2026-Q1-1-ship-onboarding-v2.md'),
      'utf8'
    );

    assert.ok(goal1Content.includes('Some additional context about this goal.'));
  });
});

describe('GoalMigrationService - Format B', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let service: GoalMigrationService;

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
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-migration-b-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_B_CONTENT);
    storage = new FileStorageAdapter();
    service = new GoalMigrationService(storage);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('migrates Format B goals to individual files', async () => {
    const result = await service.migrate(tmpDir);

    assert.equal(result.migrated, true);
    assert.equal(result.goalsCount, 2);
  });

  it('creates correctly named files', async () => {
    await service.migrate(tmpDir);

    assert.ok(existsSync(join(tmpDir, 'goals', '2026-Q1-1-ship-onboarding-v2.md')));
    assert.ok(existsSync(join(tmpDir, 'goals', '2026-Q1-2-launch-api-v3.md')));
  });

  it('parses success criteria and org alignment', async () => {
    await service.migrate(tmpDir);

    const goal1Content = readFileSync(
      join(tmpDir, 'goals', '2026-Q1-1-ship-onboarding-v2.md'),
      'utf8'
    );

    assert.ok(goal1Content.includes('successCriteria: "Drop-off reduced by 50%"'));
    assert.ok(goal1Content.includes('orgAlignment: "Pillar 1: User Growth"'));
  });
});

describe('GoalMigrationService - Idempotency', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let service: GoalMigrationService;

  const FORMAT_B_CONTENT = `# Q1 2026 Goals

**Quarter**: 2026-Q1

### Q1-1 Ship onboarding v2

**Success criteria**: Drop-off reduced by 50%
`;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-migration-idem-'));
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_B_CONTENT);
    storage = new FileStorageAdapter();
    service = new GoalMigrationService(storage);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips migration if goal files already exist', async () => {
    // First migration
    const result1 = await service.migrate(tmpDir);
    assert.equal(result1.migrated, true);

    // Restore quarter.md for second attempt
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', FORMAT_B_CONTENT);

    // Second migration should be skipped
    const result2 = await service.migrate(tmpDir);
    assert.equal(result2.migrated, false);
    assert.equal(result2.skipped, true);
    assert.ok(result2.skipReason?.includes('Goal file already exists'));
  });

  it('does not skip for unrelated files', async () => {
    // Add unrelated file first
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/strategy.md', '# Strategy');

    const result = await service.migrate(tmpDir);
    assert.equal(result.migrated, true);
    assert.equal(result.goalsCount, 1);
  });
});

describe('GoalMigrationService - Edge Cases', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let service: GoalMigrationService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'goal-migration-edge-'));
    storage = new FileStorageAdapter();
    service = new GoalMigrationService(storage);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns skipped when quarter.md does not exist', async () => {
    const fixture = createTestWorkspace(tmpDir);
    // Don't create quarter.md

    const result = await service.migrate(tmpDir);
    assert.equal(result.migrated, false);
    assert.equal(result.skipped, true);
    assert.equal(result.skipReason, 'No goals/quarter.md found');
  });

  it('returns skipped when no goals found (unrecognized format)', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', '# Goals\n\nJust some text, no structured goals.');

    const result = await service.migrate(tmpDir);
    assert.equal(result.migrated, false);
    assert.equal(result.skipped, true);
    assert.ok(result.skipReason?.includes('unrecognized format'));
  });

  it('handles titles with special characters', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', `# Q1 2026 Goals

**Quarter**: 2026-Q1

### Q1-1 Ship "Feature A" & Feature B!

Some content.
`);

    const result = await service.migrate(tmpDir);
    assert.equal(result.migrated, true);

    // File should exist with sanitized name
    assert.ok(existsSync(join(tmpDir, 'goals', '2026-Q1-1-ship-feature-a-feature-b.md')));
  });

  it('extracts quarter from alternative format', async () => {
    const fixture = createTestWorkspace(tmpDir);
    fixture.writeFile('goals/quarter.md', `# Goals

**Quarter**: Q3 2025

### Q3-1 Test Goal

Content here.
`);

    const result = await service.migrate(tmpDir);
    assert.equal(result.migrated, true);

    // Should use Q3 2025 format
    assert.ok(existsSync(join(tmpDir, 'goals', '2025-Q3-1-test-goal.md')));
  });
});
