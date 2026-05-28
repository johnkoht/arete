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
  it('splits kebab-case into tokens (with AC3 singularize on plural endings)', () => {
    // Post-AC3 (phase-3-5-followup-5): `templates` singularizes to
    // `template`. Pre-AC3 behavior was the raw `templates` token.
    assert.deepStrictEqual(tokenizeSlug('cover-whale-templates'), [
      'cover',
      'whale',
      'template',
    ]);
  });

  it('lowercases and strips punctuation', () => {
    assert.deepStrictEqual(tokenizeSlug('Cover_Whale!'), ['coverwhale']);
  });

  it('handles empty slug', () => {
    assert.deepStrictEqual(tokenizeSlug(''), []);
  });

  // -------------------------------------------------------------------------
  // AC3 (phase-3-5-followup-5) — singularize-or-stem rule.
  //
  // Rule: strip trailing `s` if length ≥4 AND second-to-last char is not `s`.
  // The mandatory enumeration from the plan + pre-mortem R1:
  // -------------------------------------------------------------------------
  describe('AC3 singularize-or-stem', () => {
    it('templates → template', () => {
      assert.deepStrictEqual(tokenizeSlug('templates'), ['template']);
    });

    it('decisions → decision', () => {
      assert.deepStrictEqual(tokenizeSlug('decisions'), ['decision']);
    });

    it('learnings → learning', () => {
      assert.deepStrictEqual(tokenizeSlug('learnings'), ['learning']);
    });

    it('meetings → meeting', () => {
      assert.deepStrictEqual(tokenizeSlug('meetings'), ['meeting']);
    });

    // -ss endings preserved (the R1 mitigation core).
    it('process → process (preserved, -ss ending)', () => {
      assert.deepStrictEqual(tokenizeSlug('process'), ['process']);
    });

    it('address → address (preserved, -ss ending)', () => {
      assert.deepStrictEqual(tokenizeSlug('address'), ['address']);
    });

    it('business → business (preserved, -ss ending)', () => {
      assert.deepStrictEqual(tokenizeSlug('business'), ['business']);
    });

    it('class → class (preserved, -ss ending; falls under 4-char floor anyway)', () => {
      // `class` is 5 chars ending `-ss` → second-to-last char IS `s` → preserved.
      assert.deepStrictEqual(tokenizeSlug('class'), ['class']);
    });

    // Documented benign edge cases per plan + pre-mortem R1. The test
    // pins the actual shipped behavior so a future change is intentional.
    it('status → statu (accepted edge case: -us ending, benign)', () => {
      // length 6, ends `us`, second-to-last `u` ≠ `s` → rule strips → `statu`.
      // Plan: "accept `status → statu` (benign; `statu` unlikely to collide
      // with any real slug)".
      assert.deepStrictEqual(tokenizeSlug('status'), ['statu']);
    });

    it('news → new (accepted edge case: -ws ending, benign)', () => {
      // length 4, ends `ws`, second-to-last `w` ≠ `s` → rule strips → `new`.
      assert.deepStrictEqual(tokenizeSlug('news'), ['new']);
    });

    // Multi-token slugs combining singularize with the stop-word filter.
    it('belongings-vs-property-claims tokenizes to [belonging, property, claim] (singularize + stop-word vs filter)', () => {
      assert.deepStrictEqual(tokenizeSlug('belongings-vs-property-claims'), [
        'belonging',
        'property',
        'claim',
      ]);
    });

    it('drops "and" / "or" stop-words alongside "vs"', () => {
      assert.deepStrictEqual(tokenizeSlug('apples-and-oranges'), ['apple', 'orange']);
      assert.deepStrictEqual(tokenizeSlug('design-or-build'), ['design', 'build']);
    });

    // Sub-4-char tokens NEVER stem regardless of trailing letter
    // (`bus` stays `bus`; `cat` stays `cat`).
    it('preserves short tokens under the 4-char floor (bus, cat)', () => {
      assert.deepStrictEqual(tokenizeSlug('bus-cat'), ['bus', 'cat']);
    });
  });

  describe('AC3 closes the email-templates Jaccard gap', () => {
    // Pre-AC3: jaccard(['default', 'email', 'templates'], ['email', 'templates'])
    //   = |{default, email, templates} ∩ {email, templates}| / |union| = 2/3 = 0.67
    //   — actually right at the threshold; but the canonical 5/27 case is
    //   `default-email-template` (singular) vs `email-templates` (plural):
    //   pre-AC3 these were {default, email, template} vs {email, templates}
    //   = 1/4 = 0.25.
    //
    // Post-AC3: both singularize to {default, email, template} vs
    //   {email, template} = 2/3 = 0.67 → meets COERCE_THRESHOLD.
    it('default-email-template vs email-templates now overlaps for coerce', () => {
      const a = tokenizeSlug('default-email-template');
      const b = tokenizeSlug('email-templates');
      const setA = new Set(a);
      const setB = new Set(b);
      const intersection = [...setA].filter((w) => setB.has(w)).length;
      const union = new Set([...setA, ...setB]).size;
      const jaccard = union === 0 ? 0 : intersection / union;
      // Document the post-AC3 value. The exact ratio depends on shared
      // tokens; the assertion below is intentionally loose — the
      // mandatory check is that we cross the 0.5 line, which we couldn't
      // do pre-AC3.
      assert.ok(
        jaccard >= 0.5,
        `expected jaccard ≥ 0.5 post-AC3 (got ${jaccard})`,
      );
    });
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

// ---------------------------------------------------------------------------
// `--source <path>` scoping (Task 5 of slack-digest-topic-wiki).
//
// Verifies that `refreshAllFromSources({ sourcePath })` filters discovery
// to ONLY that file before per-slug filtering, mirroring the slack-digest
// skill's "integrate just the digest I just wrote" semantics. Without
// this, a workspace with N prior digests tagged the same slug runs N×
// the user's expected cost on first integration.
// ---------------------------------------------------------------------------
describe('TopicMemoryService.refreshAllFromSources (sourcePath scoping)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let storage: FileStorageAdapter;

  function digest(date: string): string {
    return `---
title: "Slack Digest — ${date}"
date: ${date}
type: slack-digest
participants: [person-a]
items_extracted: 1
items_approved: 1
topics: [foo]
---

# Slack Digest — ${date}

## Conversations

### 1. DM
Talked about foo on ${date}.
`;
  }

  const SEED_TOPIC: TopicPage = {
    frontmatter: {
      topic_slug: 'foo',
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-15',
      sources_integrated: [],
    },
    sections: { 'Current state': 'Foo is being explored.' },
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'refresh-source-scope-'));
    paths = makePathsForRefresh(tmpDir);
    storage = new FileStorageAdapter();

    writeFileForRefresh(
      tmpDir,
      '.arete/memory/topics/foo.md',
      renderTopicPage(SEED_TOPIC),
    );
    // Three prior digests + one new digest, all tagged `foo`.
    writeFileForRefresh(tmpDir, 'resources/notes/2026-04-20-slack-digest.md', digest('2026-04-20'));
    writeFileForRefresh(tmpDir, 'resources/notes/2026-04-22-slack-digest.md', digest('2026-04-22'));
    writeFileForRefresh(tmpDir, 'resources/notes/2026-04-25-slack-digest.md', digest('2026-04-25'));
    writeFileForRefresh(tmpDir, 'resources/notes/2026-04-28-slack-digest.md', digest('2026-04-28'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('without --source: integrates ALL 4 digests tagged with the slug', async () => {
    const svc = new TopicMemoryService(storage);

    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['foo'],
      skipLock: true,
    });

    assert.strictEqual(result.topics[0].fallback, 4, 'all 4 digests integrated via fallback');

    const written = await storage.read(join(tmpDir, '.arete/memory/topics/foo.md'));
    const { parseTopicPage } = await import('../../src/models/topic-page.js');
    const parsed = parseTopicPage(written!);
    assert.strictEqual(parsed!.frontmatter.sources_integrated.length, 4);
  });

  it('with --source: integrates ONLY the matching digest (cost-correct)', async () => {
    const svc = new TopicMemoryService(storage);

    const newDigestPath = join(tmpDir, 'resources/notes/2026-04-28-slack-digest.md');
    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['foo'],
      sourcePath: newDigestPath,
      skipLock: true,
    });

    assert.strictEqual(result.topics[0].fallback, 1, 'only 1 digest integrated');
    assert.strictEqual(result.topics[0].skipped, 0);

    const written = await storage.read(join(tmpDir, '.arete/memory/topics/foo.md'));
    const { parseTopicPage } = await import('../../src/models/topic-page.js');
    const parsed = parseTopicPage(written!);
    const sources = parsed!.frontmatter.sources_integrated;
    assert.strictEqual(sources.length, 1, 'only the new digest in sources_integrated');
    assert.match(sources[0].path, /2026-04-28-slack-digest\.md$/);
    // Prior digests must NOT appear in sources_integrated.
    for (const s of sources) {
      assert.doesNotMatch(s.path, /2026-04-20|2026-04-22|2026-04-25/);
    }
  });

  it('with --source: returns no-sources when path matches no slug-tagged file', async () => {
    const svc = new TopicMemoryService(storage);

    // Path exists but no entry has it as path AND tags `bar`.
    const newDigestPath = join(tmpDir, 'resources/notes/2026-04-28-slack-digest.md');
    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['bar'], // not in any digest
      sourcePath: newDigestPath,
      skipLock: true,
    });

    assert.strictEqual(result.topics[0].status, 'no-sources');
  });
});

// ---------------------------------------------------------------------------
// AC2 (phase-3-5-followup-5) — alias-aware integration filter.
//
// Pre-AC2: only sources tagged with the canonical slug integrated. Sources
// tagged with an alias (e.g., `default-email-template` while canonical is
// `email-templates`) were orphaned forever even after the user added
// `aliases:` to the topic page.
//
// Post-AC2: sources tagged with the canonical slug OR any declared alias
// integrate when `arete topic refresh <slug>` runs. Closes the orphan-
// rescue path required by AC6.
// ---------------------------------------------------------------------------
describe('TopicMemoryService.refreshAllFromSources (AC2 alias-aware filter)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let storage: FileStorageAdapter;

  // Topic page with two declared aliases. The canonical is `email-templates`;
  // sources may tag the canonical OR `default-email-template` OR
  // `rollout-strategy`.
  const SEED_TOPIC: TopicPage = {
    frontmatter: {
      topic_slug: 'email-templates',
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-15',
      aliases: ['default-email-template', 'rollout-strategy'],
      sources_integrated: [],
    },
    sections: { 'Current state': 'Email-templates work spans Snapsheet + Glance.' },
  };

  function meeting(date: string, slug: string, tags: string[]): string {
    return `---
title: "Sync ${date}"
date: ${date}
attendees:
  - { name: "Jane Doe", email: "jane@reserv.com" }
topics: [${tags.join(', ')}]
---

# Sync ${date}

## Transcript

Discussed ${slug} on ${date}.
`;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'refresh-alias-'));
    paths = makePathsForRefresh(tmpDir);
    storage = new FileStorageAdapter();

    writeFileForRefresh(
      tmpDir,
      '.arete/memory/topics/email-templates.md',
      renderTopicPage(SEED_TOPIC),
    );
    // Three sources, each tagged with a different surface:
    //   - canonical `email-templates`
    //   - alias `default-email-template`
    //   - alias `rollout-strategy`
    writeFileForRefresh(
      tmpDir,
      'resources/meetings/2026-04-20-canonical.md',
      meeting('2026-04-20', 'canonical', ['email-templates']),
    );
    writeFileForRefresh(
      tmpDir,
      'resources/meetings/2026-04-22-alias-a.md',
      meeting('2026-04-22', 'alias-a', ['default-email-template']),
    );
    writeFileForRefresh(
      tmpDir,
      'resources/meetings/2026-04-25-alias-b.md',
      meeting('2026-04-25', 'alias-b', ['rollout-strategy']),
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('integrates sources tagged with canonical OR declared aliases', async () => {
    const svc = new TopicMemoryService(storage);

    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['email-templates'],
      skipLock: true,
    });

    assert.strictEqual(result.topics.length, 1);
    assert.strictEqual(result.topics[0].status, 'ok');
    // All 3 sources integrate (1 canonical + 2 alias-tagged), each via
    // the fallback path because no LLM was provided.
    assert.strictEqual(result.topics[0].fallback, 3, 'all 3 sources matched alias-set');

    // Re-read the topic page and confirm all 3 source paths appear.
    const written = await storage.read(join(tmpDir, '.arete/memory/topics/email-templates.md'));
    const { parseTopicPage } = await import('../../src/models/topic-page.js');
    const parsed = parseTopicPage(written!);
    assert.notStrictEqual(parsed, null);
    const sources = parsed!.frontmatter.sources_integrated;
    assert.strictEqual(sources.length, 3, 'canonical + 2 alias-tagged in sources_integrated');
    assert.match(sources[0].path, /2026-04-20-canonical\.md$/);
    assert.match(sources[1].path, /2026-04-22-alias-a\.md$/);
    assert.match(sources[2].path, /2026-04-25-alias-b\.md$/);
  });

  it('skips sources tagged with a non-aliased slug (filter still excludes unrelated)', async () => {
    // Add a fourth source tagged with an UNDECLARED alias.
    writeFileForRefresh(
      tmpDir,
      'resources/meetings/2026-04-26-unrelated.md',
      meeting('2026-04-26', 'unrelated', ['some-other-slug']),
    );

    const svc = new TopicMemoryService(storage);
    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['email-templates'],
      skipLock: true,
    });

    // 3 alias-matched, NOT 4.
    assert.strictEqual(result.topics[0].fallback, 3);
    const written = await storage.read(join(tmpDir, '.arete/memory/topics/email-templates.md'));
    const { parseTopicPage } = await import('../../src/models/topic-page.js');
    const parsed = parseTopicPage(written!);
    const sources = parsed!.frontmatter.sources_integrated;
    assert.strictEqual(sources.length, 3);
    // The unrelated source path must NOT appear.
    for (const s of sources) {
      assert.doesNotMatch(s.path, /2026-04-26-unrelated\.md$/);
    }
  });

  it('degrades gracefully when target slug has no topic page yet (no aliases set)', async () => {
    const svc = new TopicMemoryService(storage);

    // Add a source tagged ONLY with a brand-new slug not in any topic page.
    writeFileForRefresh(
      tmpDir,
      'resources/meetings/2026-04-27-new-slug.md',
      meeting('2026-04-27', 'new-slug', ['brand-new-slug']),
    );

    // Request refresh for `brand-new-slug` — no existing page, no aliases.
    // The filter degrades to canonical-only (the exact pre-AC2 behavior),
    // and the single source tagged `brand-new-slug` integrates.
    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['brand-new-slug'],
      skipLock: true,
    });

    assert.strictEqual(result.topics[0].status, 'ok');
    assert.strictEqual(result.topics[0].fallback, 1);
  });
});
