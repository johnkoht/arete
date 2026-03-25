/**
 * Tests for ContextService via compat getRelevantContext.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRelevantContext } from '../../src/compat/context.js';
import type { WorkspacePaths, ProductPrimitive } from '../../src/models/index.js';
import { createTestWorkspace } from '../fixtures/index.js';

describe('ContextService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let writeFixtureFile: (relativePath: string, content: string) => void;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctx-svc-'));
    const fixture = createTestWorkspace(tmpDir);
    paths = fixture.paths;
    writeFixtureFile = fixture.writeFile;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty files and Low confidence for empty workspace', async () => {
    const result = await getRelevantContext('create a PRD for search', paths);
    assert.equal(result.query, 'create a PRD for search');
    assert.equal(result.files.length, 0);
    assert.equal(result.confidence, 'Low');
    assert.ok(result.gaps.length > 0);
  });

  it('includes goals/strategy.md when present and relevant to query', async () => {
    // Strategy file must contain query-relevant tokens to be included
    writeFixtureFile('goals/strategy.md', '# Strategy\n\nOur strategic pillars for the quarter.');
    const result = await getRelevantContext('plan the quarter', paths);
    const fileResult = result.files.find((file) => file.relativePath === 'goals/strategy.md');
    assert.ok(fileResult, 'strategy.md should be included when content matches query');
    assert.equal(fileResult?.category, 'goals');
    // Score may be static (0.35) or upgraded by semantic search
    assert.ok((fileResult?.relevanceScore ?? 0) > 0, 'should have a relevance score');
  });

  it('maps Problem primitive to business-overview.md', async () => {
    writeFixtureFile('context/business-overview.md', '# Business\n\nWe solve onboarding friction.');
    const result = await getRelevantContext('discovery on onboarding', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    const fileResult = result.files.find(
      (file) => file.relativePath === 'context/business-overview.md',
    );
    assert.ok(fileResult);
    assert.equal(fileResult?.primitive, 'Problem');
  });

  it('identifies placeholder files as gaps', async () => {
    writeFixtureFile('context/business-overview.md', '[Add your business overview here]');
    const result = await getRelevantContext('discovery', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    assert.ok(result.gaps.some((gap) => gap.primitive === 'Problem'));
  });

  it('includes active projects matching the query', async () => {
    writeFixtureFile(
      'projects/active/search-discovery/README.md',
      '# Search Discovery\n\nDiscover user needs.',
    );
    const result = await getRelevantContext('search feature', paths);
    const fileResult = result.files.find((file) => file.relativePath?.includes('search-discovery'));
    assert.ok(fileResult);
    assert.equal(fileResult?.category, 'projects');
  });

  it('includes conversations matching the query', async () => {
    writeFixtureFile(
      'resources/conversations/2026-02-20-api-approach.md',
      '---\ntitle: "API Approach Discussion"\ndate: "2026-02-20"\nsource: "manual"\n---\n\n# API Approach Discussion\n\n## Summary\nTeam decided on REST API approach for the new integration.\n',
    );
    const result = await getRelevantContext('API approach', paths);
    const fileResult = result.files.find((file) =>
      file.relativePath?.includes('resources/conversations/'),
    );
    assert.ok(fileResult, 'conversation file should be found by context query');
  });

  describe('goal files globbing', () => {
    it('falls back to quarter.md when only quarter.md exists and is relevant', async () => {
      // Content must match query tokens to be included
      writeFixtureFile('goals/quarter.md', '# Q1 2026 Goals\n\nFocus on growth and retention for the quarter.');
      const result = await getRelevantContext('plan the quarter', paths);
      const quarterFile = result.files.find((f) => f.relativePath === 'goals/quarter.md');
      assert.ok(quarterFile, 'quarter.md should be included when content matches query');
      assert.equal(quarterFile?.category, 'goals');
    });

    it('includes individual goal files when relevant and excludes quarter.md', async () => {
      // Files must contain query-relevant tokens
      writeFixtureFile('goals/growth.md', '# Growth Goal\n\nIncrease user acquisition for the quarter.');
      writeFixtureFile('goals/retention.md', '# Retention Goal\n\nImprove user engagement quarterly.');
      writeFixtureFile('goals/quarter.md', '# Q1 2026 Goals\n\nFocus on growth and retention.');
      const result = await getRelevantContext('plan the quarter', paths);
      const goalFiles = result.files.filter((f) => f.relativePath?.startsWith('goals/'));
      const growthFile = goalFiles.find((f) => f.relativePath === 'goals/growth.md');
      const retentionFile = goalFiles.find((f) => f.relativePath === 'goals/retention.md');
      const quarterFile = goalFiles.find((f) => f.relativePath === 'goals/quarter.md');
      assert.ok(growthFile, 'growth.md should be included when content matches query');
      assert.ok(retentionFile, 'retention.md should be included when content matches query');
      assert.ok(!quarterFile, 'quarter.md should NOT be included when individual files exist');
    });

    it('mixed format: includes relevant strategy.md plus individual goal files', async () => {
      // Files must contain query-relevant tokens
      writeFixtureFile('goals/strategy.md', '# Strategy\n\nOur strategic pillars for the quarter.');
      writeFixtureFile('goals/growth.md', '# Growth Goal\n\nIncrease user acquisition quarterly.');
      writeFixtureFile('goals/quarter.md', '# Q1 2026 Goals\n\nFocus on growth and retention.');
      const result = await getRelevantContext('plan the quarter', paths);
      const goalFiles = result.files.filter((f) => f.relativePath?.startsWith('goals/'));
      const strategyFile = goalFiles.find((f) => f.relativePath === 'goals/strategy.md');
      const growthFile = goalFiles.find((f) => f.relativePath === 'goals/growth.md');
      const quarterFile = goalFiles.find((f) => f.relativePath === 'goals/quarter.md');
      assert.ok(strategyFile, 'strategy.md should be included when content matches query');
      assert.ok(growthFile, 'individual goal file should be included when content matches query');
      assert.ok(!quarterFile, 'quarter.md should NOT be included when individual files exist');
      assert.equal(strategyFile?.category, 'goals');
      assert.equal(growthFile?.category, 'goals');
    });
  });

  describe('summary extraction', () => {
    it('strips HTML comments from summary extraction', async () => {
      // Regression test: HTML comments at the top of files should not appear in summaries
      writeFixtureFile(
        'context/business-overview.md',
        `<!--
[DRAFT] Generated by rapid-context-dump
Source: website (example.com), internal docs
Status: PENDING REVIEW - Do not use until promoted
-->

# Business Overview

**Acme Corp** is a leading provider of widgets.`,
      );
      const result = await getRelevantContext('business overview', paths, {
        primitives: ['Problem'],
      });
      const businessFile = result.files.find(
        (f) => f.relativePath === 'context/business-overview.md',
      );
      assert.ok(businessFile, 'business-overview.md should be found');
      assert.ok(
        !businessFile?.summary?.includes('<!--'),
        'summary should not contain HTML comment opening',
      );
      assert.ok(
        !businessFile?.summary?.includes('DRAFT'),
        'summary should not contain comment content',
      );
      assert.ok(
        businessFile?.summary?.includes('Acme Corp'),
        'summary should contain actual content',
      );
    });

    it('handles files with only HTML comments followed by content', async () => {
      writeFixtureFile(
        'goals/strategy.md',
        `<!-- Source: internal -->
# Strategy

Our vision is to dominate the market.`,
      );
      const result = await getRelevantContext('strategy', paths);
      const strategyFile = result.files.find((f) => f.relativePath === 'goals/strategy.md');
      assert.ok(strategyFile, 'strategy.md should be found');
      assert.ok(
        strategyFile?.summary?.includes('dominate'),
        'summary should contain actual content after comment',
      );
    });
  });

  describe('nested context directories (area-level resources)', () => {
    it('scans context/{slug}/ subdirectories for markdown files', async () => {
      // Create area-specific context in a nested directory
      writeFixtureFile(
        'context/glance-communications/notes.md',
        '# Glance Communications Notes\n\nClient meeting notes and decisions about Glance project.',
      );
      const result = await getRelevantContext('Glance project notes', paths);
      const notesFile = result.files.find(
        (f) => f.relativePath === 'context/glance-communications/notes.md',
      );
      assert.ok(notesFile, 'nested context file should be found');
      assert.equal(notesFile?.category, 'context', 'should use context category');
    });

    it('scans deeply nested context subdirectories', async () => {
      // Create deeply nested context file
      writeFixtureFile(
        'context/acme-corp/q1-2026/research.md',
        '# Acme Corp Q1 Research\n\nResearch findings for Acme Corp first quarter.',
      );
      const result = await getRelevantContext('Acme research findings', paths);
      const researchFile = result.files.find(
        (f) => f.relativePath === 'context/acme-corp/q1-2026/research.md',
      );
      assert.ok(researchFile, 'deeply nested context file should be found');
      assert.equal(researchFile?.category, 'context');
    });

    it('excludes context/_history/ directory from scanning', async () => {
      // Create file in _history that should be excluded
      writeFixtureFile(
        'context/_history/old-notes.md',
        '# Old Notes\n\nArchived context history notes.',
      );
      // Create valid context file
      writeFixtureFile(
        'context/current-notes.md',
        '# Current Notes\n\nActive context notes for the project.',
      );
      const result = await getRelevantContext('notes project', paths);
      const historyFile = result.files.find((f) => f.relativePath?.includes('_history'));
      const currentFile = result.files.find((f) => f.relativePath === 'context/current-notes.md');
      assert.ok(!historyFile, '_history files should be excluded');
      assert.ok(currentFile, 'non-_history context files should be included');
    });

    it('excludes nested paths containing _history', async () => {
      // Create file in nested _history path
      writeFixtureFile(
        'context/glance/_history/archived.md',
        '# Archived\n\nOld Glance communications history.',
      );
      const result = await getRelevantContext('Glance communications history', paths);
      const historyFile = result.files.find((f) => f.relativePath?.includes('_history'));
      assert.ok(!historyFile, 'nested _history paths should be excluded');
    });

    it('scans areas/*.md files with context category', async () => {
      // Create area file
      writeFixtureFile(
        'areas/glance-communications.md',
        `---
area: Glance Communications
status: active
recurring_meetings:
  - title: "Glance Sync"
    attendees: ["john-doe"]
    frequency: weekly
---

# Glance Communications

## Current State
Working on Q1 deliverables for Glance partnership.

## Key Decisions
- 2026-01-15: Chose React for frontend
`,
      );
      const result = await getRelevantContext('Glance partnership deliverables', paths);
      const areaFile = result.files.find(
        (f) => f.relativePath === 'areas/glance-communications.md',
      );
      assert.ok(areaFile, 'area file should be found');
      assert.equal(areaFile?.category, 'context', 'area files should use context category (not a new area category)');
    });

    it('includes multiple area files when relevant to query', async () => {
      writeFixtureFile(
        'areas/glance-communications.md',
        '# Glance Communications\n\nGlance partnership context.',
      );
      writeFixtureFile(
        'areas/acme-corp.md',
        '# Acme Corp\n\nAcme partnership context.',
      );
      const result = await getRelevantContext('partnership context', paths);
      const glanceArea = result.files.find(
        (f) => f.relativePath === 'areas/glance-communications.md',
      );
      const acmeArea = result.files.find((f) => f.relativePath === 'areas/acme-corp.md');
      assert.ok(glanceArea, 'glance area should be found');
      assert.ok(acmeArea, 'acme area should be found');
      assert.equal(glanceArea?.category, 'context');
      assert.equal(acmeArea?.category, 'context');
    });

    it('excludes areas/_template.md from results', async () => {
      writeFixtureFile(
        'areas/_template.md',
        '# {area}\n\nTemplate for areas.',
      );
      writeFixtureFile(
        'areas/real-area.md',
        '# Real Area\n\nActual area content template usage.',
      );
      const result = await getRelevantContext('area template', paths);
      const templateFile = result.files.find((f) => f.relativePath === 'areas/_template.md');
      const realFile = result.files.find((f) => f.relativePath === 'areas/real-area.md');
      assert.ok(!templateFile, '_template.md should be excluded');
      assert.ok(realFile, 'real area files should be included');
    });
  });
});
