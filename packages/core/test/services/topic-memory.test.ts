import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  tokenizeSlug,
  bestAliasMatch,
  classifyByJaccard,
  buildAdjudicationPrompt,
  parseAdjudicationResponse,
  TopicMemoryService,
  COERCE_THRESHOLD,
  AMBIGUOUS_LOW_THRESHOLD,
  type TopicIdentity,
} from '../../src/services/topic-memory.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { renderTopicPage, type TopicPage } from '../../src/models/topic-page.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

describe('tokenizeSlug', () => {
  it('splits kebab-case into tokens', () => {
    assert.deepStrictEqual(tokenizeSlug('cover-whale-templates'), [
      'cover',
      'whale',
      'templates',
    ]);
  });

  it('lowercases and strips punctuation', () => {
    assert.deepStrictEqual(tokenizeSlug('Cover_Whale!'), ['coverwhale']);
  });

  it('handles empty slug', () => {
    assert.deepStrictEqual(tokenizeSlug(''), []);
  });
});

describe('bestAliasMatch', () => {
  const existing: TopicIdentity[] = [
    { canonical: 'cover-whale-templates', aliases: ['cw-templates'] },
    { canonical: 'leap-templates', aliases: [] },
    { canonical: 'signature-logic', aliases: ['email-signatures'] },
  ];

  it('returns score 1 for exact canonical match', () => {
    const r = bestAliasMatch('leap-templates', existing);
    assert.strictEqual(r.bestScore, 1);
    assert.strictEqual(r.matchedCanonical, 'leap-templates');
  });

  it('returns score 1 for exact alias match', () => {
    const r = bestAliasMatch('cw-templates', existing);
    assert.strictEqual(r.bestScore, 1);
    assert.strictEqual(r.matchedCanonical, 'cover-whale-templates');
    assert.strictEqual(r.matchedSurface, 'cw-templates');
  });

  it('returns high score for high-overlap variant', () => {
    const r = bestAliasMatch('cover-whale-email-templates', existing);
    // tokens: {cover,whale,email,templates} vs {cover,whale,templates} = 3/4 = 0.75
    assert.ok(r.bestScore >= 0.7);
    assert.strictEqual(r.matchedCanonical, 'cover-whale-templates');
  });

  it('returns low score for disjoint slug', () => {
    const r = bestAliasMatch('totally-unrelated-thing', existing);
    assert.ok(r.bestScore < 0.4);
  });

  it('returns score 0 when no existing topics', () => {
    const r = bestAliasMatch('anything', []);
    assert.strictEqual(r.bestScore, 0);
    assert.strictEqual(r.matchedCanonical, undefined);
  });

  it('returns score 0 for empty candidate', () => {
    const r = bestAliasMatch('', existing);
    assert.strictEqual(r.bestScore, 0);
  });
});

describe('classifyByJaccard', () => {
  const existing: TopicIdentity[] = [
    { canonical: 'cover-whale-templates', aliases: [] },
    { canonical: 'leap-templates', aliases: [] },
  ];

  it('coerces high-score candidate to existing slug', () => {
    const r = classifyByJaccard('cover-whale-email-templates', existing);
    // 3/4 = 0.75 — above COERCE_THRESHOLD (0.67)
    assert.strictEqual(r.decision, 'coerced');
    assert.strictEqual(r.resolved, 'cover-whale-templates');
  });

  it('returns ambiguous for mid-band score', () => {
    // 'leap' overlaps with 'leap-templates' at 1/2 = 0.5 — in band
    const r = classifyByJaccard('leap', existing);
    assert.strictEqual(r.decision, 'ambiguous-new');
    assert.ok(r.jaccardScore! >= AMBIGUOUS_LOW_THRESHOLD);
    assert.ok(r.jaccardScore! < COERCE_THRESHOLD);
  });

  it('returns new for low-score candidate', () => {
    const r = classifyByJaccard('weekly-standup', existing);
    assert.strictEqual(r.decision, 'new');
    assert.strictEqual(r.resolved, 'weekly-standup');
  });

  it('returns new with no existing topics', () => {
    const r = classifyByJaccard('anything', []);
    assert.strictEqual(r.decision, 'new');
    assert.strictEqual(r.resolved, 'anything');
  });

  it('exact match coerces (Jaccard 1.0)', () => {
    const r = classifyByJaccard('leap-templates', existing);
    assert.strictEqual(r.decision, 'coerced');
    assert.strictEqual(r.resolved, 'leap-templates');
  });
});

describe('buildAdjudicationPrompt', () => {
  const existing: TopicIdentity[] = [
    { canonical: 'cover-whale-templates', aliases: ['cw-templates'] },
    { canonical: 'leap-templates', aliases: [] },
  ];

  it('includes all existing topics and candidates', () => {
    const prompt = buildAdjudicationPrompt(
      [
        { input: 'leap', bestMatch: 'leap-templates' },
        { input: 'cw-v2', bestMatch: 'cover-whale-templates' },
      ],
      existing,
    );
    assert.match(prompt, /cover-whale-templates/);
    assert.match(prompt, /cw-templates/);
    assert.match(prompt, /leap-templates/);
    assert.match(prompt, /candidate="leap"/);
    assert.match(prompt, /candidate="cw-v2"/);
    assert.match(prompt, /"resolved": "<existing-slug-or-NEW>"/);
  });
});

describe('parseAdjudicationResponse', () => {
  const validSlugs = new Set(['cover-whale-templates', 'leap-templates', 'NEW']);

  it('parses well-formed JSON response', () => {
    const response = JSON.stringify({
      decisions: [
        { input: 'leap', resolved: 'leap-templates' },
        { input: 'totally-new-thing', resolved: 'NEW' },
      ],
    });
    const decisions = parseAdjudicationResponse(response, validSlugs);
    assert.strictEqual(decisions.get('leap'), 'leap-templates');
    assert.strictEqual(decisions.get('totally-new-thing'), 'NEW');
  });

  it('strips code fences', () => {
    const response = '```json\n{"decisions":[{"input":"a","resolved":"NEW"}]}\n```';
    const decisions = parseAdjudicationResponse(response, validSlugs);
    assert.strictEqual(decisions.get('a'), 'NEW');
  });

  it('rejects LLM-hallucinated slugs not in the allowed set', () => {
    const response = JSON.stringify({
      decisions: [
        { input: 'leap', resolved: 'hallucinated-slug-that-does-not-exist' },
      ],
    });
    const decisions = parseAdjudicationResponse(response, validSlugs);
    assert.strictEqual(decisions.has('leap'), false);
  });

  it('returns empty map for malformed JSON', () => {
    assert.strictEqual(parseAdjudicationResponse('not json', validSlugs).size, 0);
    assert.strictEqual(parseAdjudicationResponse('{"bogus":true}', validSlugs).size, 0);
    assert.strictEqual(parseAdjudicationResponse('', validSlugs).size, 0);
  });

  it('skips entries with non-string fields', () => {
    const response = JSON.stringify({
      decisions: [
        { input: 'a', resolved: 'NEW' },
        { input: 42, resolved: 'NEW' },
        { input: 'b', resolved: 99 },
      ],
    });
    const decisions = parseAdjudicationResponse(response, validSlugs);
    assert.strictEqual(decisions.size, 1);
    assert.strictEqual(decisions.get('a'), 'NEW');
  });
});

describe('TopicMemoryService.aliasAndMerge', () => {
  // Minimal storage stub — aliasAndMerge doesn't hit storage directly.
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

  const existing: TopicIdentity[] = [
    { canonical: 'cover-whale-templates', aliases: ['cw-templates'] },
    { canonical: 'leap-templates', aliases: [] },
  ];

  it('coerces high-score candidates without calling LLM', async () => {
    const svc = new TopicMemoryService(nullStorage);
    let llmCalled = false;
    const results = await svc.aliasAndMerge(
      ['cover-whale-email-templates', 'unrelated-topic'],
      existing,
      { callLLM: async () => { llmCalled = true; return ''; } },
    );
    assert.strictEqual(llmCalled, false);
    assert.strictEqual(results[0].decision, 'coerced');
    assert.strictEqual(results[0].resolved, 'cover-whale-templates');
    assert.strictEqual(results[1].decision, 'new');
  });

  it('calls LLM exactly once for ambiguous batch', async () => {
    const svc = new TopicMemoryService(nullStorage);
    let llmCalls = 0;
    await svc.aliasAndMerge(
      ['leap', 'whale'], // both ambiguous
      existing,
      {
        callLLM: async () => {
          llmCalls += 1;
          return JSON.stringify({ decisions: [] });
        },
      },
    );
    assert.strictEqual(llmCalls, 1);
  });

  it('applies LLM decisions to ambiguous candidates', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge(
      ['leap'],
      existing,
      {
        callLLM: async () =>
          JSON.stringify({
            decisions: [{ input: 'leap', resolved: 'leap-templates' }],
          }),
      },
    );
    assert.strictEqual(results[0].decision, 'ambiguous-resolved-existing');
    assert.strictEqual(results[0].resolved, 'leap-templates');
  });

  it('treats ambiguous as new when callLLM is absent', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge(['leap'], existing);
    assert.strictEqual(results[0].decision, 'ambiguous-new');
    assert.strictEqual(results[0].resolved, 'leap');
  });

  it('falls back to ambiguous-new when LLM throws', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge(
      ['leap'],
      existing,
      {
        callLLM: async () => {
          throw new Error('rate limit');
        },
      },
    );
    assert.strictEqual(results[0].decision, 'ambiguous-new');
    assert.strictEqual(results[0].resolved, 'leap');
  });

  it('is idempotent for identical inputs', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const callLLM = async () =>
      JSON.stringify({
        decisions: [{ input: 'leap', resolved: 'leap-templates' }],
      });
    const a = await svc.aliasAndMerge(['leap', 'cover-whale-email-templates'], existing, { callLLM });
    const b = await svc.aliasAndMerge(['leap', 'cover-whale-email-templates'], existing, { callLLM });
    assert.deepStrictEqual(a, b);
  });

  it('deduplicates repeated candidates', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge(
      ['leap-templates', 'leap-templates', 'leap-templates'],
      existing,
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].decision, 'coerced');
  });

  it('handles empty candidate list', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge([], existing);
    assert.deepStrictEqual(results, []);
  });

  it('handles empty existing list (all candidates are new)', async () => {
    const svc = new TopicMemoryService(nullStorage);
    const results = await svc.aliasAndMerge(['alpha', 'beta'], []);
    assert.strictEqual(results[0].decision, 'new');
    assert.strictEqual(results[1].decision, 'new');
  });
});

describe('TopicMemoryService.toIdentities', () => {
  it('derives identity surface from parsed topic pages', () => {
    const topics = [
      {
        frontmatter: {
          topic_slug: 'cover-whale-templates',
          aliases: ['cw-templates'],
          status: 'active' as const,
          first_seen: '2026-03-01',
          last_refreshed: '2026-04-22',
          sources_integrated: [],
        },
        sections: {},
      },
      {
        frontmatter: {
          topic_slug: 'leap-templates',
          status: 'active' as const,
          first_seen: '2026-03-15',
          last_refreshed: '2026-04-20',
          sources_integrated: [],
        },
        sections: {},
      },
    ];
    const identities = TopicMemoryService.toIdentities(topics);
    assert.strictEqual(identities[0].canonical, 'cover-whale-templates');
    assert.deepStrictEqual(identities[0].aliases, ['cw-templates']);
    assert.deepStrictEqual(identities[1].aliases, []);
    // lastRefreshed populated from frontmatter for the recency tiebreaker
    // used by detectTopicsLexical.
    assert.strictEqual(identities[0].lastRefreshed, '2026-04-22');
    assert.strictEqual(identities[1].lastRefreshed, '2026-04-20');
  });
});

// ---------------------------------------------------------------------------
// Mixed-source refreshAllFromSources test (Task 2 of slack-digest-topic-wiki).
//
// Verifies that a topic page's `sources_integrated` is updated by BOTH a
// meeting source and a slack-digest source in one refresh call, in date
// order. Uses `callLLM: undefined` so each source flows through the
// 'fallback' path — that path still appends to `sources_integrated`,
// which is the invariant we care about here. AI-mocked LLM-driven
// integration is exercised by the CLI integration test in Task 6.
// ---------------------------------------------------------------------------

function makePathsForRefresh(root: string): WorkspacePaths {
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

function writeFileForRefresh(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

describe('TopicMemoryService.refreshAllFromSources (mixed sources)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let storage: FileStorageAdapter;

  const MEETING_FIXTURE = `---
title: "Cover Whale sync"
date: 2026-04-20
attendees:
  - { name: "Jane Doe", email: "jane@reserv.com" }
topics: [cover-whale-templates]
---

# Cover Whale sync

## Transcript

Discussed the cover-whale-templates rollout. Decided to ship v2 by EOM.
`;

  const SLACK_DIGEST_FIXTURE = `---
title: "Slack Digest — 2026-04-28"
date: 2026-04-28
type: slack-digest
conversations: 1
participants: [person-a]
items_extracted: 1
items_approved: 1
tasks_updated: 0
commitments_resolved: 0
commitments_added: 0
areas: [reserv]
topics: [cover-whale-templates]
---

# Slack Digest — 2026-04-28

## Conversations

### 1. DM with Person A
Confirmed cover-whale-templates v2 timing and scope.
- Topics: cover-whale-templates
`;

  const SEED_TOPIC_PAGE: TopicPage = {
    frontmatter: {
      topic_slug: 'cover-whale-templates',
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-15',
      sources_integrated: [],
    },
    sections: {
      'Current state': 'Templates are in pilot.',
    },
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'refresh-mixed-'));
    paths = makePathsForRefresh(tmpDir);
    storage = new FileStorageAdapter();

    // Seed the existing topic page.
    writeFileForRefresh(
      tmpDir,
      '.arete/memory/topics/cover-whale-templates.md',
      renderTopicPage(SEED_TOPIC_PAGE),
    );
    // Seed both source classes tagged with the same slug.
    writeFileForRefresh(tmpDir, 'resources/meetings/2026-04-20-cw-sync.md', MEETING_FIXTURE);
    writeFileForRefresh(
      tmpDir,
      'resources/notes/2026-04-28-slack-digest.md',
      SLACK_DIGEST_FIXTURE,
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('integrates both meeting + slack-digest into a topic page in date order', async () => {
    const svc = new TopicMemoryService(storage);

    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['cover-whale-templates'],
      // No callLLM → integrateSource returns 'fallback' for each source,
      // which still updates sources_integrated and Source trail / Change log.
      skipLock: true,
    });

    assert.strictEqual(result.topics.length, 1);
    const topic = result.topics[0];
    assert.strictEqual(topic.slug, 'cover-whale-templates');
    assert.strictEqual(topic.status, 'ok');
    // 2 sources, each fallback (no LLM), 0 skipped, 0 integrated.
    assert.strictEqual(topic.fallback, 2);
    assert.strictEqual(topic.integrated, 0);
    assert.strictEqual(topic.skipped, 0);

    // Re-read the written page and assert sources_integrated has both.
    const writtenPath = join(tmpDir, '.arete/memory/topics/cover-whale-templates.md');
    const written = await storage.read(writtenPath);
    assert.notStrictEqual(written, null);
    const { parseTopicPage } = await import('../../src/models/topic-page.js');
    const parsed = parseTopicPage(written!);
    assert.notStrictEqual(parsed, null);
    const sources = parsed!.frontmatter.sources_integrated;
    assert.strictEqual(sources.length, 2, 'both sources integrated');
    // Date asc — meeting first (4-20), digest second (4-28).
    assert.strictEqual(sources[0].date, '2026-04-20');
    assert.match(sources[0].path, /resources\/meetings\/2026-04-20-cw-sync\.md$/);
    assert.strictEqual(sources[1].date, '2026-04-28');
    assert.match(sources[1].path, /resources\/notes\/2026-04-28-slack-digest\.md$/);
  });

  it('is idempotent on a re-run (content-hash dedup applies to slack-digests too)', async () => {
    const svc = new TopicMemoryService(storage);

    await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['cover-whale-templates'],
      skipLock: true,
    });
    const second = await svc.refreshAllFromSources(paths, {
      today: '2026-04-30',
      slugs: ['cover-whale-templates'],
      skipLock: true,
    });

    // Re-run: both sources should be skipped-already-integrated.
    assert.strictEqual(second.topics[0].skipped, 2);
    assert.strictEqual(second.topics[0].fallback, 0);
    assert.strictEqual(second.topics[0].integrated, 0);
  });
});
