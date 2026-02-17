import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

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
