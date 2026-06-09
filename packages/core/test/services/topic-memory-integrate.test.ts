import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntegrateResponse,
  applyIntegrateOutput,
  applyFallbackUpdate,
  createTopicStub,
  buildIntegratePrompt,
  hashSource,
  hashMeetingSource,
  TopicMemoryService,
  resolveIntegrationLlmTimeoutMs,
  DEFAULT_INTEGRATION_LLM_TIMEOUT_MS,
} from '../../src/services/topic-memory.js';
import type { TopicPage, TopicSourceRef } from '../../src/models/topic-page.js';

const TODAY = '2026-04-22';

function samplePage(): TopicPage {
  return {
    frontmatter: {
      topic_slug: 'cover-whale-templates',
      status: 'active',
      first_seen: '2026-03-02',
      last_refreshed: '2026-04-15',
      sources_integrated: [
        { path: 'resources/meetings/old.md', date: '2026-03-02', hash: 'oldhash00000000' },
      ],
    },
    sections: {
      'Current state': 'Staging-validated, awaiting pilot adjusters.',
      'Change log': '- 2026-04-15: reimport validated',
    },
  };
}

function sourceRef(overrides: Partial<TopicSourceRef> = {}): TopicSourceRef {
  return {
    path: 'resources/meetings/2026-04-22-new.md',
    date: '2026-04-22',
    hash: 'newhash11111111',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseIntegrateResponse
// ---------------------------------------------------------------------------

describe('parseIntegrateResponse', () => {
  it('parses well-formed response with all fields', () => {
    const response = JSON.stringify({
      updated_sections: { 'Current state': 'New status' },
      new_change_log_entry: 'Pilot adjusters identified.',
      new_open_questions: ['Will LEAP follow CW pattern?'],
      new_known_gaps: ['No staging data for Tier 2 accounts'],
    });
    const parsed = parseIntegrateResponse(response);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.updated_sections['Current state'], 'New status');
    assert.strictEqual(parsed.new_change_log_entry, 'Pilot adjusters identified.');
    assert.deepStrictEqual(parsed.new_open_questions, ['Will LEAP follow CW pattern?']);
  });

  it('strips code fences', () => {
    const response = '```json\n{"updated_sections":{},"new_change_log_entry":"x"}\n```';
    const parsed = parseIntegrateResponse(response);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.new_change_log_entry, 'x');
  });

  it('rejects response without new_change_log_entry', () => {
    const response = JSON.stringify({ updated_sections: { 'Current state': 'x' } });
    assert.strictEqual(parseIntegrateResponse(response), null);
  });

  it('rejects empty new_change_log_entry', () => {
    const response = JSON.stringify({
      updated_sections: {},
      new_change_log_entry: '   ',
    });
    assert.strictEqual(parseIntegrateResponse(response), null);
  });

  it('drops unknown section keys (Risk 4: enum validation)', () => {
    const response = JSON.stringify({
      updated_sections: {
        'Current state': 'ok',
        'Bogus Section': 'sneaky',
      },
      new_change_log_entry: 'x',
    });
    const parsed = parseIntegrateResponse(response);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.updated_sections['Current state'], 'ok');
    assert.strictEqual(
      // @ts-expect-error — key not in SectionName
      parsed.updated_sections['Bogus Section'],
      undefined,
    );
  });

  it('rejects sections containing raw frontmatter separator', () => {
    const response = JSON.stringify({
      updated_sections: { 'Current state': 'text\n---\nbad' },
      new_change_log_entry: 'x',
    });
    const parsed = parseIntegrateResponse(response);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.updated_sections['Current state'], undefined);
  });

  it('rejects sections exceeding length cap (Risk 4: LLM page-echo)', () => {
    const response = JSON.stringify({
      updated_sections: { 'Current state': 'x'.repeat(10000) },
      new_change_log_entry: 'x',
    });
    const parsed = parseIntegrateResponse(response);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.updated_sections['Current state'], undefined);
  });

  it('returns null for malformed JSON', () => {
    assert.strictEqual(parseIntegrateResponse('not json'), null);
    assert.strictEqual(parseIntegrateResponse('[1,2,3]'), null);
    assert.strictEqual(parseIntegrateResponse(''), null);
  });
});

// ---------------------------------------------------------------------------
// applyIntegrateOutput
// ---------------------------------------------------------------------------

describe('applyIntegrateOutput', () => {
  it('overwrites updated sections; preserves untouched ones', () => {
    const page = samplePage();
    const updated = applyIntegrateOutput(
      page,
      {
        updated_sections: { 'Current state': 'Production.' },
        new_change_log_entry: 'Promoted to prod.',
      },
      sourceRef(),
      TODAY,
    );
    assert.strictEqual(updated.sections['Current state'], 'Production.');
  });

  it('prepends change log (newest at top)', () => {
    const page = samplePage();
    const updated = applyIntegrateOutput(
      page,
      {
        updated_sections: {},
        new_change_log_entry: 'Promoted to prod.',
      },
      sourceRef(),
      TODAY,
    );
    const log = updated.sections['Change log']!;
    assert.ok(log.startsWith(`- ${TODAY}: Promoted to prod.`));
    assert.ok(log.includes('- 2026-04-15: reimport validated'));
  });

  it('appends new open questions without duplicating existing ones', () => {
    const page: TopicPage = {
      ...samplePage(),
      sections: {
        ...samplePage().sections,
        'Open questions': '- [ ] Existing question',
      },
    };
    const updated = applyIntegrateOutput(
      page,
      {
        updated_sections: {},
        new_change_log_entry: 'x',
        new_open_questions: ['Existing question', 'Fresh question'],
      },
      sourceRef(),
      TODAY,
    );
    const oq = updated.sections['Open questions']!;
    // Existing line kept; only the truly-new one added
    assert.ok(oq.includes('- [ ] Existing question'));
    assert.ok(oq.includes('- [ ] Fresh question'));
    assert.strictEqual((oq.match(/Existing question/g) ?? []).length, 1);
  });

  it('appends source to sources_integrated', () => {
    const page = samplePage();
    const src = sourceRef();
    const updated = applyIntegrateOutput(
      page,
      { updated_sections: {}, new_change_log_entry: 'x' },
      src,
      TODAY,
    );
    assert.strictEqual(updated.frontmatter.sources_integrated.length, 2);
    assert.strictEqual(updated.frontmatter.sources_integrated[1].hash, src.hash);
  });

  it('bumps last_refreshed', () => {
    const page = samplePage();
    const updated = applyIntegrateOutput(
      page,
      { updated_sections: {}, new_change_log_entry: 'x' },
      sourceRef(),
      TODAY,
    );
    assert.strictEqual(updated.frontmatter.last_refreshed, TODAY);
  });

  it('does not duplicate source when hash already present', () => {
    const page = samplePage();
    const src = sourceRef({ hash: 'oldhash00000000' }); // same as existing
    const updated = applyIntegrateOutput(
      page,
      { updated_sections: {}, new_change_log_entry: 'x' },
      src,
      TODAY,
    );
    assert.strictEqual(updated.frontmatter.sources_integrated.length, 1);
  });
});

// ---------------------------------------------------------------------------
// applyFallbackUpdate
// ---------------------------------------------------------------------------

describe('applyFallbackUpdate', () => {
  it('writes Source trail + Change log entry without synthesizing narrative', () => {
    const page = samplePage();
    const src = sourceRef();
    const updated = applyFallbackUpdate(page, src, TODAY, 'no-llm');
    assert.match(updated.sections['Source trail']!, /2026-04-22-new/);
    assert.match(updated.sections['Change log']!, /no narrative: no-llm/);
    // Current state untouched (narrative sections stay stable in fallback)
    assert.strictEqual(updated.sections['Current state'], page.sections['Current state']);
  });

  it('de-dupes trail lines', () => {
    const page = samplePage();
    const src = sourceRef();
    const once = applyFallbackUpdate(page, src, TODAY, 'x');
    const twice = applyFallbackUpdate(once, src, TODAY, 'x');
    const trail = twice.sections['Source trail']!;
    const lines = trail.split('\n').filter((l) => l.includes('2026-04-22-new'));
    assert.strictEqual(lines.length, 1);
  });
});

// ---------------------------------------------------------------------------
// createTopicStub
// ---------------------------------------------------------------------------

describe('createTopicStub', () => {
  it('creates minimal valid page with status=new', () => {
    const stub = createTopicStub('new-topic', TODAY);
    assert.strictEqual(stub.frontmatter.topic_slug, 'new-topic');
    assert.strictEqual(stub.frontmatter.status, 'new');
    assert.strictEqual(stub.frontmatter.first_seen, TODAY);
    assert.strictEqual(stub.frontmatter.last_refreshed, TODAY);
    assert.deepStrictEqual(stub.frontmatter.sources_integrated, []);
    assert.deepStrictEqual(stub.sections, {});
  });

  it('includes area and aliases when provided', () => {
    const stub = createTopicStub('new-topic', TODAY, {
      area: 'glance-comms',
      aliases: ['new-thing'],
    });
    assert.strictEqual(stub.frontmatter.area, 'glance-comms');
    assert.deepStrictEqual(stub.frontmatter.aliases, ['new-thing']);
  });
});

// ---------------------------------------------------------------------------
// buildIntegratePrompt
// ---------------------------------------------------------------------------

describe('buildIntegratePrompt', () => {
  it('marks first-source case when existingPage is null', () => {
    const prompt = buildIntegratePrompt(
      'my-topic',
      null,
      { path: 'a.md', date: '2026-04-22', content: 'body' },
      '',
    );
    assert.match(prompt, /no existing page/);
    assert.match(prompt, /body/);
  });

  it('includes existing page when provided', () => {
    const prompt = buildIntegratePrompt(
      'cover-whale-templates',
      samplePage(),
      { path: 'a.md', date: '2026-04-22', content: 'transcript' },
      'decisions block',
    );
    assert.match(prompt, /Staging-validated/);
    assert.match(prompt, /transcript/);
    assert.match(prompt, /decisions block/);
  });
});

// ---------------------------------------------------------------------------
// hashSource
// ---------------------------------------------------------------------------

describe('hashSource', () => {
  it('is deterministic for equal content', () => {
    assert.strictEqual(hashSource('hello'), hashSource('hello'));
  });

  it('differs for different content', () => {
    assert.notStrictEqual(hashSource('a'), hashSource('b'));
  });

  it('returns 16-char hex', () => {
    assert.match(hashSource('any'), /^[0-9a-f]{16}$/);
  });
});

describe('hashMeetingSource', () => {
  const bodyA = 'Real meeting body content here.\n\nMore notes.\n';

  it('hashes body only — frontmatter edits do NOT change the hash', () => {
    const v1 = [
      '---',
      'title: "Original"',
      'date: 2026-04-22',
      'attendees: []',
      '---',
      '',
      bodyA,
    ].join('\n');

    const v2 = [
      '---',
      'title: "Original"',
      'date: 2026-04-22',
      'attendees:',
      '  - new.person@x.com',
      'processed_at: 2026-04-23T09:15:00Z',
      'status: approved',
      '---',
      '',
      bodyA,
    ].join('\n');

    assert.strictEqual(
      hashMeetingSource(v1),
      hashMeetingSource(v2),
      'frontmatter edits must not bust dedup when body is identical',
    );
  });

  it('hash CHANGES when body changes', () => {
    const v1 = `---\ntitle: x\n---\n\n${bodyA}`;
    const v2 = `---\ntitle: x\n---\n\n${bodyA}\nAdded a line to body.`;
    assert.notStrictEqual(hashMeetingSource(v1), hashMeetingSource(v2));
  });

  it('falls back to hashing full content when no frontmatter block', () => {
    // Body-only string (legacy or non-meeting content)
    const raw = 'just body with no frontmatter';
    assert.strictEqual(hashMeetingSource(raw), hashSource(raw));
  });

  it('returns 16-char hex', () => {
    assert.match(hashMeetingSource('---\ntitle: x\n---\n\nbody'), /^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// TopicMemoryService.integrateSource (end-to-end)
// ---------------------------------------------------------------------------

describe('TopicMemoryService.listTopicMemoryStatus', () => {
  function makeStorage(files: Record<string, string> = {}) {
    const store = new Map(Object.entries(files));
    return {
      store,
      async read(p: string) { return store.get(p) ?? null; },
      async write(p: string, c: string) { store.set(p, c); },
      async exists(p: string) {
        if (store.has(p)) return true;
        for (const k of store.keys()) if (k.startsWith(p + '/')) return true;
        return false;
      },
      async delete() {},
      async list(dir: string) {
        const prefix = dir.endsWith('/') ? dir : dir + '/';
        const results: string[] = [];
        for (const k of store.keys()) {
          if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) results.push(k);
        }
        return results;
      },
      async listSubdirectories() { return []; },
      async mkdir() {},
      async getModified() { return null; },
    };
  }

  function topicFile(slug: string, lastRefreshed: string, currentState: string | null, refs: string[] = []): string {
    const parts: string[] = [
      '---',
      `topic_slug: ${slug}`,
      'status: active',
      'first_seen: 2026-03-01',
      `last_refreshed: ${lastRefreshed}`,
      'sources_integrated: []',
      '---',
      '',
      `# ${slug}`,
      '',
    ];
    if (currentState !== null) {
      parts.push('## Current state', '', currentState, '');
    }
    if (refs.length > 0) {
      parts.push('## Relationships', '');
      for (const r of refs) parts.push(`- See [[${r}]]`);
    }
    return parts.join('\n');
  }

  const paths = {
    memory: '/.arete/memory',
  } as import('../../src/models/workspace.js').WorkspacePaths;

  it('flags stale topics (>60d)', async () => {
    const today = new Date('2026-04-22T00:00:00Z');
    const storage = makeStorage({
      '/.arete/memory/topics/old.md': topicFile('old', '2025-12-01', 'content'),
      '/.arete/memory/topics/fresh.md': topicFile('fresh', '2026-04-20', 'content'),
    });
    const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
    const svc = new TopicMemoryService(storage);
    const out = await svc.listTopicMemoryStatus(paths, { today });
    const oldEntry = out.find((s) => s.slug === 'old')!;
    const freshEntry = out.find((s) => s.slug === 'fresh')!;
    assert.strictEqual(oldEntry.stale, true);
    assert.strictEqual(freshEntry.stale, false);
  });

  it('flags stub topics (no Current state)', async () => {
    const today = new Date('2026-04-22T00:00:00Z');
    const storage = makeStorage({
      '/.arete/memory/topics/stub-topic.md': topicFile('stub-topic', '2026-04-22', null),
    });
    const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
    const svc = new TopicMemoryService(storage);
    const out = await svc.listTopicMemoryStatus(paths, { today });
    assert.strictEqual(out[0].stub, true);
  });

  it('flags orphan topics (no inbound [[refs]])', async () => {
    const today = new Date('2026-04-22T00:00:00Z');
    const storage = makeStorage({
      '/.arete/memory/topics/referenced.md': topicFile('referenced', '2026-04-22', 'hi'),
      '/.arete/memory/topics/a.md': topicFile('a', '2026-04-22', 'hi', ['referenced']),
      '/.arete/memory/topics/orphaned.md': topicFile('orphaned', '2026-04-22', 'hi'),
    });
    const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
    const svc = new TopicMemoryService(storage);
    const out = await svc.listTopicMemoryStatus(paths, { today });
    const referenced = out.find((s) => s.slug === 'referenced')!;
    const orphan = out.find((s) => s.slug === 'orphaned')!;
    assert.strictEqual(referenced.orphan, false);
    assert.strictEqual(orphan.orphan, true);
  });

  it('self-refs do not count as inbound (orphan still flagged)', async () => {
    const today = new Date('2026-04-22T00:00:00Z');
    const storage = makeStorage({
      '/.arete/memory/topics/self.md': topicFile('self', '2026-04-22', 'hi', ['self']),
    });
    const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
    const svc = new TopicMemoryService(storage);
    const out = await svc.listTopicMemoryStatus(paths, { today });
    assert.strictEqual(out[0].orphan, true);
  });

  it('returns empty array when no topics exist', async () => {
    const storage = makeStorage();
    const { TopicMemoryService } = await import('../../src/services/topic-memory.js');
    const svc = new TopicMemoryService(storage);
    const out = await svc.listTopicMemoryStatus(paths);
    assert.deepStrictEqual(out, []);
  });
});

describe('TopicMemoryService.integrateSource', () => {
  const nullStorage = {
    read: async () => null,
    write: async () => {},
    exists: async () => false,
    delete: async () => {},
    list: async () => [],
    listSubdirectories: async () => [],
    mkdir: async () => {},
    getModified: async () => null,
  };

  it('no-ops (skipped-already-integrated) when hash already present', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const page = samplePage();
    const existingHash = page.frontmatter.sources_integrated[0].hash;
    const source = { path: 'old.md', date: '2026-03-02', content: 'whatever' };
    // Override the computed hash to match existing for this test via a tiny wrapper —
    // easier: seed a new page whose existing source hash matches what hashSource() returns.
    const matchingContent = 'fixed-content-for-hash';
    const expectedHash = '';  // placeholder; compute below
    const result = await svc.integrateSource(
      'cover-whale-templates',
      {
        ...page,
        frontmatter: {
          ...page.frontmatter,
          sources_integrated: [
            { path: 'seed.md', date: '2026-03-02', hash: hashSource(matchingContent) },
          ],
        },
      },
      { path: 'seed.md', date: '2026-03-02', content: matchingContent },
      { today: TODAY, callLLM: async () => { throw new Error('should not be called'); } },
    );
    assert.strictEqual(result.decision, 'skipped-already-integrated');
    // Silence unused-var lints
    void existingHash; void source; void expectedHash;
  });

  it('falls back when callLLM missing', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const page = samplePage();
    const result = await svc.integrateSource(
      'cover-whale-templates',
      page,
      { path: 'resources/meetings/fresh.md', date: '2026-04-22', content: 'fresh content' },
      { today: TODAY },
    );
    assert.strictEqual(result.decision, 'fallback');
    assert.strictEqual(result.reason, 'no-llm');
    assert.strictEqual(result.page.frontmatter.sources_integrated.length, 2);
  });

  it('falls back on malformed LLM output', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/f.md', date: '2026-04-22', content: 'body' },
      {
        today: TODAY,
        callLLM: async () => 'not json at all',
      },
    );
    assert.strictEqual(result.decision, 'fallback');
    assert.strictEqual(result.reason, 'malformed-output');
  });

  it('falls back on LLM throw', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/f.md', date: '2026-04-22', content: 'body' },
      {
        today: TODAY,
        callLLM: async () => {
          throw new Error('rate limit');
        },
      },
    );
    assert.strictEqual(result.decision, 'fallback');
    assert.strictEqual(result.reason, 'llm-error');
  });

  it('integrates successfully on well-formed LLM output', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/f.md', date: '2026-04-22', content: 'CW went live' },
      {
        today: TODAY,
        callLLM: async () =>
          JSON.stringify({
            updated_sections: { 'Current state': 'Live in production.' },
            new_change_log_entry: 'Promoted to production.',
          }),
      },
    );
    assert.strictEqual(result.decision, 'integrated');
    assert.strictEqual(result.page.sections['Current state'], 'Live in production.');
    assert.match(result.page.sections['Change log']!, /Promoted to production/);
  });

  it('creates stub when existingPage is null', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const result = await svc.integrateSource(
      'fresh-topic',
      null,
      { path: 'resources/meetings/f.md', date: '2026-04-22', content: 'first mention' },
      {
        today: TODAY,
        callLLM: async () =>
          JSON.stringify({
            updated_sections: { 'Current state': 'Just emerged.' },
            new_change_log_entry: 'First source.',
          }),
      },
    );
    assert.strictEqual(result.decision, 'integrated');
    assert.strictEqual(result.page.frontmatter.topic_slug, 'fresh-topic');
    assert.strictEqual(result.page.frontmatter.status, 'new');
    assert.strictEqual(result.page.frontmatter.first_seen, TODAY);
  });

  it('is idempotent for re-running on identical source content', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const content = 'same content';
    const callLLM = async () =>
      JSON.stringify({
        updated_sections: { 'Current state': 'x' },
        new_change_log_entry: 'x',
      });
    const first = await svc.integrateSource(
      'topic',
      null,
      { path: 'a.md', date: '2026-04-22', content },
      { today: TODAY, callLLM },
    );
    // Re-run on the output page — source hash should match, skip
    const second = await svc.integrateSource(
      'topic',
      first.page,
      { path: 'a.md', date: '2026-04-22', content },
      { today: TODAY, callLLM: async () => { throw new Error('should not call'); } },
    );
    assert.strictEqual(second.decision, 'skipped-already-integrated');
  });

  // Phase 1 §c — llmContent override (summary-first integration)
  it('llmContent overrides newSource.content in the LLM prompt', async () => {
    const svc = new TopicMemoryService(nullStorage);
    let promptSeen = '';
    const callLLM = async (prompt: string) => {
      promptSeen = prompt;
      return JSON.stringify({
        updated_sections: { 'Current state': 'updated via summary' },
        new_change_log_entry: 'integrated summary input',
      });
    };
    await svc.integrateSource(
      'topic',
      samplePage(),
      { path: 'resources/meetings/f.md', date: '2026-04-22', content: 'RAW TRANSCRIPT' },
      {
        today: TODAY,
        callLLM,
        llmContent: 'CURATED SUMMARY BODY',
      },
    );
    assert.match(promptSeen, /CURATED SUMMARY BODY/);
    assert.doesNotMatch(promptSeen, /RAW TRANSCRIPT/);
  });

  it('llmContent does NOT change the idempotency hash (uses newSource.content)', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const content = 'transcript-body';
    const callLLM = async () =>
      JSON.stringify({
        updated_sections: { 'Current state': 'x' },
        new_change_log_entry: 'x',
      });
    // First integration — uses transcript content for the hash, summary
    // body for the LLM input.
    const first = await svc.integrateSource(
      'topic',
      null,
      { path: 'resources/meetings/a.md', date: '2026-04-22', content },
      { today: TODAY, callLLM, llmContent: 'summary v1' },
    );
    // Second integration — different summary body but same transcript.
    // Should still match the hash → skipped.
    const second = await svc.integrateSource(
      'topic',
      first.page,
      { path: 'resources/meetings/a.md', date: '2026-04-22', content },
      {
        today: TODAY,
        callLLM: async () => {
          throw new Error('should not call when hash matches');
        },
        llmContent: 'summary v2 (rewritten)',
      },
    );
    assert.strictEqual(second.decision, 'skipped-already-integrated');
  });
});

// ---------------------------------------------------------------------------
// integrateSource LLM timeout + one retry (wiki-repair T5)
// ---------------------------------------------------------------------------

describe('integrateSource LLM timeout (wiki-repair T5)', () => {
  const nullStorage = {
    read: async () => null,
    write: async () => {},
    exists: async () => false,
    delete: async () => {},
    list: async () => [],
    listSubdirectories: async () => [],
    mkdir: async () => {},
    getModified: async () => null,
  };

  const VALID_RESPONSE = JSON.stringify({
    updated_sections: { 'Current state': 'Updated by test' },
    new_change_log_entry: 'Integrated test source.',
  });

  /** A wedged LLM call: never settles unless its signal aborts. */
  function wedgedCall(calls: { count: number; aborted: number }) {
    return (_prompt: string, opts?: { signal?: AbortSignal }) => {
      calls.count += 1;
      return new Promise<string>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          calls.aborted += 1;
          reject(new Error('aborted by signal'));
        });
      });
    };
  }

  it('fails forward to fallback after timeout + ONE retry (the live-wedge shape)', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const calls = { count: 0, aborted: 0 };
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/2026-06-09-new.md', date: '2026-06-09', content: 'fresh content' },
      { today: TODAY, callLLM: wedgedCall(calls), llmTimeoutMs: 40 },
    );
    // Run continued (fails forward) instead of freezing.
    assert.strictEqual(result.decision, 'fallback');
    assert.strictEqual(result.reason, 'llm-error');
    // Initial call + exactly ONE retry; both aborted.
    assert.strictEqual(calls.count, 2);
    assert.strictEqual(calls.aborted, 2);
    // The fallback trail records the timeout cause.
    const trail = result.page.sections['Source trail'] ?? '';
    const changeLog = result.page.sections['Change log'] ?? '';
    assert.match(`${trail}\n${changeLog}`, /timed out/);
  });

  it('retry succeeds: first attempt wedges, second integrates', async () => {
    const svc = new TopicMemoryService(nullStorage);
    let attempt = 0;
    const callLLM = (_prompt: string, opts?: { signal?: AbortSignal }) => {
      attempt += 1;
      if (attempt === 1) {
        return new Promise<string>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return Promise.resolve(VALID_RESPONSE);
    };
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/2026-06-09-new.md', date: '2026-06-09', content: 'fresh content' },
      { today: TODAY, callLLM, llmTimeoutMs: 40 },
    );
    assert.strictEqual(result.decision, 'integrated');
    assert.strictEqual(attempt, 2);
    assert.strictEqual(result.page.sections['Current state'], 'Updated by test');
  });

  it('non-timeout LLM errors are NOT retried (existing fallback semantics)', async () => {
    const svc = new TopicMemoryService(nullStorage);
    let count = 0;
    const callLLM = async () => {
      count += 1;
      throw new Error('HTTP 500');
    };
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/2026-06-09-new.md', date: '2026-06-09', content: 'fresh content' },
      { today: TODAY, callLLM, llmTimeoutMs: 5000 },
    );
    assert.strictEqual(result.decision, 'fallback');
    assert.strictEqual(result.reason, 'llm-error');
    assert.strictEqual(count, 1);
  });

  it('fast successful calls are unaffected by the timeout wrapper', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const result = await svc.integrateSource(
      'cover-whale-templates',
      samplePage(),
      { path: 'resources/meetings/2026-06-09-new.md', date: '2026-06-09', content: 'fresh content' },
      { today: TODAY, callLLM: async () => VALID_RESPONSE },
    );
    assert.strictEqual(result.decision, 'integrated');
  });
});

describe('resolveIntegrationLlmTimeoutMs', () => {
  it('explicit override wins over env and default', () => {
    process.env.ARETE_LLM_TIMEOUT_MS = '5000';
    try {
      assert.strictEqual(resolveIntegrationLlmTimeoutMs(250), 250);
    } finally {
      delete process.env.ARETE_LLM_TIMEOUT_MS;
    }
  });

  it('env var applies when no explicit override', () => {
    process.env.ARETE_LLM_TIMEOUT_MS = '5000';
    try {
      assert.strictEqual(resolveIntegrationLlmTimeoutMs(), 5000);
    } finally {
      delete process.env.ARETE_LLM_TIMEOUT_MS;
    }
  });

  it('invalid env / explicit values fall through to the 120s default', () => {
    process.env.ARETE_LLM_TIMEOUT_MS = 'not-a-number';
    try {
      assert.strictEqual(resolveIntegrationLlmTimeoutMs(), DEFAULT_INTEGRATION_LLM_TIMEOUT_MS);
      assert.strictEqual(resolveIntegrationLlmTimeoutMs(-5), DEFAULT_INTEGRATION_LLM_TIMEOUT_MS);
    } finally {
      delete process.env.ARETE_LLM_TIMEOUT_MS;
    }
    assert.strictEqual(DEFAULT_INTEGRATION_LLM_TIMEOUT_MS, 120_000);
  });
});
