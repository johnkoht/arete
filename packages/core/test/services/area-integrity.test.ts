/**
 * Tests for area-integrity service (`checkAreaIntegrity`).
 *
 * Covers:
 * - clean workspace → clean report, exit-worthy sections empty
 * - dangling meeting ref reported, grouped by value with relative paths
 * - alias-resolved refs NOT reported
 * - duplicate alias (claimed by 2+ areas) reported
 * - shadowing alias (equals another area's canonical slug) reported
 * - orphan area-keyed artifacts reported (memory dir + L3 summary)
 * - missing directories tolerated (empty sections, no throw)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestWorkspace } from '../fixtures/index.js';
import type { TestWorkspaceFixture } from '../fixtures/types.js';
import { checkAreaIntegrity } from '../../src/services/area-integrity.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

function areaFile(name: string, aliases: string[] = []): string {
  const aliasBlock =
    aliases.length > 0
      ? `aliases:\n${aliases.map((a) => `  - ${a}`).join('\n')}\n`
      : '';
  return `---\narea: ${name}\nstatus: active\n${aliasBlock}---\n\n# ${name}\n`;
}

function meetingFile(title: string, area?: string): string {
  const areaLine = area ? `area: ${area}\n` : '';
  return `---\ntitle: "${title}"\ndate: "2026-06-01"\n${areaLine}---\n\n# ${title}\n`;
}

describe('checkAreaIntegrity', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;
  let fixture: TestWorkspaceFixture;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'area-integrity-'));
    fixture = createTestWorkspace(tmpDir);
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports clean on a workspace where every reference resolves', async () => {
    fixture.writeFile('areas/platform.md', areaFile('Platform'));
    fixture.writeFile('areas/_template.md', '---\narea: {name}\n---\n');
    fixture.writeFile(
      'resources/meetings/2026-06-01-sync.md',
      meetingFile('Platform Sync', 'platform'),
    );
    fixture.writeFile(
      'projects/active/migration/README.md',
      '---\nproject: Migration\narea: platform\n---\n\n# Migration\n',
    );
    fixture.writeFile(
      'goals/2026-q2-ship.md',
      '---\nid: 2026-Q2-1\ntitle: Ship\nquarter: 2026-Q2\narea: platform\n---\n\nBody\n',
    );
    fixture.writeFile(
      '.arete/memory/topics/kubernetes.md',
      '---\ntopic: Kubernetes\narea: platform\n---\n\n# Kubernetes\n',
    );

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.deepEqual(report.canonicalSlugs, ['platform']);
    assert.equal(report.scannedFiles, 4);
    assert.deepEqual(report.dangling, []);
    assert.deepEqual(report.duplicateAliases, []);
    assert.deepEqual(report.shadowingAliases, []);
    assert.deepEqual(report.orphans, []);
    assert.equal(report.clean, true);
  });

  it('reports a dangling meeting ref grouped by value with relative paths', async () => {
    fixture.writeFile('areas/platform.md', areaFile('Platform'));
    fixture.writeFile(
      'resources/meetings/2026-06-01-a.md',
      meetingFile('A', 'platfrom'), // typo
    );
    fixture.writeFile(
      'resources/meetings/2026-06-02-b.md',
      meetingFile('B', 'platfrom'), // same typo — must group
    );

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.equal(report.clean, false);
    assert.equal(report.dangling.length, 1);
    assert.equal(report.dangling[0].value, 'platfrom');
    assert.equal(report.dangling[0].count, 2);
    assert.deepEqual(report.dangling[0].files, [
      'resources/meetings/2026-06-01-a.md',
      'resources/meetings/2026-06-02-b.md',
    ]);
  });

  it('does NOT report refs that resolve via an alias', async () => {
    fixture.writeFile('areas/platform.md', areaFile('Platform', ['infra']));
    fixture.writeFile(
      'resources/meetings/2026-06-01-a.md',
      meetingFile('A', 'infra'),
    );

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.deepEqual(report.dangling, []);
    assert.equal(report.aliasCount, 1);
    assert.equal(report.clean, true);
  });

  it('scans archived project READMEs (both archive naming shapes) and prose Area lines', async () => {
    fixture.writeFile('areas/platform.md', areaFile('Platform'));
    fixture.writeFile(
      'projects/archive/old-thing/README.md',
      '---\nproject: Old Thing\narea: gone-area\n---\n\n# Old Thing\n',
    );
    fixture.writeFile(
      'projects/archive/2026-05_other/README.md',
      '# Other\n\n**Area**: [Platform](../../../areas/platform.md)\n',
    );

    const report = await checkAreaIntegrity(storage, fixture.paths);

    // Frontmatter ref dangles; prose markdown-link ref resolves.
    assert.equal(report.dangling.length, 1);
    assert.equal(report.dangling[0].value, 'gone-area');
    assert.deepEqual(report.dangling[0].files, [
      'projects/archive/old-thing/README.md',
    ]);
  });

  it('reports an alias claimed by two areas as a duplicate', async () => {
    fixture.writeFile('areas/alpha.md', areaFile('Alpha', ['shared']));
    fixture.writeFile('areas/beta.md', areaFile('Beta', ['shared']));

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.equal(report.duplicateAliases.length, 1);
    assert.equal(report.duplicateAliases[0].alias, 'shared');
    assert.deepEqual(report.duplicateAliases[0].areas, ['alpha', 'beta']);
    assert.equal(report.clean, false);
  });

  it('still resolves refs through a duplicate alias (first claim wins)', async () => {
    fixture.writeFile('areas/alpha.md', areaFile('Alpha', ['shared']));
    fixture.writeFile('areas/beta.md', areaFile('Beta', ['shared']));
    fixture.writeFile(
      'resources/meetings/2026-06-01-a.md',
      meetingFile('A', 'shared'),
    );

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.deepEqual(report.dangling, []);
  });

  it('reports an alias that shadows another area\'s canonical slug', async () => {
    fixture.writeFile('areas/alpha.md', areaFile('Alpha', ['beta']));
    fixture.writeFile('areas/beta.md', areaFile('Beta'));

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.equal(report.shadowingAliases.length, 1);
    assert.deepEqual(report.shadowingAliases[0], {
      alias: 'beta',
      declaredBy: 'alpha',
      shadows: 'beta',
    });
    assert.equal(report.clean, false);
  });

  it('reports orphan area-keyed artifacts but keeps the report clean', async () => {
    fixture.writeFile('areas/platform.md', areaFile('Platform', ['infra']));
    // Orphans: slug resolves to no area and no alias.
    fixture.writeFile('areas/ghost/memory.md', '## Keywords\n- old\n');
    fixture.writeFile('.arete/memory/areas/phantom.md', '# Phantom\n');
    // Non-orphans: canonical and alias keyed artifacts.
    fixture.writeFile('areas/platform/memory.md', '## Keywords\n- k8s\n');
    fixture.writeFile('.arete/memory/areas/infra.md', '# Infra\n');

    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.deepEqual(report.orphans, [
      {
        slug: 'ghost',
        path: 'areas/ghost/memory.md',
        kind: 'area-memory-dir',
      },
      {
        slug: 'phantom',
        path: '.arete/memory/areas/phantom.md',
        kind: 'memory-area-summary',
      },
    ]);
    // Orphans are informational — they do not flip `clean`.
    assert.equal(report.clean, true);
  });

  it('tolerates a workspace with no areas dir and no surface dirs', async () => {
    // createTestWorkspace only computes paths — nothing written at all.
    const report = await checkAreaIntegrity(storage, fixture.paths);

    assert.deepEqual(report.canonicalSlugs, []);
    assert.equal(report.aliasCount, 0);
    assert.equal(report.scannedFiles, 0);
    assert.deepEqual(report.dangling, []);
    assert.deepEqual(report.duplicateAliases, []);
    assert.deepEqual(report.shadowingAliases, []);
    assert.deepEqual(report.orphans, []);
    assert.equal(report.clean, true);
  });
});
