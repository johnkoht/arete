import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { MemoryLogService } from '../../src/services/memory-log.js';
import { parseLog } from '../../src/utils/memory-log.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

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

async function withTempWorkspace(
  fn: (paths: WorkspacePaths, svc: MemoryLogService, logPath: string) => Promise<void>,
): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'arete-memory-log-'));
  const paths = makePaths(tmp);
  const storage = new FileStorageAdapter();
  const svc = new MemoryLogService(storage);
  const logPath = join(paths.memory, 'log.md');
  try {
    await fn(paths, svc, logPath);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

describe('MemoryLogService.append', () => {
  it('creates log.md on first append with a single event line', async () => {
    await withTempWorkspace(async (paths, svc, logPath) => {
      await svc.append(paths, {
        event: 'refresh',
        fields: { scope: 'all' },
        timestamp: '2026-04-23T00:30:15Z',
      });
      const content = await readFile(logPath, 'utf8');
      assert.match(content, /^## \[2026-04-23T00:30:15Z\] refresh \| scope=all\n$/);
    });
  });

  it('appends subsequent events without overwriting prior ones', async () => {
    await withTempWorkspace(async (paths, svc, logPath) => {
      await svc.append(paths, {
        event: 'refresh',
        fields: {},
        timestamp: '2026-04-23T00:30:15Z',
      });
      await svc.append(paths, {
        event: 'ingest',
        fields: { topic: 'cover-whale' },
        timestamp: '2026-04-23T00:30:16Z',
      });
      const content = await readFile(logPath, 'utf8');
      const events = parseLog(content);
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0].event, 'refresh');
      assert.strictEqual(events[1].event, 'ingest');
    });
  });

  it('stamps timestamp via options.now when not provided', async () => {
    await withTempWorkspace(async (paths, svc, logPath) => {
      const fixedDate = new Date('2026-04-23T12:00:00Z');
      await svc.append(
        paths,
        { event: 'lint', fields: {} },
        { now: fixedDate },
      );
      const content = await readFile(logPath, 'utf8');
      assert.match(content, /\[2026-04-23T12:00:00Z\]/);
    });
  });

  it('is safe under concurrent appenders (POSIX O_APPEND atomicity)', async () => {
    await withTempWorkspace(async (paths, svc, logPath) => {
      const events = Array.from({ length: 20 }, (_, i) => ({
        event: 'ingest' as const,
        fields: { seq: String(i), payload: `line-${i}`.padEnd(200, 'x') },
        timestamp: `2026-04-23T00:30:${String(i).padStart(2, '0')}Z`,
      }));
      // Fire all appends concurrently.
      await Promise.all(events.map((e) => svc.append(paths, e)));

      const content = await readFile(logPath, 'utf8');
      const parsed = parseLog(content);
      // All 20 events must land. Order is not guaranteed under race, but
      // atomicity means no partial lines — every event that went in comes
      // out intact.
      assert.strictEqual(parsed.length, 20, 'all 20 events must survive concurrent append');
      const seqs = new Set(parsed.map((e) => e.fields.seq));
      for (let i = 0; i < 20; i++) {
        assert.ok(seqs.has(String(i)), `event seq=${i} missing`);
      }
      // No truncated lines in raw content.
      for (const line of content.split('\n')) {
        if (line.length === 0) continue;
        // Any non-empty line must either be a complete event header or not a header at all.
        if (line.startsWith('## [')) {
          assert.ok(/^## \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] /.test(line), `torn line: ${line}`);
        }
      }
    });
  });

  it('rejects malformed event kinds at the formatter boundary', async () => {
    await withTempWorkspace(async (paths, svc) => {
      await assert.rejects(() =>
        svc.append(paths, {
          event: 'BadEvent',
          fields: {},
          timestamp: '2026-04-23T00:30:15Z',
        }),
      );
    });
  });

  it('falls back to read-modify-write when adapter has no append primitive', async () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      read: async (p: string) => store.get(p) ?? null,
      write: async (p: string, c: string) => {
        store.set(p, c);
      },
      exists: async () => false,
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
      // NO append
    };
    const svc = new MemoryLogService(fakeStorage);
    const paths = { memory: '/.arete/memory' } as WorkspacePaths;
    await svc.append(paths, {
      event: 'refresh',
      fields: {},
      timestamp: '2026-04-23T00:30:15Z',
    });
    await svc.append(paths, {
      event: 'refresh',
      fields: {},
      timestamp: '2026-04-23T00:30:16Z',
    });
    const content = store.get('/.arete/memory/log.md')!;
    const events = parseLog(content);
    assert.strictEqual(events.length, 2);
  });
});

describe('MemoryLogService.appendItemFate', () => {
  it('writes one JSON object per line to item-fates.jsonl', async () => {
    await withTempWorkspace(async (paths, svc) => {
      await svc.appendItemFate(paths, {
        item_text: 'Send Lauren Q3 pushback on churn assumption',
        item_kind: 'action_item',
        source_path: 'resources/meetings/2026-05-15-glance-comms.md',
        fate: 'approved',
        reason: null,
        confidence: 0.82,
        importance_at_extraction: 'normal',
      });
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const lines = content.split('\n').filter((l) => l.length > 0);
      assert.strictEqual(lines.length, 1);
      const record = JSON.parse(lines[0]);
      assert.strictEqual(record.type, 'item_fate');
      assert.strictEqual(record.fate, 'approved');
      assert.strictEqual(record.item_kind, 'action_item');
      assert.strictEqual(record.item_text, 'Send Lauren Q3 pushback on churn assumption');
      assert.strictEqual(record.confidence, 0.82);
      assert.strictEqual(record.reason, null);
      assert.strictEqual(record.importance_at_extraction, 'normal');
      assert.match(record.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  it('escapes embedded newlines so each event is exactly one line', async () => {
    await withTempWorkspace(async (paths, svc) => {
      await svc.appendItemFate(paths, {
        item_text: 'multi\nline\nitem text',
        item_kind: 'decision',
        source_path: 'resources/meetings/x.md',
        fate: 'dismissed',
        reason: 'duplicate',
        confidence: null,
        importance_at_extraction: null,
      });
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const lines = content.split('\n').filter((l) => l.length > 0);
      assert.strictEqual(lines.length, 1, 'one event = one physical line');
      const record = JSON.parse(lines[0]);
      assert.strictEqual(record.item_text, 'multi\nline\nitem text');
    });
  });

  it('stamps ts via options.now when not provided', async () => {
    await withTempWorkspace(async (paths, svc) => {
      const fixedDate = new Date('2026-04-30T08:00:00Z');
      await svc.appendItemFate(
        paths,
        {
          item_text: 'foo',
          item_kind: 'learning',
          source_path: 'resources/meetings/x.md',
          fate: 'skipped',
          reason: 'matched_completed',
          confidence: 0.9,
          importance_at_extraction: 'light',
        },
        { now: fixedDate },
      );
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const record = JSON.parse(content.trim());
      assert.strictEqual(record.ts, '2026-04-30T08:00:00Z');
    });
  });

  it('Phase 3.5 D1 — accepts deferral_disagreement fate with original_fate + pulled_back_at', async () => {
    await withTempWorkspace(async (paths, svc) => {
      await svc.appendItemFate(paths, {
        item_text: 'Pay Choice demo tomorrow',
        item_kind: 'action_item',
        source_path: 'deferred-2026-05-05.md',
        fate: 'deferral_disagreement',
        reason: 'covered elsewhere',
        confidence: null,
        importance_at_extraction: null,
        original_fate: 'deferred',
        pulled_back_at: '2026-05-06T08:30:00Z',
      });
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const lines = content.split('\n').filter((l) => l.length > 0);
      assert.strictEqual(lines.length, 1);
      const record = JSON.parse(lines[0]);
      assert.strictEqual(record.fate, 'deferral_disagreement');
      assert.strictEqual(record.original_fate, 'deferred');
      assert.strictEqual(record.pulled_back_at, '2026-05-06T08:30:00Z');
      // reason carries the ORIGINAL defer reason — bias-correction target.
      assert.strictEqual(record.reason, 'covered elsewhere');
      assert.strictEqual(record.source_path, 'deferred-2026-05-05.md');
    });
  });

  it('Phase 3.5 D1 — does not emit original_fate / pulled_back_at when not set (existing fates)', async () => {
    await withTempWorkspace(async (paths, svc) => {
      await svc.appendItemFate(paths, {
        item_text: 'normal approved item',
        item_kind: 'action_item',
        source_path: 'resources/meetings/x.md',
        fate: 'approved',
        reason: null,
        confidence: 0.9,
        importance_at_extraction: 'normal',
      });
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const record = JSON.parse(content.trim());
      // Backward-compat: no extra D1 fields on existing fate types.
      assert.ok(!('original_fate' in record), 'original_fate omitted when not set');
      assert.ok(!('pulled_back_at' in record), 'pulled_back_at omitted when not set');
    });
  });

  it('survives 10 parallel writers × 100 events without malformed lines (AC0.5)', async () => {
    await withTempWorkspace(async (paths, svc) => {
      const writers = 10;
      const eventsPerWriter = 100;
      const work: Promise<void>[] = [];
      for (let w = 0; w < writers; w++) {
        for (let i = 0; i < eventsPerWriter; i++) {
          work.push(
            svc.appendItemFate(paths, {
              item_text: `writer-${w}-event-${i}`.padEnd(150, 'x'),
              item_kind: 'action_item',
              source_path: `resources/meetings/w${w}.md`,
              fate: 'skipped',
              reason: 'duplicate',
              confidence: 0.5,
              importance_at_extraction: 'normal',
            }),
          );
        }
      }
      await Promise.all(work);
      const content = await readFile(join(paths.memory, 'item-fates.jsonl'), 'utf8');
      const lines = content.split('\n').filter((l) => l.length > 0);
      assert.strictEqual(lines.length, writers * eventsPerWriter, 'all events must land');

      const seen = new Set<string>();
      for (const line of lines) {
        let record: { item_text: string; type: string; fate: string };
        try {
          record = JSON.parse(line);
        } catch (err) {
          assert.fail(`torn JSON line: ${line.slice(0, 80)}…`);
        }
        assert.strictEqual(record.type, 'item_fate', 'every line is a typed event');
        seen.add(record.item_text);
      }
      // Every (writer,event) pair must appear exactly once.
      for (let w = 0; w < writers; w++) {
        for (let i = 0; i < eventsPerWriter; i++) {
          const expected = `writer-${w}-event-${i}`.padEnd(150, 'x');
          assert.ok(seen.has(expected), `missing event ${w}/${i}`);
        }
      }
    });
  });

  it('falls back to read-modify-write when adapter has no append primitive', async () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      read: async (p: string) => store.get(p) ?? null,
      write: async (p: string, c: string) => {
        store.set(p, c);
      },
      exists: async () => false,
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };
    const svc = new MemoryLogService(fakeStorage);
    const paths = { memory: '/.arete/memory' } as WorkspacePaths;
    await svc.appendItemFate(paths, {
      item_text: 'a',
      item_kind: 'action_item',
      source_path: 'm.md',
      fate: 'approved',
      reason: null,
      confidence: null,
      importance_at_extraction: null,
    });
    await svc.appendItemFate(paths, {
      item_text: 'b',
      item_kind: 'decision',
      source_path: 'm.md',
      fate: 'dismissed',
      reason: 'duplicate',
      confidence: null,
      importance_at_extraction: null,
    });
    const content = store.get('/.arete/memory/item-fates.jsonl')!;
    const lines = content.split('\n').filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 2);
    const records = lines.map((l) => JSON.parse(l));
    assert.strictEqual(records[0].item_text, 'a');
    assert.strictEqual(records[1].item_text, 'b');
  });
});

describe('FileStorageAdapter.append', () => {
  it('is atomic for concurrent appenders of small lines', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-append-'));
    try {
      const storage = new FileStorageAdapter();
      const path = join(tmp, 'log.txt');
      const lines = Array.from({ length: 50 }, (_, i) => `line-${i}\n`);
      await Promise.all(lines.map((l) => storage.append(path, l)));
      const content = await readFile(path, 'utf8');
      const out = content.split('\n').filter((l) => l.length > 0);
      assert.strictEqual(out.length, 50);
      const seen = new Set(out);
      for (let i = 0; i < 50; i++) {
        assert.ok(seen.has(`line-${i}`), `missing line-${i}`);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('creates parent directories when missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-append-'));
    try {
      const storage = new FileStorageAdapter();
      const path = join(tmp, 'deep', 'nested', 'dir', 'log.txt');
      await storage.append(path, 'hello\n');
      const content = await readFile(path, 'utf8');
      assert.strictEqual(content, 'hello\n');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
