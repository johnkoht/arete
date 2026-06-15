/**
 * WS-1 (plan-context-injection) — agenda project-doc integration test (T3).
 *
 * Automated stand-in for AC1.9 (the manual arete-reserv spike): a temp
 * workspace mirroring the glance case — an area-inferring meeting + a project
 * with a roadmap root doc — run through `arete agenda scaffold --meeting … --json`
 * and asserting ≥1 `project-doc` candidate references the fixture doc's SPECIFIC
 * content (pre-mortem R8: assert real content, never length>=0).
 *
 * Runs in CI; does NOT touch ~/code/arete-reserv.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { runCli } from '../helpers.js';
import { createIntegrationSandbox, installWorkspace } from './helpers.js';

interface ScaffoldCandidate {
  text: string;
  source: string;
}
interface ScaffoldSection {
  heading: string;
  candidates: ScaffoldCandidate[];
}
interface ScaffoldResult {
  success: boolean;
  scaffold: {
    sections: ScaffoldSection[];
    unrouted: ScaffoldCandidate[];
    templateType: string;
    sources: string[];
  };
}

describe('integration: agenda scaffold surfaces project-doc candidate (WS-1 AC1.9-auto)', () => {
  let sandboxRoot: string;
  let workspace: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-agenda-project-doc');
    workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  function write(rel: string, content: string): void {
    const full = join(workspace, rel);
    mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  it('an area-inferring meeting whose resolved project has a roadmap doc yields a project-doc candidate with the doc content', () => {
    // 1. Area file with a recurring-meeting title → confidence-1.0 inference.
    write(
      'areas/glance-roadmap.md',
      `---
area: Glance Roadmap
status: active
recurring_meetings:
  - title: Jira Roadmap Sync
---

# Glance Roadmap

## Focus
Roadmap planning across glance surfaces.
`,
    );

    // 2. Project in that area with a ROADMAP ROOT DOC carrying specific content.
    write(
      'projects/active/glance-2-roadmap/README.md',
      `---
name: Glance 2 Roadmap
area: glance-roadmap
status: active
---

# Glance 2 Roadmap

## Background
Overall roadmap container.
`,
    );
    write(
      'projects/active/glance-2-roadmap/glance-1.5-roadmap.md',
      `---
status: active
---

# Glance 1.5 Roadmap

The Jira roadmap decision: keep the roadmap in Notion, mirror epics to Jira.
Open risks: engineering capacity for Q3, slice-zero parity with the legacy
surface, and Notion-vs-Jira source-of-truth drift.
`,
    );

    // 3. A saved meeting instance (NO area: frontmatter → area inference runs
    //    on the title). Slug-resolvable via the date-prefixed filename.
    write(
      'resources/meetings/2026-06-09-jira-roadmap-sync.md',
      `---
title: Jira Roadmap Sync
date: 2026-06-09
attendee_ids:
  - dave-builder
---

## Summary
Synced on the roadmap.
`,
    );
    write(
      'people/internal/dave-builder.md',
      `---
name: Dave Builder
slug: dave-builder
---

# Dave Builder
`,
    );

    const output = runCli(
      ['agenda', 'scaffold', '--meeting', '2026-06-09-jira-roadmap-sync', '--json'],
      { cwd: workspace },
    );
    const result = JSON.parse(output) as ScaffoldResult;
    assert.equal(result.success, true);

    const allCandidates = [
      ...result.scaffold.sections.flatMap((s) => s.candidates),
      ...result.scaffold.unrouted,
    ];
    const projectDocCandidates = allCandidates.filter((c) => c.source === 'project-doc');

    assert.ok(
      projectDocCandidates.length >= 1,
      `expected ≥1 project-doc candidate; got sources ${[...new Set(allCandidates.map((c) => c.source))].join(', ')}`,
    );

    // R8: assert the SPECIFIC fixture content surfaced (a roadmap concern),
    // referencing the right file — not a length>=0 check.
    const joined = projectDocCandidates.map((c) => c.text).join('\n');
    assert.match(
      joined,
      /glance-1\.5-roadmap\.md/,
      'project-doc candidate references the roadmap doc',
    );
    assert.ok(
      /Notion/.test(joined) && /(capacity|slice-zero|parity)/.test(joined),
      `project-doc candidate carries a specific roadmap concern; got:\n${joined}`,
    );
  });
});
