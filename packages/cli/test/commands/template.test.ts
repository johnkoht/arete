import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

describe('template resolve command', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-template');
    runCli(['install', workspaceDir, '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('resolves skill-local template when no override exists', () => {
    const output = runCliRaw(['template', 'resolve', '--skill', 'create-prd', '--variant', 'prd-regular', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; skill: string; variant: string; content: string; relPath: string };

    assert.equal(result.success, true);
    assert.equal(result.skill, 'create-prd');
    assert.equal(result.variant, 'prd-regular');
    assert.ok(result.content.length > 0, 'content should be non-empty');
    assert.ok(result.relPath.includes('.agents/skills/create-prd/templates'), 'should resolve to skill-local path');
  });

  it('resolves workspace override when it exists', () => {
    // Place a custom override
    const overrideDir = join(workspaceDir, 'templates', 'outputs', 'create-prd');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'prd-regular.md'), '# My Custom PRD\n## Problem\n', 'utf-8');

    const output = runCliRaw(['template', 'resolve', '--skill', 'create-prd', '--variant', 'prd-regular', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; content: string; relPath: string };

    assert.equal(result.success, true);
    assert.equal(result.content, '# My Custom PRD\n## Problem\n');
    assert.ok(result.relPath.includes('templates/outputs/create-prd'), 'should resolve to workspace override path');
  });

  it('resolves agenda template for prepare-meeting-agenda skill', () => {
    const output = runCliRaw(['template', 'resolve', '--skill', 'prepare-meeting-agenda', '--variant', 'one-on-one', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; content: string; relPath: string };

    assert.equal(result.success, true);
    assert.ok(result.content.length > 0, 'content should be non-empty');
    assert.ok(result.relPath.includes('.agents/skills/prepare-meeting-agenda/templates'), 'should be skill-local');
  });

  it('returns --path only when flag is set', () => {
    const output = runCliRaw(['template', 'resolve', '--skill', 'create-prd', '--variant', 'prd-simple', '--path', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; resolvedPath: string };

    assert.equal(result.success, true);
    assert.ok(result.resolvedPath, 'resolvedPath should be present');
    assert.ok(!(result as Record<string, unknown>)['content'], 'content should not be present with --path');
  });

  it('exits with error for unknown skill', () => {
    const output = runCliRaw(['template', 'resolve', '--skill', 'nonexistent-skill', '--variant', 'prd-regular', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; error: string };

    assert.equal(result.success, false);
    assert.ok(result.error.includes('Unknown skill'));
  });

  it('exits with error for unknown variant', () => {
    const output = runCliRaw(['template', 'resolve', '--skill', 'create-prd', '--variant', 'nonexistent-variant', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; error: string };

    assert.equal(result.success, false);
    assert.ok(result.error.includes('Unknown variant'));
  });
});

describe('template list command', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-template-list');
    runCli(['install', workspaceDir, '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('lists all skills and variants', () => {
    const output = runCliRaw(['template', 'list', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; skills: { skill: string; variants: { variant: string; hasOverride: boolean }[] }[] };

    assert.equal(result.success, true);
    assert.ok(result.skills.length > 0, 'should list skills');

    const prd = result.skills.find(s => s.skill === 'create-prd');
    assert.ok(prd, 'create-prd should be listed');
    const variants = prd!.variants.map(v => v.variant);
    assert.ok(variants.includes('prd-regular'), 'prd-regular should be listed');
  });

  it('marks hasOverride correctly when override exists', () => {
    // No override yet
    const before = runCliRaw(['template', 'list', '--skill', 'create-prd', '--json'], { cwd: workspaceDir });
    const beforeResult = JSON.parse(before.stdout) as { success: boolean; skills: { skill: string; variants: { variant: string; hasOverride: boolean }[] }[] };
    const regularBefore = beforeResult.skills[0]!.variants.find(v => v.variant === 'prd-regular');
    assert.equal(regularBefore?.hasOverride, false, 'no override yet');

    // Place override
    const overrideDir = join(workspaceDir, 'templates', 'outputs', 'create-prd');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'prd-regular.md'), '# Custom', 'utf-8');

    const after = runCliRaw(['template', 'list', '--skill', 'create-prd', '--json'], { cwd: workspaceDir });
    const afterResult = JSON.parse(after.stdout) as { success: boolean; skills: { skill: string; variants: { variant: string; hasOverride: boolean }[] }[] };
    const regularAfter = afterResult.skills[0]!.variants.find(v => v.variant === 'prd-regular');
    assert.equal(regularAfter?.hasOverride, true, 'override should be detected');
  });
});

describe('template view command', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-template-view');
    runCli(['install', workspaceDir, '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('returns template content', () => {
    const output = runCliRaw(['template', 'view', '--skill', 'week-plan', '--variant', 'week-priorities', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean; content: string };

    assert.equal(result.success, true);
    assert.ok(result.content.length > 0, 'content should be non-empty');
  });

  it('errors for unknown skill', () => {
    const output = runCliRaw(['template', 'view', '--skill', 'bogus', '--variant', 'x', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output.stdout) as { success: boolean };
    assert.equal(result.success, false);
  });
});
