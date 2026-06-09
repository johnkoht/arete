/**
 * Phase 10a v2 migration engine tests (Step 4).
 *
 * Synthetic 20-row fixture mixing all v1→v2 patterns per the plan:
 *   - 4 "owner-twin" rows: same action voiced across 4 meetings with
 *     personSlug=owner → collapse into ONE v2 row with stakeholders
 *     extracted from text (AC1a).
 *   - 2 arrow-notation rows (one outbound, one inbound) → preserved as
 *     distinct rows (different counterparties → different hashes).
 *   - 3 natural-language rows ("to Dave", "with Anthony") that all
 *     resolve cleanly.
 *   - 2 ambiguous rows ("to Lindsay") → ambiguous: true, BLOCK apply.
 *   - 1 self-pattern row ("Note to self: ...") → direction='self',
 *     no Dave despite body mention (AC1b).
 *   - 2 self-fallback rows (generic, no name) → direction='self'.
 *   - 2 status-conflict rows: same action, one resolved + one open →
 *     group resolves with earliest resolvedAt.
 *   - 4 plain pass-through rows: distinct counterparties, no collapses.
 *
 * Total = 20. The engine should:
 *   - Output the right summary counts.
 *   - Collapse owner-twins into 1 canonical with all 4 source_meetings.
 *   - Block apply on ambiguous rows (after: null).
 *   - Detect status-conflict.
 *   - Be idempotent on its own output.
 *   - Honor sidecar disambiguations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Commitment } from '../../../src/models/index.js';
import {
  migrateCommitmentsToV2,
  formatMigrationDiff,
  type Disambiguations,
} from '../../../src/services/migrations/migrate-to-v2.js';
import { buildPersonDirectory } from '../../../src/services/commitments-counterparty-parser.js';

const OWNER = 'john-koht';

function legacyCommitment(overrides: Partial<Commitment>): Commitment {
  const base: Commitment = {
    id: 'a'.repeat(64),
    text: 'placeholder',
    direction: 'i_owe_them',
    personSlug: 'someone',
    personName: 'Someone',
    source: 'meeting-x.md',
    date: '2026-05-01',
    createdAt: '2026-05-01',
    status: 'open',
    resolvedAt: null,
  };
  return { ...base, ...overrides };
}

function buildFixture(): Commitment[] {
  return [
    // ---- 4 owner-twin rows (same action, owner as personSlug, 4 mtgs)
    legacyCommitment({
      id: '01'.repeat(32),
      text: 'Talk to Dave about staffing',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-01.md',
      date: '2026-05-01',
      createdAt: '2026-05-01',
    }),
    legacyCommitment({
      id: '02'.repeat(32),
      text: 'Going to talk to Dave about staffing',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-03.md',
      date: '2026-05-03',
      createdAt: '2026-05-03',
    }),
    legacyCommitment({
      id: '03'.repeat(32),
      text: "I'll talk to Dave about staffing",
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-05.md',
      date: '2026-05-05',
      createdAt: '2026-05-05',
    }),
    legacyCommitment({
      id: '04'.repeat(32),
      text: 'Talked to Dave about staffing',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-07.md',
      date: '2026-05-07',
      createdAt: '2026-05-07',
    }),

    // ---- 2 arrow-notation rows (different counterparties)
    legacyCommitment({
      id: '05'.repeat(32),
      text: '[@john-koht → @dave-wiedenheft] Send the FY25 deck',
      personSlug: 'dave-wiedenheft',
      personName: 'Dave Wiedenheft',
      direction: 'i_owe_them',
      source: 'slack-digest-2026-05-09.md',
      date: '2026-05-09',
      createdAt: '2026-05-09',
    }),
    legacyCommitment({
      id: '06'.repeat(32),
      text: '@john-koht ← @anthony-avina: Reply on UK email',
      personSlug: 'anthony-avina',
      personName: 'Anthony Avina',
      direction: 'they_owe_me',
      source: 'slack-digest-2026-05-09.md',
      date: '2026-05-09',
      createdAt: '2026-05-09',
    }),

    // ---- 3 natural-language rows (all resolve cleanly)
    legacyCommitment({
      id: '07'.repeat(32),
      text: 'Send the staffing plan to Dave by Friday',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-10.md',
      date: '2026-05-10',
      createdAt: '2026-05-10',
    }),
    legacyCommitment({
      id: '08'.repeat(32),
      text: 'Follow up with Anthony on the spec',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-11.md',
      date: '2026-05-11',
      createdAt: '2026-05-11',
    }),
    legacyCommitment({
      id: '09'.repeat(32),
      text: 'Get the deck from Anthony by EOW',
      personSlug: OWNER,
      personName: 'John Koht',
      direction: 'they_owe_me',
      source: 'meeting-2026-05-12.md',
      date: '2026-05-12',
      createdAt: '2026-05-12',
    }),

    // ---- 2 ambiguous rows ("to Lindsay" — two candidates)
    legacyCommitment({
      id: '10'.repeat(32),
      text: 'Deliver POP MVP project plan to Lindsay',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-13.md',
      date: '2026-05-13',
      createdAt: '2026-05-13',
    }),
    legacyCommitment({
      id: '11'.repeat(32),
      text: 'Schedule sync with Lindsay next week',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-14.md',
      date: '2026-05-14',
      createdAt: '2026-05-14',
    }),

    // ---- 1 self-pattern row (AC1b: body mention of Dave does NOT
    //                          make Dave a recipient)
    legacyCommitment({
      id: '12'.repeat(32),
      text: 'Note to self: prep for Dave review',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-15.md',
      date: '2026-05-15',
      createdAt: '2026-05-15',
    }),

    // ---- 2 self-fallback rows (generic, no name)
    legacyCommitment({
      id: '13'.repeat(32),
      text: 'Run POP Glance 2.0 story mapping workshop',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-16.md',
      date: '2026-05-16',
      createdAt: '2026-05-16',
    }),
    legacyCommitment({
      id: '14'.repeat(32),
      text: 'Review Q3 dashboard metrics',
      personSlug: OWNER,
      personName: 'John Koht',
      source: 'meeting-2026-05-17.md',
      date: '2026-05-17',
      createdAt: '2026-05-17',
    }),

    // ---- 2 status-conflict rows (same action, mixed status)
    legacyCommitment({
      id: '15'.repeat(32),
      text: 'Ping Caroline on the UK signature decision',
      personSlug: 'caroline-mullineaux',
      personName: 'Caroline Mullineaux',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-18.md',
      date: '2026-05-18',
      createdAt: '2026-05-18',
      status: 'resolved',
      resolvedAt: '2026-05-22T12:00:00.000Z',
    }),
    legacyCommitment({
      id: '16'.repeat(32),
      text: 'Ping Caroline on the UK signature decision',
      personSlug: 'caroline-mullineaux',
      personName: 'Caroline Mullineaux',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-20.md',
      date: '2026-05-20',
      createdAt: '2026-05-20',
      status: 'open',
      resolvedAt: null,
    }),

    // ---- 4 pass-through rows (distinct counterparties, no collapse)
    legacyCommitment({
      id: '17'.repeat(32),
      text: 'Schedule comms sync with Tim',
      personSlug: 'tim-gray',
      personName: 'Tim Gray',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-21.md',
      date: '2026-05-21',
      createdAt: '2026-05-21',
    }),
    legacyCommitment({
      id: '18'.repeat(32),
      text: 'Draft FY25 OKR proposal for Bryan',
      personSlug: 'bryan-omalley',
      personName: 'Bryan OMalley',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-22.md',
      date: '2026-05-22',
      createdAt: '2026-05-22',
    }),
    legacyCommitment({
      id: '19'.repeat(32),
      text: 'Confirm meeting room booking with Becca',
      personSlug: 'becca-emmons',
      personName: 'Becca Emmons',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-23.md',
      date: '2026-05-23',
      createdAt: '2026-05-23',
    }),
    legacyCommitment({
      id: '20'.repeat(32),
      text: 'Share Q4 retrospective doc with Brett',
      personSlug: 'brett-hughes',
      personName: 'Brett Hughes',
      direction: 'i_owe_them',
      source: 'meeting-2026-05-24.md',
      date: '2026-05-24',
      createdAt: '2026-05-24',
    }),
  ];
}

function buildDirectory() {
  return buildPersonDirectory([
    { slug: 'lindsay-calar', name: 'Lindsay Calar' },
    { slug: 'lindsay-gray', name: 'Lindsay Gray' },
    { slug: 'dave-wiedenheft', name: 'Dave Wiedenheft' },
    { slug: 'anthony-avina', name: 'Anthony Avina' },
    { slug: 'caroline-mullineaux', name: 'Caroline Mullineaux' },
    { slug: 'john-koht', name: 'John Koht' },
    { slug: 'tim-gray', name: 'Tim Gray' },
    { slug: 'bryan-omalley', name: 'Bryan OMalley' },
    { slug: 'becca-emmons', name: 'Becca Emmons' },
    { slug: 'brett-hughes', name: 'Brett Hughes' },
  ]);
}

describe('migrateCommitmentsToV2 — 20-row synthetic fixture', () => {
  it('summary counts match the fixture composition', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    // 4 owner-twins collapse to 1 'collapsed' group
    // 1 status-conflict group (2 rows)
    // 1 self-pattern (1 row) → self-rewrite (direction shifted)
    // 2 self-fallback (1 row each) → self-rewrite × 2
    // 2 ambiguous (each its own ambiguous entry)
    // 2 arrow rows: AC1a routes Dave row; Anthony row already 'they_owe_me'
    //              → ambiguity-free pass-through entries each.
    // 3 natural-language rows: all single-row groups, pass-through.
    // 4 simple pass-through rows.
    //
    // Recap: 13 rows resolve cleanly + 5 ambiguous-or-self-rewritten
    // (1 self-pattern, 2 self-fallback = 3 self-rewrite; 2 ambiguous).
    // Total IN = 20; resolvable rows produce buckets.

    assert.equal(result.summary.totalIn, 20);
    assert.equal(result.summary.ambiguous, 2);
    assert.equal(result.summary.collapsed, 1, 'owner-twin group');
    assert.equal(result.summary.statusConflict, 1, 'caroline same-action group');
    assert.equal(
      result.summary.selfRewrite,
      3,
      '1 self-pattern + 2 self-fallback rows',
    );
  });

  it('owner-twin group: 4 input rows collapse into 1 v2 canonical with all source_meetings', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const collapsed = result.diff.find((d) => d.category === 'collapsed');
    assert.ok(collapsed, 'expected a collapsed group');
    assert.equal(collapsed!.before.length, 4);

    const canon = collapsed!.after!;
    assert.ok(canon.source_meetings);
    assert.equal(canon.source_meetings!.length, 4);
    // Canonical = oldest by date ('2026-05-01')
    assert.equal(canon.date, '2026-05-01');
    // textVariants captures all 4 distinct wordings (cap 5 not yet hit)
    assert.equal(canon.textVariants!.length, 4);
    // stakeholders: parser resolves "Dave" → dave-wiedenheft (recipient)
    assert.ok(canon.stakeholders);
    assert.ok(
      canon.stakeholders!.some((s) => s.slug === 'dave-wiedenheft'),
      'Dave should be in stakeholders (AC1a — owner-as-personSlug repair)',
    );
    // Owner is NOT in stakeholders
    assert.ok(
      !canon.stakeholders!.some((s) => s.slug === OWNER),
      'owner must not appear as a stakeholder when text resolves a counterparty',
    );
  });

  it('arrow-notation rows produce two distinct v2 rows with correct roles', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    // Find the Dave / FY25 deck row (id 05)
    const daveRow = result.diff.find(
      (d) => d.after && d.after.id.startsWith('0505'),
    );
    assert.ok(daveRow);
    const dave = daveRow!.after!;
    assert.equal(dave.stakeholders?.[0].slug, 'dave-wiedenheft');
    assert.equal(dave.stakeholders?.[0].role, 'recipient');

    // Find Anthony / UK email row (id 06)
    const anthonyRow = result.diff.find(
      (d) => d.after && d.after.id.startsWith('0606'),
    );
    assert.ok(anthonyRow);
    const anthony = anthonyRow!.after!;
    assert.equal(anthony.stakeholders?.[0].slug, 'anthony-avina');
    assert.equal(anthony.stakeholders?.[0].role, 'sender');
  });

  it('ambiguous rows are surfaced separately with after=null', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const ambig = result.diff.filter((d) => d.category === 'ambiguous');
    assert.equal(ambig.length, 2);
    for (const a of ambig) {
      assert.equal(a.after, null);
      assert.ok(a.ambiguous);
      assert.equal(a.ambiguous![0].name, 'Lindsay');
      assert.deepEqual(
        [...a.ambiguous![0].candidates].sort(),
        ['lindsay-calar', 'lindsay-gray'],
      );
    }
  });

  it('self-pattern row: direction=self, Dave NOT a recipient (AC1b)', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const noteToSelf = result.diff.find(
      (d) => d.after && d.after.id.startsWith('1212'),
    );
    assert.ok(noteToSelf);
    const canon = noteToSelf!.after!;
    assert.equal(canon.direction, 'self');
    assert.equal(canon.stakeholders?.[0].slug, OWNER);
    assert.equal(canon.stakeholders?.[0].role, 'self');
    assert.ok(
      !canon.stakeholders!.some((s) => s.slug === 'dave-wiedenheft'),
      'AC1b: Dave must not be a recipient on "Note to self" rows',
    );
  });

  it('status-conflict group: mixed status → resolved + earliest resolvedAt', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const conflict = result.diff.find((d) => d.category === 'status-conflict');
    assert.ok(conflict);
    const canon = conflict!.after!;
    assert.equal(canon.status, 'resolved');
    assert.equal(canon.resolvedAt, '2026-05-22T12:00:00.000Z');
    assert.ok(
      conflict!.notes.some((n) => n.toLowerCase().includes('mixed')),
      'conflict note expected',
    );
  });

  it('sidecar disambiguations: ambiguous rows resolve when sidecar map provides slug', () => {
    const fixture = buildFixture();
    // Resolve both Lindsay ambiguous rows to lindsay-gray
    const sidecar: Disambiguations = new Map([
      [`${'10'.repeat(32)}::lindsay`, 'lindsay-gray'],
      [`${'11'.repeat(32)}::lindsay`, 'lindsay-calar'],
    ]);
    const result = migrateCommitmentsToV2({
      commitments: fixture,
      ownerSlug: OWNER,
      directory: buildDirectory(),
      disambiguations: sidecar,
    });
    assert.equal(result.summary.ambiguous, 0, 'sidecar resolved both rows');
    // Each Lindsay row now appears as a pass-through with its chosen slug.
    const row10 = result.diff.find(
      (d) => d.after && d.after.id.startsWith('1010'),
    );
    const row11 = result.diff.find(
      (d) => d.after && d.after.id.startsWith('1111'),
    );
    assert.equal(row10?.after?.stakeholders?.[0].slug, 'lindsay-gray');
    assert.equal(row11?.after?.stakeholders?.[0].slug, 'lindsay-calar');
  });

  it('idempotency: running on the migration output produces a fixed-point', () => {
    const first = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
      disambiguations: new Map([
        [`${'10'.repeat(32)}::lindsay`, 'lindsay-gray'],
        [`${'11'.repeat(32)}::lindsay`, 'lindsay-calar'],
      ]),
    });
    const second = migrateCommitmentsToV2({
      commitments: first.migrated,
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    // The second pass should NOT produce any collapsed/status-conflict
    // groups (the first pass already merged) and should be ambiguous-free
    // (sidecar already applied).
    assert.equal(second.summary.collapsed, 0);
    assert.equal(second.summary.statusConflict, 0);
    assert.equal(second.summary.ambiguous, 0);
    // Same number of canonical rows.
    assert.equal(first.migrated.length, second.migrated.length);
  });

  it('every output v2 row carries source_external: [] (Phase 11 reserved)', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    for (const c of result.migrated) {
      assert.deepEqual(c.source_external, [], `${c.id} must carry empty source_external`);
    }
  });

  it('every output v2 row carries non-empty textVariants', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    for (const c of result.migrated) {
      assert.ok(c.textVariants && c.textVariants.length >= 1);
      // Cap honored
      assert.ok(c.textVariants!.length <= 5);
    }
  });

  it('NO production data writes: engine returns in-memory result, no fs side effects', () => {
    // This test is trivial but documents the constraint — the engine
    // accepts a list and returns a list. There is no `await fs.writeFile`
    // anywhere in `migrateCommitmentsToV2`'s call graph.
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    assert.ok(Array.isArray(result.migrated));
    assert.ok(Array.isArray(result.diff));
  });
});

describe('formatMigrationDiff — markdown report shape', () => {
  it('renders header + summary + category sections', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const md = formatMigrationDiff(result, {
      workspaceRoot: '/tmp/fake',
      ownerSlug: OWNER,
      timestamp: '2026-06-04T12:00:00.000Z',
      mode: 'dry-run',
    });
    assert.ok(md.includes('Phase 10a migration diff — dry-run'));
    assert.ok(md.includes('## Summary'));
    assert.ok(md.includes('Total input rows: 20'));
    assert.ok(md.includes('## Ambiguous (user must disambiguate)'));
    assert.ok(md.includes('lindsay-calar'));
    assert.ok(md.includes('lindsay-gray'));
    // Collapsed section
    assert.ok(md.includes('Collapsed'));
    // Self-rewrite section
    assert.ok(md.includes('Self-rewrite'));
    // Pass-through section
    assert.ok(md.includes('Pass-through'));
  });

  it('delta-source breakdown appears when meta.deltaSources is provided (AC1g)', () => {
    const result = migrateCommitmentsToV2({
      commitments: buildFixture(),
      ownerSlug: OWNER,
      directory: buildDirectory(),
    });
    const md = formatMigrationDiff(result, {
      workspaceRoot: '/tmp/fake',
      ownerSlug: OWNER,
      timestamp: '2026-06-04T12:00:00.000Z',
      mode: 'delta',
      deltaSources: {
        newExtract: 5,
        manualResolve: 2,
        manualDrop: 0,
        manualCreate: 1,
      },
    });
    assert.ok(md.includes('## Delta-source breakdown'));
    assert.ok(md.includes('new-extract:    5'));
    assert.ok(md.includes('manual-resolve: 2'));
  });
});
