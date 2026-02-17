import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import type { WorkspacePaths } from '../../src/models/index.js';

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

    const personContent = readFileSync(
      join(tmpDir, 'people', 'internal', 'jane-doe.md'),
      'utf8',
    );

    assert.ok(personContent.includes('## Memory Highlights (Auto)'));
    assert.ok(personContent.includes('timeline risk for launch'));
    assert.ok(personContent.includes('budget runway'));
    assert.ok(personContent.includes('mentioned 2 times'));
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
