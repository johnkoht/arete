/**
 * Tests for Phase 10b-min Step 5 — reverse-stamp on the canonical's meeting.
 *
 * Covers pure helpers (buildReverseStampMarker, matchReverseStampMarker,
 * insertReverseStampIntoBody). The full `applyReverseStamp` integration
 * with writeWithLock requires a real filesystem (proper-lockfile expects
 * a real file path); we exercise it via a temp-dir test that creates a
 * fixture file, stamps it, and reads back.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReverseStampMarker,
  matchReverseStampMarker,
  insertReverseStampIntoBody,
  applyReverseStamp,
} from '../../src/services/commitment-dedup-reverse-stamp.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('buildReverseStampMarker', () => {
  it('builds the expected HTML-comment format', () => {
    const m = buildReverseStampMarker('2026-06-02-glance-2-sync', '2026-06-02');
    assert.equal(m, '<!-- also surfaced in 2026-06-02-glance-2-sync on 2026-06-02 -->');
  });
  it('trims ISO-prefix dates', () => {
    const m = buildReverseStampMarker('m', '2026-06-02T10:00:00Z');
    assert.equal(m, '<!-- also surfaced in m on 2026-06-02 -->');
  });
});

describe('matchReverseStampMarker', () => {
  const body = `
- ai_001: Talk to Dave about staffing
<!-- also surfaced in 2026-06-02-other on 2026-06-02 -->
`;
  it('matches an existing stamp for the same slug', () => {
    assert.equal(matchReverseStampMarker(body, '2026-06-02-other'), true);
  });
  it('returns false for an absent slug', () => {
    assert.equal(matchReverseStampMarker(body, '2026-06-03-yet-another'), false);
  });
});

describe('insertReverseStampIntoBody', () => {
  it('inserts marker AFTER matching item ID line', () => {
    const body = [
      '## Staged Action Items',
      '- ai_001: Talk to Dave about staffing',
      '- ai_002: Other thing',
    ].join('\n');
    const marker = '<!-- also surfaced in m-b on 2026-06-02 -->';
    const result = insertReverseStampIntoBody(body, marker, 'm-b', 'ai_001');
    assert.equal(result.changed, true);
    assert.match(
      result.body,
      /- ai_001: Talk to Dave about staffing\n<!-- also surfaced in m-b on 2026-06-02 -->/,
    );
  });

  it('appends to end when itemId not found', () => {
    const body = '## Some Section\n- something\n';
    const marker = '<!-- also surfaced in m-b on 2026-06-02 -->';
    const result = insertReverseStampIntoBody(body, marker, 'm-b', 'ai_999');
    assert.equal(result.changed, true);
    assert.match(result.body, /<!-- also surfaced in m-b on 2026-06-02 -->\s*$/);
  });

  it('idempotent: re-stamp with same slug returns unchanged', () => {
    const body = [
      '- ai_001: foo',
      '<!-- also surfaced in m-b on 2026-06-02 -->',
    ].join('\n');
    const marker = '<!-- also surfaced in m-b on 2026-06-02 -->';
    const result = insertReverseStampIntoBody(body, marker, 'm-b', 'ai_001');
    assert.equal(result.changed, false);
    assert.equal(result.body, body);
  });

  it('appends a SECOND stamp for a DIFFERENT slug', () => {
    const body = [
      '- ai_001: foo',
      '<!-- also surfaced in m-b on 2026-06-02 -->',
    ].join('\n');
    const marker = '<!-- also surfaced in m-c on 2026-06-03 -->';
    const result = insertReverseStampIntoBody(body, marker, 'm-c', 'ai_001');
    assert.equal(result.changed, true);
    assert.match(result.body, /also surfaced in m-b on 2026-06-02/);
    assert.match(result.body, /also surfaced in m-c on 2026-06-03/);
  });
});

// ---------------------------------------------------------------------------
// applyReverseStamp (filesystem integration)
// ---------------------------------------------------------------------------

/**
 * Real-filesystem storage adapter — minimal shape used by writeWithLock.
 * We use direct `node:fs` reads/writes inside the adapter because
 * writeWithLock's atomic tmp+rename does the actual work; the adapter
 * fallback path is exercised only on platforms without rename support.
 */
function createFsAdapter(): StorageAdapter {
  return {
    async read(path: string) {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    async write(path: string, content: string) {
      await writeFile(path, content, 'utf8');
    },
    async exists(path: string) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async delete() {
      /* not used by writeWithLock */
    },
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {
      /* no-op */
    },
    async getModified() {
      return null;
    },
  };
}

describe('applyReverseStamp — filesystem integration', () => {
  it('writes a stamp into the canonical meeting file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arete-revstamp-'));
    const filePath = join(dir, '2026-06-01-canon.md');
    const original = `---
title: "Canon Meeting"
date: "2026-06-01"
status: processed
---

## Staged Action Items
- ai_001: Talk to Dave about staffing

## Notes
Some other content.
`;
    // Backdate mtime so the 60s guard doesn't fire.
    writeFileSync(filePath, original, 'utf8');
    const past = new Date(Date.now() - 5 * 60 * 1000);
    utimesSync(filePath, past, past);

    const storage = createFsAdapter();
    const result = await applyReverseStamp(storage, {
      canonicalMeetingPath: filePath,
      canonicalItemId: 'ai_001',
      newMeetingSlug: '2026-06-02-other-meeting',
      newMeetingDate: '2026-06-02',
    });

    try {
      assert.equal(result.written, true, `expected written; got ${JSON.stringify(result)}`);
      const after = readFileSync(filePath, 'utf8');
      assert.match(after, /also surfaced in 2026-06-02-other-meeting on 2026-06-02/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('abstains with `already-stamped` when an idempotent re-stamp is attempted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arete-revstamp-'));
    const filePath = join(dir, '2026-06-01-canon.md');
    const original = `---
title: "Canon Meeting"
date: "2026-06-01"
status: processed
---

## Staged Action Items
- ai_001: Talk to Dave about staffing
<!-- also surfaced in 2026-06-02-other-meeting on 2026-06-02 -->

## Notes
`;
    writeFileSync(filePath, original, 'utf8');
    const past = new Date(Date.now() - 5 * 60 * 1000);
    utimesSync(filePath, past, past);

    const storage = createFsAdapter();
    const result = await applyReverseStamp(storage, {
      canonicalMeetingPath: filePath,
      canonicalItemId: 'ai_001',
      newMeetingSlug: '2026-06-02-other-meeting',
      newMeetingDate: '2026-06-02',
    });
    try {
      assert.equal(result.written, false);
      assert.equal(result.abstainReason, 'already-stamped');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('abstains with `recent-user-edit` when canonical file is fresh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arete-revstamp-'));
    const filePath = join(dir, '2026-06-01-canon.md');
    const original = `---
title: "Canon Meeting"
date: "2026-06-01"
status: processed
---

## Staged Action Items
- ai_001: Talk to Dave about staffing
`;
    writeFileSync(filePath, original, 'utf8');
    // File mtime = now → within 60s guard.

    const storage = createFsAdapter();
    const result = await applyReverseStamp(storage, {
      canonicalMeetingPath: filePath,
      canonicalItemId: 'ai_001',
      newMeetingSlug: '2026-06-02-other-meeting',
      newMeetingDate: '2026-06-02',
    });
    try {
      assert.equal(result.written, false);
      assert.equal(result.abstainReason, 'recent-user-edit');
      const after = readFileSync(filePath, 'utf8');
      assert.ok(!/also surfaced/.test(after), 'no stamp should be written');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('absorbs a missing-file error into abstainReason (best-effort)', async () => {
    const storage = createFsAdapter();
    const result = await applyReverseStamp(storage, {
      canonicalMeetingPath: '/nonexistent/path/canon.md',
      newMeetingSlug: '2026-06-02-other-meeting',
      newMeetingDate: '2026-06-02',
    });
    assert.equal(result.written, false);
    assert.ok(result.abstainReason);
    assert.match(result.abstainReason!, /error:/);
  });
});
