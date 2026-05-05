/**
 * Tests for skill-resolver (Phase 2 — ARETE_LEGACY_SKILL_PROSE routing).
 *
 * Covers:
 * - parseLegacyList — undefined / empty / whitespace / commas / case
 * - resolveSkillFile — pure path resolution
 * - resolveSkillFileFromEnv — env-aware wrapper, no I/O
 * - resolveSkillFileWithFallback — I/O-aware, fallback when legacy missing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  parseLegacyList,
  resolveSkillFile,
  resolveSkillFileFromEnv,
  resolveSkillFileWithFallback,
} from '../../src/services/skill-resolver.js';

describe('parseLegacyList', () => {
  it('returns [] for undefined', () => {
    assert.deepEqual(parseLegacyList(undefined), []);
  });

  it('returns [] for empty string', () => {
    assert.deepEqual(parseLegacyList(''), []);
  });

  it('returns [] for whitespace-only string', () => {
    assert.deepEqual(parseLegacyList('   '), []);
  });

  it('parses single skill', () => {
    assert.deepEqual(parseLegacyList('daily-winddown'), ['daily-winddown']);
  });

  it('parses comma-separated list', () => {
    assert.deepEqual(
      parseLegacyList('daily-winddown,meeting-prep,week-plan'),
      ['daily-winddown', 'meeting-prep', 'week-plan'],
    );
  });

  it('tolerates whitespace around entries', () => {
    assert.deepEqual(
      parseLegacyList('  daily-winddown , meeting-prep ,week-plan  '),
      ['daily-winddown', 'meeting-prep', 'week-plan'],
    );
  });

  it('drops empty entries from trailing/double commas', () => {
    assert.deepEqual(
      parseLegacyList('daily-winddown,,meeting-prep,'),
      ['daily-winddown', 'meeting-prep'],
    );
  });

  it('lowercases entries (case-insensitive matching)', () => {
    assert.deepEqual(
      parseLegacyList('Daily-Winddown,MEETING-PREP'),
      ['daily-winddown', 'meeting-prep'],
    );
  });
});

describe('resolveSkillFile (pure path math)', () => {
  it('returns SKILL.md when slug not in legacy list', () => {
    const result = resolveSkillFile('/skills/daily-winddown', 'daily-winddown', []);
    assert.equal(result, join('/skills/daily-winddown', 'SKILL.md'));
  });

  it('returns SKILL.legacy.md when slug is in legacy list', () => {
    const result = resolveSkillFile('/skills/daily-winddown', 'daily-winddown', [
      'daily-winddown',
    ]);
    assert.equal(result, join('/skills/daily-winddown', 'SKILL.legacy.md'));
  });

  it('returns SKILL.md when other skills are in legacy list', () => {
    const result = resolveSkillFile('/skills/daily-winddown', 'daily-winddown', [
      'meeting-prep',
      'week-plan',
    ]);
    assert.equal(result, join('/skills/daily-winddown', 'SKILL.md'));
  });

  it('handles case-insensitively for the input slug', () => {
    const result = resolveSkillFile('/skills/dw', 'Daily-Winddown', ['daily-winddown']);
    assert.equal(result, join('/skills/dw', 'SKILL.legacy.md'));
  });
});

describe('resolveSkillFileFromEnv', () => {
  it('returns live path when env var unset', () => {
    const result = resolveSkillFileFromEnv('/skills/daily-winddown', 'daily-winddown', {});
    assert.equal(result.path, join('/skills/daily-winddown', 'SKILL.md'));
    assert.equal(result.legacy, false);
    assert.deepEqual(result.legacyList, []);
  });

  it('returns legacy path when env var routes the skill', () => {
    const result = resolveSkillFileFromEnv('/skills/daily-winddown', 'daily-winddown', {
      ARETE_LEGACY_SKILL_PROSE: 'daily-winddown',
    });
    assert.equal(result.path, join('/skills/daily-winddown', 'SKILL.legacy.md'));
    assert.equal(result.legacy, true);
    assert.deepEqual(result.legacyList, ['daily-winddown']);
  });

  it('handles multiple skills in env var', () => {
    const result = resolveSkillFileFromEnv('/skills/meeting-prep', 'meeting-prep', {
      ARETE_LEGACY_SKILL_PROSE: 'daily-winddown,meeting-prep,week-plan',
    });
    assert.equal(result.path, join('/skills/meeting-prep', 'SKILL.legacy.md'));
    assert.equal(result.legacy, true);
    assert.deepEqual(result.legacyList, [
      'daily-winddown',
      'meeting-prep',
      'week-plan',
    ]);
  });

  it('returns live path for skill NOT in env var list', () => {
    const result = resolveSkillFileFromEnv('/skills/process-meetings', 'process-meetings', {
      ARETE_LEGACY_SKILL_PROSE: 'daily-winddown,meeting-prep',
    });
    assert.equal(result.path, join('/skills/process-meetings', 'SKILL.md'));
    assert.equal(result.legacy, false);
  });

  it('handles non-existent skill gracefully (returns live path; existence not checked)', () => {
    const result = resolveSkillFileFromEnv('/skills/nonexistent', 'nonexistent', {
      ARETE_LEGACY_SKILL_PROSE: 'daily-winddown',
    });
    assert.equal(result.path, join('/skills/nonexistent', 'SKILL.md'));
    assert.equal(result.legacy, false);
  });
});

describe('resolveSkillFileWithFallback', () => {
  const skillDir = '/skills/daily-winddown';

  it('returns live SKILL.md when env var unset', async () => {
    const existsFn = (_p: string) => true;
    const result = await resolveSkillFileWithFallback(
      skillDir,
      'daily-winddown',
      existsFn,
      {},
    );
    assert.equal(result.path, join(skillDir, 'SKILL.md'));
    assert.equal(result.legacyRequested, false);
    assert.equal(result.legacyUsed, false);
    assert.equal(result.warning, undefined);
  });

  it('returns legacy SKILL.legacy.md when env var sets and file exists', async () => {
    const existsFn = (p: string) => p.endsWith('SKILL.legacy.md');
    const result = await resolveSkillFileWithFallback(
      skillDir,
      'daily-winddown',
      existsFn,
      { ARETE_LEGACY_SKILL_PROSE: 'daily-winddown' },
    );
    assert.equal(result.path, join(skillDir, 'SKILL.legacy.md'));
    assert.equal(result.legacyRequested, true);
    assert.equal(result.legacyUsed, true);
    assert.equal(result.warning, undefined);
  });

  it('falls back to live SKILL.md with warning when legacy file missing', async () => {
    const existsFn = (_p: string) => false;
    const result = await resolveSkillFileWithFallback(
      skillDir,
      'daily-winddown',
      existsFn,
      { ARETE_LEGACY_SKILL_PROSE: 'daily-winddown' },
    );
    assert.equal(result.path, join(skillDir, 'SKILL.md'));
    assert.equal(result.legacyRequested, true);
    assert.equal(result.legacyUsed, false);
    assert.match(result.warning ?? '', /falling back to live SKILL\.md/);
  });

  it('handles multiple skills in env var (only requested skill routes to legacy)', async () => {
    const existsFn = (p: string) => p.endsWith('SKILL.legacy.md');
    const result = await resolveSkillFileWithFallback(
      '/skills/process-meetings',
      'process-meetings',
      existsFn,
      { ARETE_LEGACY_SKILL_PROSE: 'daily-winddown,meeting-prep' },
    );
    // process-meetings is NOT in the env var list, so use live
    assert.equal(result.path, join('/skills/process-meetings', 'SKILL.md'));
    assert.equal(result.legacyRequested, false);
  });

  it('supports async existsFn', async () => {
    const existsFn = async (p: string) => p.endsWith('SKILL.legacy.md');
    const result = await resolveSkillFileWithFallback(
      skillDir,
      'daily-winddown',
      existsFn,
      { ARETE_LEGACY_SKILL_PROSE: 'daily-winddown' },
    );
    assert.equal(result.path, join(skillDir, 'SKILL.legacy.md'));
    assert.equal(result.legacyUsed, true);
  });
});
