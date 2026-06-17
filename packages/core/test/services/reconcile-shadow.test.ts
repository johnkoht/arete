/**
 * CHR-W7 infra — raw pre-reconcile snapshots + shadow log scaffolding.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  writeRawExtractionSnapshot,
  writeFailureSnapshot,
  appendReconcileShadowLog,
  parseMeetingFilename,
  RAW_EXTRACTIONS_DIR,
  RECONCILE_SHADOW_LOG,
  type RawExtractionSnapshot,
} from '../../src/services/reconcile-shadow.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { MeetingIntelligence, ValidationWarning } from '../../src/services/meeting-extraction.js';

function createMockStorage(): StorageAdapter & { files: Map<string, string>; mkdirs: string[] } {
  const files = new Map<string, string>();
  const mkdirs: string[] = [];
  return {
    files,
    mkdirs,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir(dir: string) {
      mkdirs.push(dir);
    },
    async getModified() {
      return null;
    },
  } as unknown as StorageAdapter & { files: Map<string, string>; mkdirs: string[] };
}

const INTEL: MeetingIntelligence = {
  summary: 'things happened',
  nextSteps: [],
  actionItems: [
    { owner: '', ownerSlug: 'john-koht', description: 'do the thing', direction: 'i_owe_them' },
  ],
  decisions: ['we decided the thing'],
  learnings: [],
};

describe('parseMeetingFilename', () => {
  it('parses date + slug from standard meeting filenames', () => {
    assert.deepEqual(
      parseMeetingFilename('/ws/resources/meetings/2026-06-09-compliance-workshop.md'),
      { date: '2026-06-09', slug: 'compliance-workshop' },
    );
    assert.deepEqual(
      parseMeetingFilename('resources/meetings/2026-03-01_sprint-planning.md'),
      { date: '2026-03-01', slug: 'sprint-planning' },
    );
  });

  it('returns null without a date prefix', () => {
    assert.equal(parseMeetingFilename('/ws/resources/meetings/untitled.md'), null);
  });
});

describe('writeRawExtractionSnapshot (CHR-W7)', () => {
  it('writes the snapshot to dev/diary/raw-extractions/<date>-<slug>.json', async () => {
    const storage = createMockStorage();
    const out = await writeRawExtractionSnapshot(storage, '/ws', {
      meetingPath: '/ws/resources/meetings/2026-06-09-compliance-workshop.md',
      extractionMode: 'single_pass',
      intelligence: INTEL,
      validationWarnings: [{ type: 'mirror_pair', message: 'mirror-pair suspected: ai_002/ai_005' } as unknown as ValidationWarning],
    });
    assert.equal(out, join('/ws', RAW_EXTRACTIONS_DIR, '2026-06-09-compliance-workshop.json'));
    assert.ok(storage.mkdirs.includes(join('/ws', RAW_EXTRACTIONS_DIR)));

    const snapshot = JSON.parse(storage.files.get(out!)!) as RawExtractionSnapshot;
    assert.equal(snapshot.v, 1);
    assert.equal(snapshot.extractionMode, 'single_pass');
    assert.equal(snapshot.date, '2026-06-09');
    assert.equal(snapshot.slug, 'compliance-workshop');
    assert.deepEqual(snapshot.intelligence, INTEL);
    assert.equal((snapshot.validationWarnings as unknown as Array<{ message: string }>)[0].message, 'mirror-pair suspected: ai_002/ai_005');
    assert.ok(snapshot.capturedAt.includes('T'));
  });

  it('re-extract overwrites the prior snapshot for the same meeting', async () => {
    const storage = createMockStorage();
    const args = {
      meetingPath: 'resources/meetings/2026-06-09-weekly.md',
      extractionMode: 'legacy',
      intelligence: INTEL,
    };
    const p1 = await writeRawExtractionSnapshot(storage, '/ws', args);
    const first = JSON.parse(storage.files.get(p1!)!) as RawExtractionSnapshot;
    const p2 = await writeRawExtractionSnapshot(storage, '/ws', {
      ...args,
      extractionMode: 'single_pass',
    });
    assert.equal(p1, p2);
    const second = JSON.parse(storage.files.get(p2!)!) as RawExtractionSnapshot;
    assert.equal(first.extractionMode, 'legacy');
    assert.equal(second.extractionMode, 'single_pass');
  });

  it('skips (returns null, zero writes) for filenames without a date prefix', async () => {
    const storage = createMockStorage();
    const out = await writeRawExtractionSnapshot(storage, '/ws', {
      meetingPath: '/ws/resources/meetings/untitled.md',
      extractionMode: 'legacy',
      intelligence: INTEL,
    });
    assert.equal(out, null);
    assert.equal(storage.files.size, 0);
  });

  it('round-trips promptMode when provided and omits it when absent (review must-fix 1)', async () => {
    const storage = createMockStorage();
    const out = await writeRawExtractionSnapshot(storage, '/ws', {
      meetingPath: 'resources/meetings/2026-06-09-y.md',
      extractionMode: 'single_pass',
      promptMode: 'thorough',
      intelligence: INTEL,
    });
    const snapshot = JSON.parse(storage.files.get(out!)!) as RawExtractionSnapshot;
    assert.equal(snapshot.promptMode, 'thorough');

    const out2 = await writeRawExtractionSnapshot(storage, '/ws', {
      meetingPath: 'resources/meetings/2026-06-09-z.md',
      extractionMode: 'legacy',
      intelligence: INTEL,
    });
    const snapshot2 = JSON.parse(storage.files.get(out2!)!) as RawExtractionSnapshot;
    assert.ok(!('promptMode' in snapshot2));
  });

  it('omits validationWarnings when empty', async () => {
    const storage = createMockStorage();
    const out = await writeRawExtractionSnapshot(storage, '/ws', {
      meetingPath: 'resources/meetings/2026-06-09-x.md',
      extractionMode: 'legacy',
      intelligence: INTEL,
      validationWarnings: [],
    });
    const snapshot = JSON.parse(storage.files.get(out!)!) as RawExtractionSnapshot;
    assert.ok(!('validationWarnings' in snapshot));
  });
});

describe('writeFailureSnapshot (single_pass W1 / S1)', () => {
  it('records failureReason + message + preview with an empty intelligence shell', async () => {
    const storage = createMockStorage();
    const out = await writeFailureSnapshot(storage, '/ws', {
      meetingPath: 'resources/meetings/2026-06-16-anthony-john-weekly.md',
      extractionMode: 'single_pass',
      promptMode: 'normal',
      failureReason: 'parse_error',
      failureMessage: 'Failed to parse extraction response as JSON: Unexpected token',
      failurePreview: 'Here are the items: {action_items: [unclosed',
    });
    assert.ok(out);
    assert.ok(storage.mkdirs.includes(join('/ws', RAW_EXTRACTIONS_DIR)));
    const snap = JSON.parse(storage.files.get(out!)!) as RawExtractionSnapshot;
    assert.equal(snap.failureReason, 'parse_error');
    assert.equal(snap.failureMessage?.includes('Failed to parse'), true);
    assert.equal(snap.failurePreview, 'Here are the items: {action_items: [unclosed');
    // The intelligence is the empty shell — the extraction never produced items.
    assert.equal(snap.intelligence.summary, '');
    assert.equal(snap.intelligence.actionItems.length, 0);
    assert.equal(snap.extractionMode, 'single_pass');
    assert.equal(snap.promptMode, 'normal');
  });

  it('omits failurePreview when absent (e.g. a call_error)', async () => {
    const storage = createMockStorage();
    const out = await writeFailureSnapshot(storage, '/ws', {
      meetingPath: 'resources/meetings/2026-06-16-x.md',
      extractionMode: 'single_pass',
      failureReason: 'call_error',
      failureMessage: 'AI call failed: Overloaded (529)',
    });
    const snap = JSON.parse(storage.files.get(out!)!) as RawExtractionSnapshot;
    assert.equal(snap.failureReason, 'call_error');
    assert.ok(!('failurePreview' in snap));
  });

  it('returns null when the filename has no date prefix (no snapshot written)', async () => {
    const storage = createMockStorage();
    const out = await writeFailureSnapshot(storage, '/ws', {
      meetingPath: 'notes.md',
      extractionMode: 'single_pass',
      failureReason: 'truncation',
      failureMessage: 'AI response truncated',
    });
    assert.equal(out, null);
    assert.equal(storage.files.size, 0);
  });
});

describe('appendReconcileShadowLog (CHR-W7)', () => {
  it('appends timestamped JSONL entries (read-modify-write fallback path)', async () => {
    const storage = createMockStorage();
    const logPath = await appendReconcileShadowLog(storage, '/ws', {
      type: 'shadow-run',
      date: '2026-06-09',
      agreement: 0.93,
    });
    assert.equal(logPath, join('/ws', RECONCILE_SHADOW_LOG));
    await appendReconcileShadowLog(storage, '/ws', { type: 'note', text: 'soak paused: SP rollback' });

    const lines = storage.files.get(logPath)!.trim().split('\n');
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.equal(first.type, 'shadow-run');
    assert.equal(first.agreement, 0.93);
    assert.ok(typeof first.ts === 'string' && first.ts.includes('T'));
    assert.equal(JSON.parse(lines[1]).type, 'note');
  });

  it('prefers the adapter atomic append when available', async () => {
    const storage = createMockStorage();
    const appended: string[] = [];
    (storage as unknown as { append: (p: string, c: string) => Promise<void> }).append = async (
      _p: string,
      c: string,
    ) => {
      appended.push(c);
    };
    await appendReconcileShadowLog(storage, '/ws', { type: 'diff', engineOnly: 2 });
    assert.equal(appended.length, 1);
    assert.equal(JSON.parse(appended[0]).engineOnly, 2);
    assert.equal(storage.files.size, 0, 'no read-modify-write when append exists');
  });
});
