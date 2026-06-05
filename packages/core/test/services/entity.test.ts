/**
 * Tests for EntityService via compat (resolveEntity, resolveEntities, listPeople, etc.).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveEntity,
  resolveEntities,
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  slugifyPersonName,
} from '../../src/compat/entity.js';
import {
  EntityService,
  normalizeStanceTokens,
  stanceJaccardSimilarity,
  dedupeStancesByJaccard,
  STANCE_JACCARD_DEDUP_THRESHOLD,
} from '../../src/services/entity.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { ResolvedEntity } from '../../src/models/entities.js';
import type { PersonStance } from '../../src/services/person-signals.js';

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

function writePersonFile(
  root: string,
  category: string,
  slug: string,
  frontmatter: Record<string, unknown>
): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${yaml}\n---\n\n# ${frontmatter.name}\n`,
    'utf8'
  );
}

describe('slugifyPersonName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyPersonName('Jane Doe'), 'jane-doe');
  });
});

describe('EntityService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entity-svc-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolve (person)', () => {
    it('resolves person by name', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });
      const result = await resolveEntity('Jane Doe', 'person', paths);
      assert.ok(result);
      assert.equal(result!.type, 'person');
      assert.equal(result!.name, 'Jane Doe');
      assert.equal(result!.slug, 'jane-doe');
    });

    it('returns null for empty reference', async () => {
      assert.equal(await resolveEntity('', 'person', paths), null);
    });
  });

  describe('resolveAll', () => {
    it('returns multiple matches and respects limit', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      writePersonFile(tmpDir, 'internal', 'jane-smith', {
        name: 'Jane Smith',
        category: 'internal',
      });
      const results = await resolveEntities('jane', 'person', paths, 2);
      assert.ok(results.length >= 2);
      assert.equal(results.length, 2);
    });
  });

  describe('listPeople', () => {
    it('returns empty array when no people', async () => {
      mkdirSync(join(paths.people, 'internal'), { recursive: true });
      const list = await listPeople(paths);
      assert.deepEqual(list, []);
    });

    it('lists people from category', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@co.com',
        category: 'internal',
      });
      const list = await listPeople(paths);
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Jane Doe');
    });
  });

  describe('getPersonBySlug', () => {
    it('returns person when found', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      const person = await getPersonBySlug(paths, 'internal', 'jane-doe');
      assert.ok(person);
      assert.equal(person!.name, 'Jane Doe');
    });
  });

  describe('getPersonByEmail', () => {
    it('returns person when email matches', async () => {
      writePersonFile(tmpDir, 'customers', 'bob', {
        name: 'Bob Acme',
        email: 'bob@acme.com',
        category: 'customers',
      });
      const person = await getPersonByEmail(paths, 'bob@acme.com');
      assert.ok(person);
      assert.equal(person!.name, 'Bob Acme');
    });
  });

  describe('updatePeopleIndex', () => {
    it('writes index when people exist', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@co.com',
        category: 'internal',
      });
      await updatePeopleIndex(paths);
      const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
      assert.ok(content.includes('Jane Doe'));
    });
  });
});

// ---------------------------------------------------------------------------
// EntityService.findMentions — conversation scanning
// ---------------------------------------------------------------------------

describe('EntityService.findMentions — conversation sourceType', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entity-findm-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConversation(root: string, filename: string, content: string): void {
    const dir = join(root, 'resources', 'conversations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, 'utf8');
  }

  function writeMeetingFile(root: string, filename: string, content: string): void {
    const dir = join(root, 'resources', 'meetings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, 'utf8');
  }

  it('returns conversation sourceType for files under resources/conversations/', async () => {
    writeConversation(
      tmpDir,
      '2026-02-20-api-discussion.md',
      '---\ntitle: "API Discussion"\ndate: "2026-02-20"\n---\n\nAlice asked about the API timeline.\n',
    );

    writePersonFile(tmpDir, 'internal', 'alice', { name: 'Alice', category: 'internal' });
    const entity: ResolvedEntity = {
      type: 'person',
      path: join(paths.people, 'internal', 'alice.md'),
      name: 'Alice',
      slug: 'alice',
      metadata: {},
      score: 1,
    };

    const mentions = await service.findMentions(entity, paths);
    const convMention = mentions.find((m) => m.sourceType === 'conversation');
    assert.ok(convMention, 'Expected a conversation sourceType mention');
    assert.ok(convMention.sourcePath.includes('conversations'));
  });

  it('still returns meeting sourceType for files under resources/meetings/', async () => {
    writeMeetingFile(
      tmpDir,
      '2026-02-20-standup.md',
      '---\ntitle: "Standup"\ndate: "2026-02-20"\n---\n\nAlice asked about the deployment.\n',
    );

    writePersonFile(tmpDir, 'internal', 'alice', { name: 'Alice', category: 'internal' });
    const entity: ResolvedEntity = {
      type: 'person',
      path: join(paths.people, 'internal', 'alice.md'),
      name: 'Alice',
      slug: 'alice',
      metadata: {},
      score: 1,
    };

    const mentions = await service.findMentions(entity, paths);
    const meetingMention = mentions.find((m) => m.sourceType === 'meeting');
    assert.ok(meetingMention, 'Expected a meeting sourceType mention');
  });

  it('returns both meeting and conversation mentions for the same person', async () => {
    writeMeetingFile(
      tmpDir,
      '2026-02-19-review.md',
      '---\ntitle: "Review"\ndate: "2026-02-19"\n---\n\nAlice presented the plan.\n',
    );
    writeConversation(
      tmpDir,
      '2026-02-20-api-discussion.md',
      '---\ntitle: "API Discussion"\ndate: "2026-02-20"\n---\n\nAlice asked about the API.\n',
    );

    writePersonFile(tmpDir, 'internal', 'alice', { name: 'Alice', category: 'internal' });
    const entity: ResolvedEntity = {
      type: 'person',
      path: join(paths.people, 'internal', 'alice.md'),
      name: 'Alice',
      slug: 'alice',
      metadata: {},
      score: 1,
    };

    const mentions = await service.findMentions(entity, paths);
    const types = new Set(mentions.map((m) => m.sourceType));
    assert.ok(types.has('meeting'), 'Expected meeting mention');
    assert.ok(types.has('conversation'), 'Expected conversation mention');
  });
});

// ---------------------------------------------------------------------------
// Phase 7a AC5 — channel fields convention (read + audit)
// ---------------------------------------------------------------------------

import {
  readPersonChannels,
  computeChannelsAudit,
} from '../../src/services/entity.js';
import type { PersonCategory } from '../../src/models/index.js';

/**
 * Writes a person file with a fully-specified frontmatter string —
 * needed for channel tests because the default writePersonFile helper
 * uses JSON.stringify which doesn't produce YAML arrays cleanly.
 */
function writePersonFileRaw(
  root: string,
  category: string,
  slug: string,
  frontmatterYaml: string,
): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${frontmatterYaml}\n---\n\n# ${slug}\n`,
    'utf8',
  );
}

describe('Phase 7a AC5b — readPersonChannels', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'person-channels-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all populated channel fields', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'alice',
      `name: Alice
category: internal
email: alice@reserv.com
alt_emails:
  - alice@oldcompany.com
slack_user_id: U01ABC123
slack_handle: alice
phone: "+1-555-0100"`,
    );

    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'alice.md'),
    );

    assert.ok(channels);
    assert.equal(channels.email, 'alice@reserv.com');
    assert.deepEqual(channels.alt_emails, ['alice@oldcompany.com']);
    assert.equal(channels.slack_user_id, 'U01ABC123');
    assert.equal(channels.slack_handle, 'alice');
    assert.equal(channels.phone, '+1-555-0100');
  });

  it('returns only email when only email populated (typical arete-reserv case)', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'bob',
      `name: Bob
category: internal
email: bob@reserv.com`,
    );

    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'bob.md'),
    );

    assert.ok(channels);
    assert.deepEqual(channels, { email: 'bob@reserv.com' });
  });

  it('returns empty object when no channel fields populated', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'no-channels',
      `name: No Channels
category: internal
role: PM`,
    );

    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'no-channels.md'),
    );

    assert.ok(channels);
    assert.deepEqual(channels, {});
  });

  it('returns null when file does not exist', async () => {
    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'missing.md'),
    );
    assert.equal(channels, null);
  });

  it('drops malformed entries (non-string slack_user_id, empty strings)', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'mixed',
      `name: Mixed
category: internal
email: ""
slack_user_id: U01XYZ
slack_handle: "   "
alt_emails:
  - alice@example.com
  - 12345
  - ""`,
    );

    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'mixed.md'),
    );

    assert.ok(channels);
    // Empty email dropped.
    assert.equal(channels.email, undefined);
    // Valid slack_user_id kept.
    assert.equal(channels.slack_user_id, 'U01XYZ');
    // Whitespace-only slack_handle dropped.
    assert.equal(channels.slack_handle, undefined);
    // alt_emails: only the valid email kept.
    assert.deepEqual(channels.alt_emails, ['alice@example.com']);
  });

  it('coerces phone to string and trims', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'phone-only',
      `name: Phone Only
category: internal
phone: "  +1-555-9999  "`,
    );

    const channels = await readPersonChannels(
      storage,
      join(tmpDir, 'people', 'internal', 'phone-only.md'),
    );

    assert.ok(channels);
    assert.equal(channels.phone, '+1-555-9999');
  });
});

describe('Phase 7a AC5c — computeChannelsAudit', () => {
  it('returns zeroes on empty input', () => {
    const result = computeChannelsAudit([]);
    assert.deepEqual(result, {
      total: 0,
      with_email: 0,
      with_alt_emails: 0,
      with_slack_user_id: 0,
      with_slack_handle: 0,
      with_phone: 0,
      no_channels: 0,
      gaps: [],
    });
  });

  it('counts populated fields and surfaces per-person gaps', () => {
    const result = computeChannelsAudit([
      {
        slug: 'alice',
        category: 'internal' as PersonCategory,
        channels: {
          email: 'a@x.com',
          slack_user_id: 'UAAA',
          slack_handle: 'alice',
        },
      },
      {
        slug: 'bob',
        category: 'internal' as PersonCategory,
        channels: { email: 'b@x.com' },
      },
      {
        slug: 'carla',
        category: 'customers' as PersonCategory,
        channels: {},
      },
    ]);

    assert.equal(result.total, 3);
    assert.equal(result.with_email, 2);
    assert.equal(result.with_slack_user_id, 1);
    assert.equal(result.with_slack_handle, 1);
    assert.equal(result.with_alt_emails, 0);
    assert.equal(result.with_phone, 0);
    assert.equal(result.no_channels, 1); // Carla has nothing.

    // Gaps are sorted by slug.
    assert.equal(result.gaps[0].slug, 'alice');
    assert.equal(result.gaps[1].slug, 'bob');
    assert.equal(result.gaps[2].slug, 'carla');

    // Alice has email + slack_user_id + slack_handle populated;
    // missing alt_emails + phone.
    assert.ok(result.gaps[0].populated.includes('email'));
    assert.ok(result.gaps[0].populated.includes('slack_user_id'));
    assert.ok(result.gaps[0].populated.includes('slack_handle'));
    assert.ok(result.gaps[0].missing.includes('alt_emails'));
    assert.ok(result.gaps[0].missing.includes('phone'));

    // Carla has nothing populated.
    assert.deepEqual(result.gaps[2].populated, []);
    assert.equal(result.gaps[2].missing.length, 5);
  });
});

describe('Phase 7a AC5c — EntityService.auditPeopleChannels', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'audit-channels-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty audit on missing people dir', async () => {
    const storage = new FileStorageAdapter();
    const service = new EntityService(storage, null as never, null);
    const result = await service.auditPeopleChannels(paths);
    assert.equal(result.total, 0);
    assert.equal(result.no_channels, 0);
  });

  it('walks all three categories and returns aggregate health', async () => {
    writePersonFileRaw(
      tmpDir,
      'internal',
      'alice',
      `name: Alice
category: internal
email: alice@x.com
slack_user_id: UAAA`,
    );
    writePersonFileRaw(
      tmpDir,
      'internal',
      'bob',
      `name: Bob
category: internal
email: bob@x.com`,
    );
    writePersonFileRaw(
      tmpDir,
      'customers',
      'carla',
      `name: Carla
category: customers
email: carla@cust.com`,
    );
    writePersonFileRaw(
      tmpDir,
      'users',
      'dan',
      `name: Dan
category: users`,
    );

    const storage = new FileStorageAdapter();
    const service = new EntityService(storage, null as never, null);
    const result = await service.auditPeopleChannels(paths);

    assert.equal(result.total, 4);
    assert.equal(result.with_email, 3);
    assert.equal(result.with_slack_user_id, 1);
    assert.equal(result.no_channels, 1); // dan
    assert.equal(result.gaps.length, 4); // all 4 have at least one missing field

    const dan = result.gaps.find((g) => g.slug === 'dan');
    assert.ok(dan);
    assert.deepEqual(dan.populated, []);
  });
});

// ---------------------------------------------------------------------------
// Phase 9 followup-6 — Jaccard cross-session stance dedup
// ---------------------------------------------------------------------------

function makeStance(topic: string, direction: PersonStance['direction'], source = 'm.md'): PersonStance {
  return {
    topic,
    direction,
    summary: `summary for ${topic}`,
    evidenceQuote: 'q',
    justification: 'j',
    source,
    date: '2025-01-01',
  };
}

describe('normalizeStanceTokens', () => {
  it('lowercases, strips non-alphanumeric, drops tokens of length ≤ 2', () => {
    const tokens = normalizeStanceTokens('Product Focus on Revenue!');
    assert.ok(tokens.has('product'));
    assert.ok(tokens.has('focus'));
    assert.ok(tokens.has('revenue'));
    // "on" is length 2 → dropped
    assert.ok(!tokens.has('on'));
  });

  it('returns empty set for empty input', () => {
    assert.equal(normalizeStanceTokens('').size, 0);
  });

  it('dedups repeated tokens (it is a Set)', () => {
    const tokens = normalizeStanceTokens('focus focus focus');
    assert.equal(tokens.size, 1);
    assert.ok(tokens.has('focus'));
  });

  it('replaces punctuation with space (does not concatenate tokens)', () => {
    const tokens = normalizeStanceTokens('product-focus');
    // The hyphen becomes a space, so this is two tokens, not one "productfocus"
    assert.ok(tokens.has('product'));
    assert.ok(tokens.has('focus'));
    assert.ok(!tokens.has('productfocus'));
  });
});

describe('stanceJaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    const a = new Set(['product', 'focus', 'revenue']);
    const b = new Set(['product', 'focus', 'revenue']);
    assert.equal(stanceJaccardSimilarity(a, b), 1);
  });

  it('returns 0 for disjoint token sets', () => {
    const a = new Set(['product', 'focus']);
    const b = new Set(['headphones', 'wired']);
    assert.equal(stanceJaccardSimilarity(a, b), 0);
  });

  it('returns 0 when both sides are empty', () => {
    assert.equal(stanceJaccardSimilarity(new Set(), new Set()), 0);
  });

  it('returns 0 when one side is empty', () => {
    assert.equal(stanceJaccardSimilarity(new Set(['x']), new Set()), 0);
  });

  it('computes |intersection| / |union| correctly', () => {
    // a = {x,y,z}, b = {y,z,w} → intersection {y,z}=2, union {x,y,z,w}=4 → 0.5
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'w']);
    assert.equal(stanceJaccardSimilarity(a, b), 0.5);
  });
});

describe('dedupeStancesByJaccard', () => {
  it('threshold default is 0.7', () => {
    assert.equal(STANCE_JACCARD_DEDUP_THRESHOLD, 0.7);
  });

  it('keeps first occurrence stable (preserves earliest-meeting provenance)', () => {
    const a = makeStance('product focus prioritization revenue', 'supports', 'older.md');
    const b = makeStance('product focus prioritization revenue concentration', 'supports', 'newer.md');
    // a tokens: {product, focus, prioritization, revenue} = 4
    // b tokens: {product, focus, prioritization, revenue, concentration} = 5
    // intersection = 4, union = 5, jaccard = 0.8 ≥ 0.7 → b dropped
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'older.md');
    assert.equal(result[0].topic, 'product focus prioritization revenue');
  });

  it('semantic duplicates (high Jaccard, same direction) are deduped', () => {
    // Same direction + topic re-wording where token overlap is ≥ 0.7.
    // (The motivating Lindsay case "product focus prioritization by revenue
    // concentration" vs "product focus on dominant revenue line over full
    // portfolio coverage" shares only 3 tokens out of 11 union ≈ 0.27 — too
    // low to dedup at 0.7 by token Jaccard alone. The Jaccard threshold
    // catches near-restatements, not arbitrary paraphrases.)
    const a = makeStance('engineering velocity over careful planning', 'supports');
    const b = makeStance('engineering velocity over planning', 'supports');
    // a: {engineering, velocity, over, careful, planning} = 5
    // b: {engineering, velocity, over, planning} = 4
    // intersection = 4, union = 5, jaccard = 0.8 ≥ 0.7 → b dropped
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, 'engineering velocity over careful planning');
  });

  it('different domains are NOT deduped (low Jaccard, same direction)', () => {
    const a = makeStance('ai tooling supports fast release', 'supports');
    const b = makeStance('wired headphones preference', 'supports');
    // No token overlap → jaccard = 0 → both kept
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 2);
  });

  it('same topic but different direction is NOT deduped (direction scoping)', () => {
    const a = makeStance('engineer autonomy', 'supports');
    const b = makeStance('engineer autonomy', 'opposes');
    // Topics identical (jaccard=1) but direction differs → both kept
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 2);
    assert.equal(result[0].direction, 'supports');
    assert.equal(result[1].direction, 'opposes');
  });

  it('threshold boundary: Jaccard exactly 0.7 → DROP (≥ threshold)', () => {
    // Construct sets with intersection 7, union 10 → jaccard = 0.7
    const a = makeStance('alpha beta gamma delta epsilon zeta eta theta', 'supports');
    const b = makeStance('alpha beta gamma delta epsilon zeta eta iota kappa', 'supports');
    // a: {alpha, beta, gamma, delta, epsilon, zeta, eta, theta} = 8
    // b: {alpha, beta, gamma, delta, epsilon, zeta, eta, iota, kappa} = 9
    // intersection = 7 (alpha..eta), union = 10 (8+9-7), jaccard = 0.7
    const aTokens = normalizeStanceTokens(a.topic);
    const bTokens = normalizeStanceTokens(b.topic);
    assert.equal(stanceJaccardSimilarity(aTokens, bTokens), 0.7);
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 1);
    assert.equal(result[0].topic, a.topic);
  });

  it('threshold boundary: Jaccard 0.69 (just below 0.7) → KEEP', () => {
    // Construct sets with intersection 9, union 13 → jaccard ≈ 0.6923 < 0.7.
    // All tokens must be > 2 chars (else they're dropped by normalizeStanceTokens).
    const a = makeStance(
      'alpha bravo charlie delta echo foxtrot golf hotel india',
      'supports',
    );
    const b = makeStance(
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike',
      'supports',
    );
    // a: 9 unique > 2-char tokens, b: a's 9 + {juliet, kilo, lima, mike} = 13
    // intersection 9, union 13, jaccard = 9/13 ≈ 0.692
    const aTokens = normalizeStanceTokens(a.topic);
    const bTokens = normalizeStanceTokens(b.topic);
    const sim = stanceJaccardSimilarity(aTokens, bTokens);
    assert.ok(sim < 0.7, `expected sim < 0.7, got ${sim}`);
    assert.ok(sim > 0.69, `expected sim > 0.69, got ${sim}`);
    const result = dedupeStancesByJaccard([a, b]);
    assert.equal(result.length, 2);
  });

  it('chains: third stance compared against ALL previously-kept (not just last)', () => {
    const a = makeStance('product focus revenue line', 'supports', 'a.md');
    // b shares low overlap with a, kept
    const b = makeStance('engineer autonomy mandate', 'supports', 'b.md');
    // c is near-dup of a, should be dropped vs a even though b was kept in between
    const c = makeStance('product focus revenue line concentration', 'supports', 'c.md');
    const result = dedupeStancesByJaccard([a, b, c]);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((s) => s.source),
      ['a.md', 'b.md'],
    );
  });

  it('empty input returns empty array', () => {
    assert.deepEqual(dedupeStancesByJaccard([]), []);
  });

  it('does not dedupe across different directions even with identical topics (regression)', () => {
    const a = makeStance('engineer autonomy supports work', 'supports');
    const b = makeStance('engineer autonomy supports work', 'opposes');
    const c = makeStance('engineer autonomy supports work', 'concerned');
    const result = dedupeStancesByJaccard([a, b, c]);
    assert.equal(result.length, 3);
  });
});
