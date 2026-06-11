/**
 * Regression tests: resolve(id, 'dropped') must NOT back-propagate task
 * completion (F1) onto week.md / tasks.md.
 *
 * Live incident 2026-06-10: a winddown batch-drop of 6 mirror duplicates
 * marked 7 week.md tasks falsely [x], because resolve()'s F1 back-prop
 * block fired unconditionally regardless of status. Dropped ≠ done.
 *
 * Uses a REAL filesystem (tmp dir + FileStorageAdapter, no mocks) so the
 * byte-identity assertion covers the full storage path, and so the
 * proper-lockfile save() path runs for real (no ARETE_LOCK_BYPASS_MOCK).
 * Wiring mirrors factory.ts: CommitmentsService + TaskService with the
 * completeTaskFromCommitment injection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommitmentsService } from '../../src/services/commitments.js';
import { TaskService } from '../../src/services/tasks.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { Commitment, CommitmentsFile, WorkspacePaths } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Counting adapter — zero-write guarantee pattern (see LEARNINGS:
// "Zero-write guarantees: assert with a counting StorageAdapter subclass")
// ---------------------------------------------------------------------------

class CountingFileStorageAdapter extends FileStorageAdapter {
  writes: string[] = [];

  override async write(path: string, content: string): Promise<void> {
    this.writes.push(path);
    return super.write(path, content);
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor/rules'),
    agentSkills: join(root, '.agents/skills'),
    managedSkills: join(root, '.arete/skills'),
    tools: join(root, '.cursor/tools'),
    integrations: join(root, '.arete/integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete/memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function makeCommitment(id: string, text: string): Commitment {
  return {
    id,
    text,
    direction: 'i_owe_them',
    personSlug: 'alice',
    personName: 'Alice Smith',
    source: 'meeting-2026-06-09.md',
    date: '2026-06-09',
    status: 'open',
    resolvedAt: null,
  };
}

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);

function weekFixture(): string {
  return [
    '# Week',
    '',
    '## Inbox',
    `- [ ] Send the slides to Alice @from(commitment:${ID_A.slice(0, 8)})`,
    `- [ ] Review the Q3 plan @from(commitment:${ID_B.slice(0, 8)})`,
    '',
    '### Must complete',
    '',
  ].join('\n');
}

function buildWorkspace(root: string, commitments: Commitment[]): void {
  mkdirSync(join(root, '.arete'), { recursive: true });
  mkdirSync(join(root, 'now'), { recursive: true });
  const file: CommitmentsFile = { commitments };
  writeFileSync(join(root, '.arete/commitments.json'), JSON.stringify(file, null, 2));
  writeFileSync(join(root, 'now/week.md'), weekFixture());
}

function wireServices(root: string, storage: FileStorageAdapter) {
  const commitments = new CommitmentsService(storage, root);
  const tasks = new TaskService(storage, makePaths(root), commitments);
  // Mirrors factory.ts F1 wiring.
  commitments.setCompleteTaskFromCommitmentFn((prefix) =>
    tasks.completeTaskByCommitmentId(prefix),
  );
  commitments.setHasOpenTaskReferencesFn((prefixes) =>
    tasks.hasOpenTaskReferencesToCommitments(prefixes),
  );
  return { commitments, tasks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommitmentsService.resolve(id, 'dropped') — no task back-prop", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'arete-dropped-backprop-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolve(id, 'dropped') leaves linked open task untouched — week.md byte-identical", async () => {
    buildWorkspace(root, [makeCommitment(ID_A, 'Send the slides to Alice')]);
    const weekPath = join(root, 'now/week.md');
    const bytesBefore = readFileSync(weekPath);

    const { commitments, tasks } = wireServices(root, new FileStorageAdapter());
    const dropped = await commitments.resolve(ID_A, 'dropped');

    // Commitment IS dropped in commitments.json.
    assert.equal(dropped.status, 'dropped');
    assert.ok(dropped.resolvedAt, 'dropped commitment gets resolvedAt');
    const written = JSON.parse(
      readFileSync(join(root, '.arete/commitments.json'), 'utf8'),
    ) as CommitmentsFile;
    assert.equal(written.commitments[0].status, 'dropped');

    // Task file is byte-identical — no [x], no @completedAt, no rewrite.
    const bytesAfter = readFileSync(weekPath);
    assert.ok(
      bytesBefore.equals(bytesAfter),
      'week.md must be byte-identical after a drop — dropped ≠ done',
    );

    // And the task is still open through the service's own view.
    const open = await tasks.listTasks({ completed: false });
    const linked = open.find((t) => t.metadata.from?.id === ID_A.slice(0, 8));
    assert.ok(linked, 'linked task must still be open after drop');
  });

  it("resolve(id, 'resolved') still completes the linked task (existing F1 behavior preserved)", async () => {
    buildWorkspace(root, [makeCommitment(ID_A, 'Send the slides to Alice')]);
    const weekPath = join(root, 'now/week.md');

    const { commitments } = wireServices(root, new FileStorageAdapter());
    const resolved = await commitments.resolve(ID_A, 'resolved');
    assert.equal(resolved.status, 'resolved');

    const week = readFileSync(weekPath, 'utf8');
    assert.match(week, /- \[x\] Send the slides to Alice/);
    assert.match(week, /@completedAt\(/);
    // The OTHER task (different commitment) stays open.
    assert.match(week, /- \[ \] Review the Q3 plan/);
  });

  it("bulkResolve(ids, 'dropped') performs zero task-file writes (counting adapter)", async () => {
    buildWorkspace(root, [
      makeCommitment(ID_A, 'Send the slides to Alice'),
      makeCommitment(ID_B, 'Review the Q3 plan'),
    ]);
    const storage = new CountingFileStorageAdapter();
    const { commitments } = wireServices(root, storage);

    const results = await commitments.bulkResolve([ID_A, ID_B], 'dropped');
    assert.equal(results.length, 2);
    assert.ok(results.every((c) => c.status === 'dropped'));

    const taskFileWrites = storage.writes.filter(
      (p) => p.endsWith('week.md') || p.endsWith('tasks.md'),
    );
    assert.deepEqual(
      taskFileWrites,
      [],
      'batch-drop must never write week.md / tasks.md',
    );
    // Sanity: the commitments file itself WAS written (one save per resolve).
    assert.ok(
      storage.writes.some((p) => p.endsWith('commitments.json')),
      'commitments.json should still be updated by the drop',
    );

    // Both tasks remain open on disk.
    const week = readFileSync(join(root, 'now/week.md'), 'utf8');
    assert.match(week, /- \[ \] Send the slides to Alice/);
    assert.match(week, /- \[ \] Review the Q3 plan/);
  });
});
