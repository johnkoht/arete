import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EntityService } from '../../src/services/entity.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { WorkspacePaths } from '../../src/models/index.js';

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

describe('EntityService.suggestPeopleIntelligence', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-intel-'));
    paths = makePaths(tmpDir);
    mkdirSync(paths.context, { recursive: true });
    mkdirSync(join(paths.people, 'internal'), { recursive: true });
    mkdirSync(join(paths.people, 'customers'), { recursive: true });
    mkdirSync(join(paths.people, 'users'), { recursive: true });
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('routes low-confidence candidates to unknown queue', async () => {
    const digest = await service.suggestPeopleIntelligence(
      [{ name: 'Mystery Contact', text: 'Met someone yesterday', source: 'meeting-1.md' }],
      paths,
      { confidenceThreshold: 0.8 },
    );

    assert.equal(digest.mode, 'digest');
    assert.equal(digest.totalCandidates, 1);
    assert.equal(digest.unknownQueueCount, 1);
    assert.equal(digest.suggestions[0].recommendation.category, 'unknown_queue');
    assert.equal(digest.suggestions[0].status, 'needs-review');
  });

  it('uses profile/domain hints for internal affiliation and recommendations', async () => {
    writeFileSync(
      join(paths.context, 'profile.md'),
      `---\nname: "Jane"\nemail: "jane@arete.ai"\ncompany: "Areté"\nwebsite: "https://arete.ai"\n---\n`,
      'utf8',
    );
    writeFileSync(
      join(paths.context, 'domain-hints.md'),
      `---\ndomains:\n  - arete.ai\n---\n`,
      'utf8',
    );

    const digest = await service.suggestPeopleIntelligence(
      [
        {
          name: 'Alex Engineer',
          email: 'alex@arete.ai',
          text: 'Internal product review participant',
          source: 'meeting-2.md',
        },
      ],
      paths,
    );

    const suggestion = digest.suggestions[0];
    assert.equal(suggestion.recommendation.affiliation, 'internal');
    assert.equal(suggestion.recommendation.category, 'internal');
    assert.equal(suggestion.status, 'recommended');
    assert.ok(suggestion.evidence.some((item) => item.kind === 'email-domain'));
  });

  it('computes digest metrics including misclassification and triage burden', async () => {
    const digest = await service.suggestPeopleIntelligence(
      [
        {
          name: 'Beta User',
          email: 'beta@example.com',
          text: 'user interview participant',
          source: 'meeting-3.md',
          actualRoleLens: 'customer',
        },
        {
          name: 'Unknown Lead',
          text: 'met in hallway',
          source: 'meeting-4.md',
        },
      ],
      paths,
      { confidenceThreshold: 0.6 },
    );

    assert.equal(digest.mode, 'digest');
    assert.ok(digest.metrics.triageBurdenMinutes >= 5);
    assert.equal(digest.metrics.interruptionComplaintRate, 0);
    assert.ok(digest.metrics.unknownQueueRate > 0);
    assert.ok(digest.metrics.misclassificationRate !== null);
  });

  it('degrades gracefully when profile/domain contracts are missing', async () => {
    const digest = await service.suggestPeopleIntelligence(
      [
        {
          name: 'Partner Org',
          text: 'integration partner requested API access',
          source: 'notes.md',
        },
      ],
      paths,
    );

    assert.equal(digest.totalCandidates, 1);
    assert.equal(digest.suggestions[0].recommendation.roleLens, 'unknown');
    assert.equal(digest.suggestions[0].recommendation.category, 'unknown_queue');
  });

  it('loads policy config and supports feature toggles with safe defaults', async () => {
    writeFileSync(
      join(paths.context, 'people-intelligence-policy.json'),
      JSON.stringify({
        confidenceThreshold: 0.5,
        defaultTrackingIntent: 'ignore',
        features: {
          enableExtractionTuning: true,
          enableEnrichment: true,
        },
      }, null, 2),
      'utf8',
    );

    const digest = await service.suggestPeopleIntelligence(
      [
        {
          name: 'Buyer Contact',
          company: 'Customer Buyer Team',
          text: 'customer buyer asked about renewal plans',
          source: 'meeting-5.md',
        },
      ],
      paths,
    );

    assert.equal(digest.policy.confidenceThreshold, 0.5);
    assert.equal(digest.policy.defaultTrackingIntent, 'ignore');
    assert.equal(digest.policy.features.enableEnrichment, true);
    assert.equal(digest.suggestions[0].enrichmentApplied, true);
    assert.ok(digest.suggestions[0].evidence.some((item) => item.kind === 'enrichment'));
  });

  it('persists snapshots and reads recent valid entries only', async () => {
    await service.suggestPeopleIntelligence(
      [{ name: 'Unknown', text: 'small mention', source: 'meeting-6.md' }],
      paths,
      { extractionQualityScore: 0.72 },
    );

    const snapshotPath = join(paths.memory, 'metrics', 'people-intelligence.jsonl');
    const existing = readFileSync(snapshotPath, 'utf8');
    writeFileSync(snapshotPath, existing + '{"bad-json"\n', 'utf8');

    const snapshots = await service.getRecentPeopleIntelligenceSnapshots(paths, 5);
    assert.ok(snapshots.length >= 1);
    const latest = snapshots[snapshots.length - 1];
    assert.equal(latest.metrics.extractionQualityScore, 0.72);
    assert.equal(typeof latest.totalCandidates, 'number');
  });
});
