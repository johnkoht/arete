/**
 * Search route tests.
 *
 * Tests createSearchRouter with real temp workspace files.
 * Uses node:test + node:assert/strict.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSearchRouter, extractExcerpt } from '../../src/routes/search.js';

// ── helpers ──────────────────────────────────────────────────────────────────

async function req(
  app: ReturnType<typeof createSearchRouter>,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method: 'GET' });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

type SearchBody = {
  results: Array<{
    type: string;
    title: string;
    slug: string;
    excerpt: string;
    date?: string;
    url: string;
  }>;
};

// ── extractExcerpt unit tests ─────────────────────────────────────────────────

describe('extractExcerpt', () => {
  it('returns content up to 150 chars when no match', () => {
    const content = 'Hello world, this is some content.';
    const excerpt = extractExcerpt(content, ['nomatch']);
    assert.ok(excerpt.length <= 152, 'excerpt should be <= 150 chars + ellipsis');
  });

  it('centers around the first token match', () => {
    const content = 'aaaa bbbb pricing cccc dddd';
    const excerpt = extractExcerpt(content, ['pricing']);
    assert.ok(excerpt.includes('pricing'), 'excerpt should include the matched token');
  });

  it('strips newlines', () => {
    const content = 'line one\nline two\npricing info here';
    const excerpt = extractExcerpt(content, ['pricing']);
    assert.ok(!excerpt.includes('\n'), 'excerpt should not contain newlines');
  });

  it('handles empty content', () => {
    const excerpt = extractExcerpt('', ['test']);
    assert.equal(excerpt, '');
  });

  it('is case-insensitive', () => {
    const content = 'HELLO world PRICING here';
    const excerpt = extractExcerpt(content, ['pricing']);
    assert.ok(excerpt.toLowerCase().includes('pricing'));
  });
});

// ── Full search router tests ──────────────────────────────────────────────────

describe('GET /api/search — empty workspace', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-search-test-'));
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    await mkdir(join(tmpDir, 'people'), { recursive: true });
    await mkdir(join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
    await mkdir(join(tmpDir, 'projects', 'active'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for short query', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=a');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(Array.isArray(body.results));
    assert.equal(body.results.length, 0);
  });

  it('returns empty results for empty workspace', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme+pricing');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(Array.isArray(body.results));
    assert.equal(body.results.length, 0);
  });
});

describe('GET /api/search — with data', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-search-data-test-'));

    // Create meetings
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    await writeFile(
      join(tmpDir, 'resources', 'meetings', '2026-01-15-acme-pricing-review.md'),
      `---
title: Acme Pricing Review
date: 2026-01-15
status: processed
---

# Acme Pricing Review

Discussed the new Acme pricing model in detail. The team agreed on a 15% increase.
Acme wants to renegotiate terms by end of quarter.
`,
      'utf8',
    );

    await writeFile(
      join(tmpDir, 'resources', 'meetings', '2026-01-10-team-standup.md'),
      `---
title: Team Standup
date: 2026-01-10
status: synced
---

# Team Standup

Weekly team sync. No mention of pricing.
`,
      'utf8',
    );

    // Create people
    await mkdir(join(tmpDir, 'people'), { recursive: true });
    await writeFile(
      join(tmpDir, 'people', 'alice-jones.md'),
      `---
name: Alice Jones
role: VP Sales
company: Acme Corp
---

# Alice Jones

Alice is the VP of Sales at Acme Corp. She manages the Acme pricing negotiations.
`,
      'utf8',
    );

    await writeFile(
      join(tmpDir, 'people', 'bob-smith.md'),
      `---
name: Bob Smith
role: Engineer
company: Internal
---

# Bob Smith

Bob works on internal tooling. No connection to pricing.
`,
      'utf8',
    );

    // Create memory
    await mkdir(join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
    await writeFile(
      join(tmpDir, '.arete', 'memory', 'items', 'decisions.md'),
      `## Acme Pricing Decision 2026-01-15

We decided to increase Acme pricing by 15% starting Q2.

## Unrelated Decision

Something else entirely.
`,
      'utf8',
    );

    await writeFile(
      join(tmpDir, '.arete', 'memory', 'items', 'learnings.md'),
      `## Negotiation Learning

Always prepare pricing data before Acme calls.
`,
      'utf8',
    );

    // Create projects
    await mkdir(join(tmpDir, 'projects', 'active', 'acme-expansion'), { recursive: true });
    await writeFile(
      join(tmpDir, 'projects', 'active', 'acme-expansion', 'README.md'),
      `# Acme Expansion Project

Goal: expand Acme account with new pricing tiers.

Status: In Progress
`,
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds meetings matching query', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme+pricing');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(Array.isArray(body.results));
    const meetingResults = body.results.filter((r) => r.type === 'meeting');
    assert.ok(meetingResults.length >= 1, 'should find at least one meeting');
    assert.ok(
      meetingResults.some((r) => r.slug === '2026-01-15-acme-pricing-review'),
      'should find the Acme pricing review meeting',
    );
  });

  it('finds people matching query', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=alice+acme');
    assert.equal(status, 200);
    const body = json as SearchBody;
    const personResults = body.results.filter((r) => r.type === 'person');
    assert.ok(personResults.length >= 1, 'should find alice');
    assert.ok(personResults.some((r) => r.slug === 'alice-jones'));
  });

  it('filters by type=meetings only', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme&type=meetings');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(body.results.every((r) => r.type === 'meeting'), 'all results should be meetings');
  });

  it('filters by type=people only', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme&type=people');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(body.results.every((r) => r.type === 'person'), 'all results should be people');
  });

  it('extracts non-empty excerpts', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme+pricing');
    assert.equal(status, 200);
    const body = json as SearchBody;
    for (const result of body.results) {
      assert.ok(typeof result.excerpt === 'string', 'excerpt should be a string');
      assert.ok(result.excerpt.length > 0, 'excerpt should be non-empty');
      assert.ok(result.excerpt.length <= 160, 'excerpt should be <= 150 chars + ellipsis');
    }
  });

  it('each result has required fields', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.ok(body.results.length > 0, 'should have results');
    for (const result of body.results) {
      assert.ok(typeof result.type === 'string', 'type should be string');
      assert.ok(typeof result.title === 'string', 'title should be string');
      assert.ok(typeof result.slug === 'string', 'slug should be string');
      assert.ok(typeof result.excerpt === 'string', 'excerpt should be string');
      assert.ok(typeof result.url === 'string', 'url should be string');
      assert.ok(result.url.startsWith('/'), 'url should be a frontend route');
    }
  });

  it('returns empty when query does not match anything', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=zzznomatch99999');
    assert.equal(status, 200);
    const body = json as SearchBody;
    assert.equal(body.results.length, 0);
  });

  it('meeting url is /meetings/:slug', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=acme&type=meetings');
    assert.equal(status, 200);
    const body = json as SearchBody;
    for (const result of body.results) {
      assert.ok(result.url.startsWith('/meetings/'), `meeting url should start with /meetings/, got ${result.url}`);
    }
  });

  it('person url is /people/:slug', async () => {
    const router = createSearchRouter(tmpDir);
    const { status, json } = await req(router, '/?q=alice&type=people');
    assert.equal(status, 200);
    const body = json as SearchBody;
    for (const result of body.results) {
      assert.ok(result.url.startsWith('/people/'), `person url should start with /people/, got ${result.url}`);
    }
  });
});
