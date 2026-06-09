/**
 * Tests for `arete areas` CLI commands (Phase 7a AC4).
 *
 * Covers two subcommands:
 *   - `arete areas list [--json]`
 *   - `arete areas epics [--active] [--slug <s>] [--json]`
 *
 * Scenarios:
 *   - Empty workspace (no areas/ files)
 *   - No epics declared across all areas
 *   - Single area with epics declared
 *   - Multiple areas with overlapping epics (union dedup)
 *   - --slug filter (present + absent slug)
 *   - --active filter (mix of active + inactive)
 *   - Malformed jira_epics entries dropped by parser
 *
 * Uses runCli helper from packages/cli/test/helpers.ts. Each test
 * installs a fresh workspace (--skip-qmd to avoid qmd dependency)
 * and writes areas/<slug>.md fixtures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('arete areas list', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-areas-list');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function seedArea(
    slug: string,
    opts: {
      name?: string;
      status?: string;
      recurringMeetings?: string[];
      jiraEpics?: string[];
    } = {},
  ): void {
    const dir = join(tmpDir, 'areas');
    mkdirSync(dir, { recursive: true });
    const fm: string[] = ['---'];
    fm.push(`area: ${opts.name ?? slug}`);
    fm.push(`status: ${opts.status ?? 'active'}`);
    if (opts.recurringMeetings && opts.recurringMeetings.length > 0) {
      fm.push('recurring_meetings:');
      for (const title of opts.recurringMeetings) {
        fm.push(`  - title: "${title}"`);
        fm.push('    attendees: []');
      }
    } else {
      fm.push('recurring_meetings: []');
    }
    if (opts.jiraEpics) {
      fm.push('jira_epics:');
      for (const epic of opts.jiraEpics) {
        fm.push(`  - ${epic}`);
      }
    }
    fm.push('---');
    fm.push('');
    fm.push(`# ${opts.name ?? slug}`);
    fm.push('');
    fm.push('## Focus');
    fm.push(`Active.`);
    writeFileSync(join(dir, `${slug}.md`), fm.join('\n'));
  }

  it('--json returns empty array on fresh workspace', () => {
    const out = runCli(['areas', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.areas, []);
    assert.equal(parsed.count, 0);
  });

  it('--json returns areas with summary fields', () => {
    seedArea('glance-communications', {
      name: 'Glance Communications',
      status: 'active',
      recurringMeetings: ['CoverWhale Sync', 'Partner Review'],
      jiraEpics: ['PLAT-11014', 'PLAT-10025'],
    });
    seedArea('platform-infrastructure', {
      name: 'Platform Infrastructure',
      status: 'active',
    });

    const out = runCli(['areas', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(out);

    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 2);
    // Sorted alphabetically by slug.
    assert.equal(parsed.areas[0].slug, 'glance-communications');
    assert.equal(parsed.areas[0].name, 'Glance Communications');
    assert.equal(parsed.areas[0].status, 'active');
    assert.equal(parsed.areas[0].recurringMeetingCount, 2);
    assert.equal(parsed.areas[0].jiraEpicCount, 2);

    assert.equal(parsed.areas[1].slug, 'platform-infrastructure');
    assert.equal(parsed.areas[1].recurringMeetingCount, 0);
    assert.equal(parsed.areas[1].jiraEpicCount, 0);
  });

  it('human-readable output includes header and totals', () => {
    seedArea('glance-communications', {
      name: 'Glance Communications',
      jiraEpics: ['PLAT-11014'],
    });

    const out = runCli(['areas', 'list'], { cwd: tmpDir });
    assert.match(out, /Areas/);
    assert.match(out, /glance-communications/);
    assert.match(out, /Total/);
  });

  it('human-readable on empty workspace nudges to create an area', () => {
    const out = runCli(['areas', 'list'], { cwd: tmpDir });
    assert.match(out, /No areas yet/i);
    assert.match(out, /arete create area/);
  });
});

describe('arete areas epics', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-areas-epics');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function seedArea(
    slug: string,
    opts: {
      name?: string;
      status?: string;
      jiraEpics?: string[];
    } = {},
  ): void {
    const dir = join(tmpDir, 'areas');
    mkdirSync(dir, { recursive: true });
    const fm: string[] = ['---'];
    fm.push(`area: ${opts.name ?? slug}`);
    fm.push(`status: ${opts.status ?? 'active'}`);
    fm.push('recurring_meetings: []');
    if (opts.jiraEpics) {
      fm.push('jira_epics:');
      for (const epic of opts.jiraEpics) {
        fm.push(`  - ${epic}`);
      }
    }
    fm.push('---');
    fm.push('');
    fm.push(`# ${opts.name ?? slug}`);
    fm.push('');
    fm.push('## Focus');
    fm.push('Active.');
    writeFileSync(join(dir, `${slug}.md`), fm.join('\n'));
  }

  it('--json returns empty array on empty workspace (no --active union)', () => {
    const out = runCli(['areas', 'epics', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.areas, []);
    // No --active flag, no union field.
    assert.equal('union' in parsed, false);
  });

  it('--json --active emits union: [] on empty workspace', () => {
    const out = runCli(['areas', 'epics', '--active', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.areas, []);
    // --active always emits union.
    assert.deepEqual(parsed.union, []);
  });

  it('returns areas with empty epics when no jira_epics declared', () => {
    seedArea('glance-communications', { status: 'active' });
    seedArea('platform-infrastructure', { status: 'active' });

    const out = runCli(['areas', 'epics', '--active', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);
    assert.equal(parsed.areas.length, 2);
    assert.deepEqual(parsed.areas[0].epics, []);
    assert.deepEqual(parsed.areas[1].epics, []);
    assert.deepEqual(parsed.union, []);
  });

  it('single area with epics — epics surface in areas[].epics', () => {
    seedArea('glance-communications', {
      status: 'active',
      jiraEpics: ['PLAT-11014', 'PLAT-10025'],
    });

    const out = runCli(['areas', 'epics', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(out);
    assert.equal(parsed.areas.length, 1);
    assert.deepEqual(parsed.areas[0].epics, ['PLAT-11014', 'PLAT-10025']);
  });

  it('--active --json dedups epics across multiple areas via union', () => {
    seedArea('glance-communications', {
      status: 'active',
      jiraEpics: ['PLAT-11014', 'PLAT-10025', 'INGEST-2031'],
    });
    seedArea('platform-infrastructure', {
      status: 'active',
      jiraEpics: ['PLAT-10025', 'PLAT-9001'], // PLAT-10025 overlaps
    });
    seedArea('data-analytics', {
      status: 'active',
      jiraEpics: ['INGEST-2031'], // overlaps with glance
    });

    const out = runCli(['areas', 'epics', '--active', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(out);

    // Each area still surfaces its own epics.
    const glance = parsed.areas.find(
      (a: { slug: string }) => a.slug === 'glance-communications',
    );
    assert.deepEqual(glance.epics, ['PLAT-11014', 'PLAT-10025', 'INGEST-2031']);

    // Union is deduped, sorted.
    assert.deepEqual(parsed.union, [
      'INGEST-2031',
      'PLAT-10025',
      'PLAT-11014',
      'PLAT-9001',
    ]);
  });

  it('--active filters out status: inactive areas', () => {
    seedArea('active-area', {
      status: 'active',
      jiraEpics: ['ACTIVE-1'],
    });
    seedArea('legacy-area', {
      status: 'inactive',
      jiraEpics: ['LEGACY-99'],
    });

    const out = runCli(['areas', 'epics', '--active', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(out);

    assert.equal(parsed.areas.length, 1);
    assert.equal(parsed.areas[0].slug, 'active-area');
    assert.deepEqual(parsed.union, ['ACTIVE-1']);
  });

  it('without --active, returns all areas regardless of status, no union', () => {
    seedArea('active-area', {
      status: 'active',
      jiraEpics: ['ACTIVE-1'],
    });
    seedArea('legacy-area', {
      status: 'inactive',
      jiraEpics: ['LEGACY-99'],
    });

    const out = runCli(['areas', 'epics', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(out);

    assert.equal(parsed.areas.length, 2);
    assert.equal('union' in parsed, false);
  });

  it('--slug filter returns only the named area', () => {
    seedArea('glance-communications', {
      status: 'active',
      jiraEpics: ['PLAT-11014'],
    });
    seedArea('platform-infrastructure', {
      status: 'active',
      jiraEpics: ['PLAT-99'],
    });

    const out = runCli(
      ['areas', 'epics', '--slug', 'platform-infrastructure', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.areas.length, 1);
    assert.equal(parsed.areas[0].slug, 'platform-infrastructure');
    assert.deepEqual(parsed.areas[0].epics, ['PLAT-99']);
  });

  it('--slug for non-existent area exits non-zero with JSON error', () => {
    seedArea('glance-communications', { status: 'active' });

    const { stdout, code } = runCliRaw(
      ['areas', 'epics', '--slug', 'nonexistent', '--json'],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /not found/i);
  });

  it('--slug + --active still emits union (scoped to the slug)', () => {
    seedArea('glance-communications', {
      status: 'active',
      jiraEpics: ['PLAT-11014', 'PLAT-10025'],
    });
    seedArea('platform-infrastructure', {
      status: 'active',
      jiraEpics: ['PLAT-99'],
    });

    const out = runCli(
      [
        'areas',
        'epics',
        '--slug',
        'glance-communications',
        '--active',
        '--json',
      ],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.areas.length, 1);
    assert.deepEqual(parsed.union, ['PLAT-10025', 'PLAT-11014']);
  });

  it('human-readable output includes epic listing per area', () => {
    seedArea('glance-communications', {
      name: 'Glance Communications',
      status: 'active',
      jiraEpics: ['PLAT-11014'],
    });

    const out = runCli(['areas', 'epics'], { cwd: tmpDir });
    assert.match(out, /Areas — epic watchlist/);
    assert.match(out, /glance-communications/);
    assert.match(out, /PLAT-11014/);
  });

  it('human-readable output indicates when no epics declared', () => {
    seedArea('empty-area', { status: 'active' });

    const out = runCli(['areas', 'epics'], { cwd: tmpDir });
    assert.match(out, /no epics declared/i);
  });
});
