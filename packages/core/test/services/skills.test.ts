import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { StorageAdapter } from '../../src/storage/adapter.js';

import { SkillService } from '../../src/services/skills.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('SkillService.install (skills.sh)', () => {
  let workspaceDir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'arete-core-skills-'));
    mkdirSync(join(workspaceDir, '.agents', 'skills'), { recursive: true });
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('returns an error when npx exits successfully but installs no new skill', async () => {
    const fakeBinDir = join(workspaceDir, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    const fakeNpxPath = join(fakeBinDir, 'npx');
    writeFileSync(fakeNpxPath, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeNpxPath, 0o755);
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install('owner/repo', {
      source: 'owner/repo',
      workspaceRoot: workspaceDir,
      name: 'prd',
      yes: true,
    });

    assert.equal(result.installed, false);
    assert.match(
      result.error ?? '',
      /no new skill was detected/i,
      'should report that no skill was installed',
    );
  });

  it('fails fast when the requested skill name already exists', async () => {
    mkdirSync(join(workspaceDir, '.agents', 'skills', 'prd'), { recursive: true });

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install('owner/repo', {
      source: 'owner/repo',
      workspaceRoot: workspaceDir,
      name: 'prd',
      yes: true,
    });

    assert.equal(result.installed, false);
    assert.equal(result.error, 'Skill already installed: prd');
  });

  it('always passes --yes to skills add so install works without explicit --yes flag', async () => {
    const fakeBinDir = join(workspaceDir, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    const fakeNpxPath = join(fakeBinDir, 'npx');
    const script = [
      '#!/bin/sh',
      'ARGS="$*"',
      'case "$ARGS" in',
      '  *"--yes"*) ;;',
      '  *) exit 2 ;;',
      'esac',
      'mkdir -p "$PWD/.agents/skills/prd"',
      'cat > "$PWD/.agents/skills/prd/SKILL.md" <<\'EOF\'',
      '---',
      'name: prd',
      'description: test',
      '---',
      '',
      '# PRD',
      'EOF',
      'exit 0',
    ].join('\n');
    writeFileSync(fakeNpxPath, script, 'utf8');
    chmodSync(fakeNpxPath, 0o755);
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install('owner/repo', {
      source: 'owner/repo',
      workspaceRoot: workspaceDir,
      name: 'prd',
    });

    assert.equal(result.installed, true);
    assert.equal(result.name, 'prd');
    assert.ok(existsSync(join(workspaceDir, '.agents', 'skills', 'prd', 'SKILL.md')));
  });
});

// ---------------------------------------------------------------------------
// Helpers for getInfo() integration tests — use a mock StorageAdapter to
// avoid touching the real filesystem and keep tests focused.
// ---------------------------------------------------------------------------

type FileMap = Record<string, string>;

function makeMockStorage(files: FileMap): StorageAdapter {
  return {
    read: async (p: string) => files[p] ?? null,
    write: async () => {},
    exists: async (p: string) => Object.prototype.hasOwnProperty.call(files, p),
    list: async () => [],
    listSubdirectories: async () => [],
    mkdir: async () => {},
    delete: async () => {},
  } as unknown as StorageAdapter;
}

const SKILL_PATH = '/workspace/.agents/skills/my-skill';
const SKILL_MD = join(SKILL_PATH, 'SKILL.md');
const ARETE_META = join(SKILL_PATH, '.arete-meta.yaml');

function makeSkillMd(extra = ''): string {
  return [
    '---',
    'name: My Skill',
    'description: A test skill',
    'triggers:',
    '  - "do the thing"',
    extra,
    '---',
    '# My Skill',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

describe('SkillService.getInfo() — integration field', () => {
  it('returns undefined integration when SKILL.md has no integration key', async () => {
    const storage = makeMockStorage({ [SKILL_MD]: makeSkillMd() });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);
    assert.equal(def.integration, undefined);
  });

  it('reads integration from SKILL.md frontmatter', async () => {
    const skillMd = makeSkillMd(
      [
        'integration:',
        '  outputs:',
        '    - type: project',
        '      path: projects/my-project',
        '      index: true',
        '  contextUpdates:',
        '    - context/notes.md',
      ].join('\n'),
    );
    const storage = makeMockStorage({ [SKILL_MD]: skillMd });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);

    assert.ok(def.integration, 'integration should be defined');
    assert.equal(def.integration?.outputs?.length, 1);
    assert.equal(def.integration?.outputs?.[0].type, 'project');
    assert.equal(def.integration?.outputs?.[0].path, 'projects/my-project');
    assert.equal(def.integration?.outputs?.[0].index, true);
    assert.deepEqual(def.integration?.contextUpdates, ['context/notes.md']);
  });

  it('reads integration from .arete-meta.yaml sidecar', async () => {
    const meta = [
      'category: community',
      'integration:',
      '  outputs:',
      '    - type: resource',
      '      path: resources/output.md',
    ].join('\n');
    const storage = makeMockStorage({
      [SKILL_MD]: makeSkillMd(),
      [ARETE_META]: meta,
    });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);

    assert.ok(def.integration, 'integration should be defined from sidecar');
    assert.equal(def.integration?.outputs?.[0].type, 'resource');
    assert.equal(def.integration?.outputs?.[0].path, 'resources/output.md');
  });

  it('sidecar integration replaces frontmatter integration entirely', async () => {
    const skillMd = makeSkillMd(
      [
        'integration:',
        '  outputs:',
        '    - type: project',
        '      path: projects/fm-project',
      ].join('\n'),
    );
    const meta = [
      'integration:',
      '  outputs:',
      '    - type: context',
      '      path: context/sidecar.md',
    ].join('\n');
    const storage = makeMockStorage({
      [SKILL_MD]: skillMd,
      [ARETE_META]: meta,
    });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);

    assert.ok(def.integration, 'integration should be defined');
    assert.equal(def.integration?.outputs?.length, 1);
    // Sidecar wins — frontmatter 'project' type should NOT appear
    assert.equal(def.integration?.outputs?.[0].type, 'context');
    assert.equal(def.integration?.outputs?.[0].path, 'context/sidecar.md');
  });

  it('treats integration as undefined when it is not an object (string value)', async () => {
    const skillMd = makeSkillMd('integration: "bad-string-value"');
    const storage = makeMockStorage({ [SKILL_MD]: skillMd });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);
    assert.equal(def.integration, undefined);
  });

  it('treats integration as undefined when outputs is present but not an array', async () => {
    const skillMd = makeSkillMd(
      ['integration:', '  outputs: "not-an-array"'].join('\n'),
    );
    const storage = makeMockStorage({ [SKILL_MD]: skillMd });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);
    assert.equal(def.integration, undefined);
  });

  it('treats integration as undefined when value is an array (not an object)', async () => {
    const skillMd = makeSkillMd(
      ['integration:', '  - type: project'].join('\n'),
    );
    const storage = makeMockStorage({ [SKILL_MD]: skillMd });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);
    assert.equal(def.integration, undefined);
  });

  it('existing .arete-meta.yaml without integration parses correctly (integration is undefined)', async () => {
    const meta = ['category: community', 'requires_briefing: true'].join('\n');
    const storage = makeMockStorage({
      [SKILL_MD]: makeSkillMd(),
      [ARETE_META]: meta,
    });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);
    assert.equal(def.integration, undefined);
    // Other fields from sidecar still read correctly
    assert.equal(def.category, 'community');
    assert.equal(def.requiresBriefing, true);
  });

  it('accepts unknown output type values without error', async () => {
    const skillMd = makeSkillMd(
      [
        'integration:',
        '  outputs:',
        '    - type: future-unknown-type',
        '      path: some/path',
      ].join('\n'),
    );
    const storage = makeMockStorage({ [SKILL_MD]: skillMd });
    const service = new SkillService(storage);
    const def = await service.getInfo(SKILL_PATH);

    assert.ok(def.integration, 'integration should be defined');
    assert.equal(def.integration?.outputs?.[0].type, 'future-unknown-type' as never);
  });
});

// ---------------------------------------------------------------------------
// Integration injection via install() — local path
// ---------------------------------------------------------------------------

describe('SkillService.install() integration injection (local path)', () => {
  let workspaceDir: string;
  let skillSourceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'arete-skill-inject-'));
    mkdirSync(join(workspaceDir, '.agents', 'skills'), { recursive: true });
    skillSourceDir = join(workspaceDir, 'my-skill-source');
    mkdirSync(skillSourceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('injects integration section into SKILL.md after local install when creates_project is true', async () => {
    writeFileSync(
      join(skillSourceDir, 'SKILL.md'),
      [
        '---',
        'name: My Skill',
        'description: A skill that creates a project',
        'creates_project: true',
        'project_template: default',
        '---',
        '',
        '# My Skill',
        '',
        'Do the thing.',
      ].join('\n'),
      'utf8',
    );

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install(skillSourceDir, { workspaceRoot: workspaceDir });

    assert.equal(result.installed, true, 'skill should be installed');

    const installedSkillMd = join(workspaceDir, '.agents', 'skills', 'my-skill-source', 'SKILL.md');
    const content = readFileSync(installedSkillMd, 'utf8');

    assert.ok(content.includes('<!-- ARETE_INTEGRATION_START -->'), 'should have integration start sentinel');
    assert.ok(content.includes('<!-- ARETE_INTEGRATION_END -->'), 'should have integration end sentinel');
    assert.ok(content.includes('## Areté Integration'), 'should have integration section heading');
    assert.ok(content.includes('projects/active/{name}/'), 'should reference project path');
  });

  it('does not inject section when skill has no integration profile', async () => {
    writeFileSync(
      join(skillSourceDir, 'SKILL.md'),
      [
        '---',
        'name: Simple Skill',
        'description: Just does a thing, no project',
        '---',
        '',
        '# Simple Skill',
      ].join('\n'),
      'utf8',
    );

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install(skillSourceDir, { workspaceRoot: workspaceDir });

    assert.equal(result.installed, true, 'skill should be installed');

    const installedSkillMd = join(workspaceDir, '.agents', 'skills', 'my-skill-source', 'SKILL.md');
    const content = readFileSync(installedSkillMd, 'utf8');

    assert.ok(!content.includes('ARETE_INTEGRATION_START'), 'should NOT have integration sentinels for skill with no profile');
  });

  it('injects integration section when explicit integration field is present in SKILL.md', async () => {
    writeFileSync(
      join(skillSourceDir, 'SKILL.md'),
      [
        '---',
        'name: Research Skill',
        'description: Saves research output',
        'integration:',
        '  outputs:',
        '    - type: resource',
        '      path: resources/research/',
        '      index: true',
        '---',
        '',
        '# Research Skill',
      ].join('\n'),
      'utf8',
    );

    const service = new SkillService(new FileStorageAdapter());
    const result = await service.install(skillSourceDir, { workspaceRoot: workspaceDir });

    assert.equal(result.installed, true, 'skill should be installed');

    const installedSkillMd = join(workspaceDir, '.agents', 'skills', 'my-skill-source', 'SKILL.md');
    const content = readFileSync(installedSkillMd, 'utf8');

    assert.ok(content.includes('## Areté Integration'), 'should have integration section');
    assert.ok(content.includes('resources/research/'), 'should reference resource path');
  });

  it('is idempotent — re-installing does not duplicate the section (already-installed guard kicks in)', async () => {
    // The install() method refuses to reinstall if skill already exists.
    // This tests that a "freshly inject" install followed by a second attempt returns an error, not duplication.
    writeFileSync(
      join(skillSourceDir, 'SKILL.md'),
      [
        '---',
        'name: My Skill',
        'description: Creates project',
        'creates_project: true',
        '---',
        '# My Skill',
      ].join('\n'),
      'utf8',
    );

    const service = new SkillService(new FileStorageAdapter());
    await service.install(skillSourceDir, { workspaceRoot: workspaceDir });

    // Second install should fail with "already installed"
    const second = await service.install(skillSourceDir, { workspaceRoot: workspaceDir });
    assert.equal(second.installed, false);
    assert.match(second.error ?? '', /already installed/i);

    // The SKILL.md should have exactly ONE start sentinel (not duplicated)
    const installedSkillMd = join(workspaceDir, '.agents', 'skills', 'my-skill-source', 'SKILL.md');
    const content = readFileSync(installedSkillMd, 'utf8');
    const occurrences = (content.match(/ARETE_INTEGRATION_START/g) ?? []).length;
    assert.equal(occurrences, 1, 'integration sentinel should appear exactly once');
  });
});
