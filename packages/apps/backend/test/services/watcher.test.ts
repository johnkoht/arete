/**
 * Tests for services/watcher.ts — meeting and task file watchers.
 *
 * Mocks fs.watch and readFile to test watcher behavior without filesystem access.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startMeetingWatcher, startTaskFileWatcher } from '../../src/services/watcher.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type FsWatchListener = (event: string, filename: string | null) => void;
type FsWatchHandle = { close: () => void };

/**
 * Create a mock fswatch function that lets tests trigger file events.
 */
function createMockFsWatch(): {
  fswatchFn: (path: string, opts: { recursive: boolean }, listener: FsWatchListener) => FsWatchHandle;
  trigger: (event: string, filename: string) => void;
  closed: () => boolean;
} {
  let listener: FsWatchListener | null = null;
  let isClosed = false;

  const fswatchFn = (
    _path: string,
    _opts: { recursive: boolean },
    l: FsWatchListener,
  ): FsWatchHandle => {
    listener = l;
    return {
      close: () => { isClosed = true; },
    };
  };

  const trigger = (event: string, filename: string): void => {
    if (listener) listener(event, filename);
  };

  return { fswatchFn, trigger, closed: () => isClosed };
}

/**
 * Create a mock readFile function.
 */
function createMockReadFile(files: Record<string, string>) {
  return async (path: string, _encoding: BufferEncoding): Promise<string> => {
    const content = files[path];
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  };
}

/**
 * Wait for a condition to be true, polling every 10ms.
 */
function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for condition'));
      setTimeout(check, 10);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startMeetingWatcher', () => {
  const workspaceRoot = '/workspace';
  const meetingsDir = '/workspace/resources/meetings';

  it('returns a cleanup function', () => {
    const { fswatchFn } = createMockFsWatch();
    const readFileFn = createMockReadFile({});

    const stop = startMeetingWatcher(workspaceRoot, () => {}, { fswatchFn, readFileFn });
    assert.equal(typeof stop, 'function');
    stop();
  });

  it('calls onNew when a synced meeting file is detected', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const meetingPath = `${meetingsDir}/2026-03-01-team-sync.md`;
    const readFileFn = createMockReadFile({
      [meetingPath]: `---
title: Team Sync
date: 2026-03-01
status: synced
---

Meeting content.
`,
    });

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    trigger('change', '2026-03-01-team-sync.md');

    await waitFor(() => called.length > 0);
    stop();

    assert.equal(called.length, 1);
    assert.equal(called[0], '2026-03-01-team-sync');
  });

  it('does NOT call onNew for already-processed meetings (status: processed)', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const meetingPath = `${meetingsDir}/2026-03-01-team-sync.md`;
    const readFileFn = createMockReadFile({
      [meetingPath]: `---
title: Team Sync
date: 2026-03-01
status: processed
---

Meeting content.
`,
    });

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    trigger('change', '2026-03-01-team-sync.md');

    // Wait a bit to confirm it doesn't get called
    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should not process already-processed meetings');
  });

  it('does NOT call onNew for approved meetings (status: approved)', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const meetingPath = `${meetingsDir}/2026-03-01-standup.md`;
    const readFileFn = createMockReadFile({
      [meetingPath]: `---
title: Standup
date: 2026-03-01
status: approved
---
`,
    });

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    trigger('change', '2026-03-01-standup.md');

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should not process approved meetings');
  });

  it('does NOT call onNew for the same slug twice (deduplication)', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const meetingPath = `${meetingsDir}/2026-03-01-team-sync.md`;
    const readFileFn = createMockReadFile({
      [meetingPath]: `---
title: Team Sync
date: 2026-03-01
status: synced
---
`,
    });

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    // Trigger the same file twice
    trigger('change', '2026-03-01-team-sync.md');
    await waitFor(() => called.length >= 1);
    trigger('change', '2026-03-01-team-sync.md');

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 1, 'Should only process each slug once');
  });

  it('ignores non-.md files', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const readFileFn = createMockReadFile({});

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    trigger('change', 'some-file.json');
    trigger('change', 'readme.txt');

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should ignore non-.md files');
  });

  it('ignores events with null filename', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const readFileFn = createMockReadFile({});

    const called: string[] = [];
    const stop = startMeetingWatcher(
      workspaceRoot,
      (slug) => called.push(slug),
      { fswatchFn, readFileFn },
    );

    trigger('change', null as unknown as string);

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should ignore null filenames');
  });

  it('stops the watcher when cleanup function is called', () => {
    const { fswatchFn, closed } = createMockFsWatch();
    const readFileFn = createMockReadFile({});

    assert.equal(closed(), false);
    const stop = startMeetingWatcher(workspaceRoot, () => {}, { fswatchFn, readFileFn });
    stop();
    assert.equal(closed(), true, 'Watcher should be closed after cleanup');
  });

  it('returns noop cleanup when meetings dir does not exist (fswatchFn throws)', async () => {
    const fswatchFn = () => {
      throw new Error('ENOENT: no such file or directory');
    };
    const readFileFn = createMockReadFile({});

    // Should not throw
    const stop = startMeetingWatcher(workspaceRoot, () => {}, { fswatchFn, readFileFn });
    assert.equal(typeof stop, 'function');
    stop(); // Should not throw
  });
});

// ---------------------------------------------------------------------------
// Task file watcher tests
// ---------------------------------------------------------------------------

describe('startTaskFileWatcher', () => {
  const workspaceRoot = '/workspace';

  it('returns a cleanup function', () => {
    const { fswatchFn } = createMockFsWatch();
    const stop = startTaskFileWatcher(workspaceRoot, () => {}, { fswatchFn });
    assert.equal(typeof stop, 'function');
    stop();
  });

  it('calls onChange when week.md changes', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    trigger('change', 'week.md');
    await waitFor(() => called.length > 0);
    stop();

    assert.equal(called.length, 1);
    assert.equal(called[0], 'week.md');
  });

  it('calls onChange when tasks.md changes', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    trigger('change', 'tasks.md');
    await waitFor(() => called.length > 0);
    stop();

    assert.equal(called.length, 1);
    assert.equal(called[0], 'tasks.md');
  });

  it('ignores non-task files', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    trigger('change', 'scratchpad.md');
    trigger('change', 'goals.md');
    trigger('change', 'random.txt');

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should only watch week.md and tasks.md');
  });

  it('debounces rapid changes to the same file', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    // Rapid-fire changes to week.md
    trigger('change', 'week.md');
    trigger('change', 'week.md');
    trigger('change', 'week.md');

    await waitFor(() => called.length > 0);
    // Wait extra to confirm no more calls
    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 1, 'Should debounce multiple rapid changes');
    assert.equal(called[0], 'week.md');
  });

  it('handles both files changing independently', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    trigger('change', 'week.md');
    trigger('change', 'tasks.md');

    await waitFor(() => called.length >= 2);
    stop();

    assert.equal(called.length, 2);
    assert.ok(called.includes('week.md'));
    assert.ok(called.includes('tasks.md'));
  });

  it('returns noop cleanup when now/ dir does not exist', () => {
    const fswatchFn = () => {
      throw new Error('ENOENT: no such file or directory');
    };

    const stop = startTaskFileWatcher(workspaceRoot, () => {}, { fswatchFn });
    assert.equal(typeof stop, 'function');
    stop(); // Should not throw
  });

  it('stops the watcher when cleanup function is called', () => {
    const { fswatchFn, closed } = createMockFsWatch();

    assert.equal(closed(), false);
    const stop = startTaskFileWatcher(workspaceRoot, () => {}, { fswatchFn });
    stop();
    assert.equal(closed(), true, 'Watcher should be closed after cleanup');
  });

  it('ignores null filenames', async () => {
    const { fswatchFn, trigger } = createMockFsWatch();
    const called: string[] = [];

    const stop = startTaskFileWatcher(
      workspaceRoot,
      (filename) => called.push(filename),
      { fswatchFn },
    );

    trigger('change', null as unknown as string);

    await new Promise((r) => setTimeout(r, 600));
    stop();

    assert.equal(called.length, 0, 'Should ignore null filenames');
  });
});
