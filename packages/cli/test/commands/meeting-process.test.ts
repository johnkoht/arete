import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('meeting process command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-process');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpDir, 'context'), { recursive: true });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  // ---------------------------------------------------------------------
  // Phase 13 AC2 — area proposal at process (proposal ONLY, zero area writes)
  // ---------------------------------------------------------------------

  function seedArea(slug: string, name: string): void {
    mkdirSync(join(tmpDir, 'areas'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'areas', `${slug}.md`),
      `---\narea: ${name}\nstatus: active\nrecurring_meetings:\n  - title: "${name} Weekly"\n    attendees: []\n    frequency: weekly\n---\n\n# ${name}\n\n## Focus\n${name} delivery work.\n`,
      'utf8',
    );
  }

  it('AC2: proposes an area at ≥0.7 and writes NO area: key (proposal only)', () => {
    seedArea('glance-comms', 'Glance Comms');
    // Internal attendee so process performs REAL writes (person file +
    // attendee_ids) — proving the zero-AREA-write assertion against a
    // run that does write other things.
    writeFileSync(
      join(tmpDir, 'context', 'profile.md'),
      `---\nname: "Jane"\nemail: "jane@acme.com"\ncompany: "Acme"\n---\n`,
      'utf8',
    );
    writeFileSync(
      join(tmpDir, 'context', 'domain-hints.md'),
      `---\ndomains:\n  - acme.com\n---\n`,
      'utf8',
    );
    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-06-09-glance-comms-weekly.md');
    writeFileSync(
      meetingPath,
      `---\ntitle: "Glance Comms Weekly"\ndate: "2026-06-09"\n---\n\n# Glance Comms Weekly\n\n**Attendees**: Sam Teammate <sam@acme.com>\n\n## Transcript\n**Sam**: updates\n`,
      'utf8',
    );

    const result = JSON.parse(
      runCli(
        ['meeting', 'process', '--file', 'resources/meetings/2026-06-09-glance-comms-weekly.md', '--skip-qmd', '--json'],
        { cwd: tmpDir },
      ),
    ) as {
      success: boolean;
      proposedArea: { slug: string; confidence: number; signal?: string } | null;
    };
    assert.equal(result.success, true);
    assert.ok(result.proposedArea, 'proposal present');
    assert.equal(result.proposedArea!.slug, 'glance-comms');
    assert.ok(result.proposedArea!.confidence >= 0.7);
    assert.equal(result.proposedArea!.signal, 'recurring-title');

    // ZERO area writes: the meeting file (which process DID touch for
    // attendee_ids) carries no area: key.
    const after = readFileSync(meetingPath, 'utf8');
    assert.ok(!/^area:/m.test(after), 'process must not write area:');
    assert.ok(!/area_set_by/.test(after), 'process must not write provenance');
    assert.ok(/attendee_ids/.test(after), 'process did perform its normal writes');
  });

  it('AC2: proposedArea is null below the floor', () => {
    seedArea('glance-comms', 'Glance Comms');
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-06-09-zebra.md'),
      `---\ntitle: "Zebra logistics"\ndate: "2026-06-09"\n---\n\n# Zebra\n\n**Attendees**: Mystery Person\n\n## Transcript\n**Mystery Person**: nothing area-related\n`,
      'utf8',
    );
    const result = JSON.parse(
      runCli(['meeting', 'process', '--latest', '--dry-run', '--skip-qmd', '--json'], {
        cwd: tmpDir,
      }),
    ) as { success: boolean; proposedArea: unknown };
    assert.equal(result.success, true);
    assert.equal(result.proposedArea, null);
  });

  it('AC2: meeting already carrying area: gets no proposal', () => {
    seedArea('glance-comms', 'Glance Comms');
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-06-09-carrier.md'),
      `---\ntitle: "Glance Comms Weekly"\ndate: "2026-06-09"\narea: pm-operations\n---\n\n# Carrier\n\n**Attendees**: Mystery Person\n\n## Transcript\n**Mystery Person**: hello\n`,
      'utf8',
    );
    const result = JSON.parse(
      runCli(['meeting', 'process', '--latest', '--dry-run', '--skip-qmd', '--json'], {
        cwd: tmpDir,
      }),
    ) as { proposedArea: unknown };
    assert.equal(result.proposedArea, null);
  });

  it('processes latest meeting and keeps uncertain attendees in unknown queue', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-02-18-team-sync.md'),
      `---\ntitle: "Team Sync"\ndate: "2026-02-18"\n---\n\n# Team Sync\n\n**Attendees**: Mystery Person\n\n## Transcript\n**Mystery Person**: quick update\n`,
      'utf8',
    );

    const stdout = runCli([
      'meeting',
      'process',
      '--latest',
      '--dry-run',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      candidates: number;
      unknownQueue: Array<{ name: string | null }>;
      applied: Array<{ slug: string }>;
    };

    assert.equal(result.success, true);
    assert.ok(result.candidates >= 1);
    assert.ok(result.unknownQueue.length >= 1);
    assert.equal(result.applied.length, 0);
  });

  it('uses intelligence classification to create internal person and writes attendee_ids', () => {
    writeFileSync(
      join(tmpDir, 'context', 'profile.md'),
      `---\nname: "Jane"\nemail: "jane@acme.com"\ncompany: "Acme"\n---\n`,
      'utf8',
    );
    writeFileSync(
      join(tmpDir, 'context', 'domain-hints.md'),
      `---\ndomains:\n  - acme.com\n---\n`,
      'utf8',
    );

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-02-19-product-review.md');
    writeFileSync(
      meetingPath,
      `---\ntitle: "Product Review"\ndate: "2026-02-19"\n---\n\n# Product Review\n\n**Attendees**: Sam Teammate <sam@acme.com>\n`,
      'utf8',
    );

    const stdout = runCli([
      'meeting',
      'process',
      '--file',
      'resources/meetings/2026-02-19-product-review.md',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      applied: Array<{ slug: string; category: string }>;
      unknownQueue: Array<unknown>;
    };

    assert.equal(result.success, true);
    assert.ok(result.applied.some((person) => person.slug === 'sam-teammate'));
    assert.ok(result.applied.some((person) => person.category === 'internal'));
    assert.equal(result.unknownQueue.length, 0);

    const personPath = join(tmpDir, 'people', 'internal', 'sam-teammate.md');
    assert.equal(existsSync(personPath), true);

    const meetingContent = readFileSync(meetingPath, 'utf8');
    assert.ok(meetingContent.includes('attendee_ids'));
    assert.ok(meetingContent.includes('sam-teammate'));
  });

  describe('qmd integration', () => {
    it('--skip-qmd produces qmd.skipped:true in JSON output', () => {
      writeFileSync(
        join(tmpDir, 'resources', 'meetings', '2026-02-20-qmd-test.md'),
        `---\ntitle: "QMD Test"\ndate: "2026-02-20"\n---\n\n# QMD Test\n\n**Attendees**: Mystery Attendee\n`,
        'utf8',
      );

      const stdout = runCli([
        'meeting',
        'process',
        '--latest',
        '--dry-run',
        '--skip-qmd',
        '--json',
      ], { cwd: tmpDir });

      const result = JSON.parse(stdout) as {
        success: boolean;
        qmd: { indexed: boolean; skipped: boolean };
      };

      assert.equal(result.success, true);
      assert.equal(result.qmd.skipped, true);
      assert.equal(result.qmd.indexed, false);
    });

    it('includes qmd field in JSON output even when nothing applied', () => {
      writeFileSync(
        join(tmpDir, 'resources', 'meetings', '2026-02-20-no-apply.md'),
        `---\ntitle: "No Apply"\ndate: "2026-02-20"\n---\n\n# No Apply\n\n**Attendees**: Unknown Person\n`,
        'utf8',
      );

      const stdout = runCli([
        'meeting',
        'process',
        '--latest',
        '--skip-qmd',
        '--json',
      ], { cwd: tmpDir });

      const result = JSON.parse(stdout) as {
        success: boolean;
        applied: Array<unknown>;
        qmd: { indexed: boolean; skipped: boolean };
      };

      assert.equal(result.success, true);
      // When nothing applied, qmd is always skipped (no write occurred)
      assert.equal(result.qmd.skipped, true);
      assert.equal(result.qmd.indexed, false);
    });
  });
});
