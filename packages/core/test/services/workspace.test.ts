/**
 * Tests for WorkspaceService and compat workspace functions.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  isAreteWorkspace,
  findWorkspaceRoot,
  getWorkspacePaths,
  parseSourceType,
} from '../../src/compat/workspace.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { WorkspaceService } from '../../src/services/workspace.js';
import { BASE_WORKSPACE_DIRS, DEFAULT_FILES } from '../../src/workspace-structure.js';

function createTmpDir(): string {
  const dir = join(
    tmpdir(),
    `arete-test-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('workspace compat', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('isAreteWorkspace', () => {
    it('returns true when arete.yaml exists', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      assert.equal(isAreteWorkspace(tmpDir), true);
    });

    it('returns true when .cursor + context + .arete/memory exist', () => {
      mkdirSync(join(tmpDir, '.cursor'), { recursive: true });
      mkdirSync(join(tmpDir, 'context'), { recursive: true });
      mkdirSync(join(tmpDir, '.arete', 'memory'), { recursive: true });
      assert.equal(isAreteWorkspace(tmpDir), true);
    });

    it('returns false for empty directory', () => {
      assert.equal(isAreteWorkspace(tmpDir), false);
    });
  });

  describe('findWorkspaceRoot', () => {
    it('finds workspace in current directory', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = findWorkspaceRoot(tmpDir);
      assert.equal(result, tmpDir);
    });

    it('returns null when no workspace found', () => {
      const result = findWorkspaceRoot(tmpDir);
      assert.equal(result, null);
    });
  });

  describe('getWorkspacePaths', () => {
    it('returns all expected paths', () => {
      const paths = getWorkspacePaths('/test/workspace');
      assert.equal(paths.root, '/test/workspace');
      assert.equal(paths.manifest, join('/test/workspace', 'arete.yaml'));
      assert.equal(paths.agentSkills, join('/test/workspace', '.agents', 'skills'));
      assert.equal(paths.context, join('/test/workspace', 'context'));
      assert.equal(paths.memory, join('/test/workspace', '.arete', 'memory'));
    });
  });

  describe('parseSourceType', () => {
    it('parses "npm" source', () => {
      const result = parseSourceType('npm');
      assert.equal(result.type, 'npm');
      assert.equal(result.path, null);
    });

    it('parses "local:" source', () => {
      const result = parseSourceType('local:/some/path');
      assert.equal(result.type, 'local');
      assert.ok(
        result.path!.endsWith('/some/path') || result.path!.includes('some/path')
      );
    });

    it('throws on unknown source type', () => {
      assert.throws(() => parseSourceType('unknown'), {
        message: /Unknown source type/,
      });
    });
  });
});

describe('WorkspaceService', () => {
  let tmpDir: string;
  let service: WorkspaceService;

  beforeEach(() => {
    tmpDir = createTmpDir();
    service = new WorkspaceService(new FileStorageAdapter());
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('isWorkspace', () => {
    it('returns true when arete.yaml exists', async () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = await service.isWorkspace(tmpDir);
      assert.equal(result, true);
    });

    it('returns false for empty directory', async () => {
      const result = await service.isWorkspace(tmpDir);
      assert.equal(result, false);
    });
  });

  describe('findRoot', () => {
    it('finds workspace', async () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = await service.findRoot(tmpDir);
      assert.equal(result, tmpDir);
    });

    it('returns null when no workspace', async () => {
      const result = await service.findRoot(tmpDir);
      assert.equal(result, null);
    });
  });

  describe('getPaths', () => {
    it('returns WorkspacePaths', () => {
      const paths = service.getPaths('/test/root');
      assert.equal(paths.root, '/test/root');
      assert.equal(paths.manifest, join('/test/root', 'arete.yaml'));
      assert.equal(paths.agentSkills, join('/test/root', '.agents', 'skills'));
    });
  });

  describe('create', () => {
    it('creates workspace structure', async () => {
      const result = await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });
      assert.ok(result.directories.length > 0);
      assert.ok(result.files.length > 0);
      const manifestExists = existsSync(join(tmpDir, 'arete.yaml'));
      assert.equal(manifestExists, true);
    });

    it('creates default context files', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const expectedContextFiles = [
        'business-overview.md',
        'business-model.md',
        'competitive-landscape.md',
        'products-services.md',
        'users-personas.md',
      ];

      for (const filename of expectedContextFiles) {
        const fullPath = join(tmpDir, 'context', filename);
        assert.equal(existsSync(fullPath), true, `Expected ${filename} to exist`);
        const content = readFileSync(fullPath, 'utf8');
        assert.ok(content.length > 20, `Expected ${filename} to have starter content`);
      }
    });

    it('creates credentials example file', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const examplePath = join(tmpDir, '.credentials', 'credentials.yaml.example');
      assert.equal(existsSync(examplePath), true);
      const content = readFileSync(examplePath, 'utf8');
      assert.ok(content.includes('fathom:'));
      assert.ok(content.includes('api_key:'));
    });

    it('copies tools from sourcePaths.tools to the IDE tools directory (regression: tools dropped in CLI refactor e3bc217)', async () => {
      // Set up a fake source tools directory with one tool
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceTools = join(sourceRoot, 'tools');
      mkdirSync(join(sourceTools, 'onboarding'), { recursive: true });
      writeFileSync(
        join(sourceTools, 'onboarding', 'TOOL.md'),
        '# Onboarding Tool\n',
        'utf8',
      );

      const result = await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: join(sourceRoot, 'skills'),
          tools: sourceTools,
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // Tool should be copied to .cursor/tools/onboarding/
      const toolPath = join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md');
      assert.equal(existsSync(toolPath), true, '.cursor/tools/onboarding/TOOL.md should exist after install');
      const content = readFileSync(toolPath, 'utf8');
      assert.ok(content.includes('Onboarding Tool'));
      assert.ok(result.tools.includes('onboarding'), `Expected "onboarding" in result.tools, got: ${JSON.stringify(result.tools)}`);
    });

    it('copies tools to .claude/tools/ when ide is claude', async () => {
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceTools = join(sourceRoot, 'tools');
      mkdirSync(join(sourceTools, 'onboarding'), { recursive: true });
      writeFileSync(join(sourceTools, 'onboarding', 'TOOL.md'), '# Onboarding Tool\n', 'utf8');

      await service.create(tmpDir, {
        ideTarget: 'claude',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: join(sourceRoot, 'skills'),
          tools: sourceTools,
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      const toolPath = join(tmpDir, '.claude', 'tools', 'onboarding', 'TOOL.md');
      assert.equal(existsSync(toolPath), true, '.claude/tools/onboarding/TOOL.md should exist after install with --ide claude');
    });
  });

  describe('update', () => {
    it('backfills missing default context files', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      rmSync(join(tmpDir, 'context', 'business-model.md'));
      rmSync(join(tmpDir, 'context', 'users-personas.md'));

      const result = await service.update(tmpDir, {});

      assert.ok(result.added.includes('context/business-model.md'));
      assert.ok(result.added.includes('context/users-personas.md'));
      assert.equal(existsSync(join(tmpDir, 'context', 'business-model.md')), true);
      assert.equal(existsSync(join(tmpDir, 'context', 'users-personas.md')), true);
    });

    it('backfills missing credentials example file', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      rmSync(join(tmpDir, '.credentials', 'credentials.yaml.example'));

      const result = await service.update(tmpDir, {});

      assert.ok(result.added.includes('.credentials/credentials.yaml.example'));
      assert.equal(existsSync(join(tmpDir, '.credentials', 'credentials.yaml.example')), true);
    });

    it('backfills missing tools from sourcePaths.tools during update', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      // Set up source tools dir with a new tool that wasn't there at install time
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceTools = join(sourceRoot, 'tools');
      mkdirSync(join(sourceTools, 'onboarding'), { recursive: true });
      writeFileSync(join(sourceTools, 'onboarding', 'TOOL.md'), '# Onboarding Tool\n', 'utf8');

      const result = await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: join(sourceRoot, 'skills'),
          tools: sourceTools,
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      const toolPath = join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md');
      assert.equal(existsSync(toolPath), true, 'Tool should be backfilled on update');
      assert.ok(
        result.added.some((p) => p.includes('onboarding')),
        `Expected tools/onboarding in result.added, got: ${JSON.stringify(result.added)}`,
      );
    });

    it('does not overwrite existing tool files during update', async () => {
      // Pre-create a customised tool in the workspace
      mkdirSync(join(tmpDir, '.cursor', 'tools', 'onboarding'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md'), '# My Custom Version\n', 'utf8');
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n', 'utf8');

      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceTools = join(sourceRoot, 'tools');
      mkdirSync(join(sourceTools, 'onboarding'), { recursive: true });
      writeFileSync(join(sourceTools, 'onboarding', 'TOOL.md'), '# Upstream Version\n', 'utf8');

      await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: join(sourceRoot, 'skills'),
          tools: sourceTools,
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      const content = readFileSync(join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md'), 'utf8');
      assert.ok(content.includes('My Custom Version'), 'Existing tool file should not be overwritten by update');
    });

    it('backfills missing files within an existing tool dir on update (regression: partial tool dirs skipped at directory level)', async () => {
      // Simulate the real-world regression: workspace has onboarding/TOOL.md but
      // templates/ subdir is absent (e.g. installed before the regression fix).
      mkdirSync(join(tmpDir, '.cursor', 'tools', 'onboarding'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md'), '# Onboarding Tool\n', 'utf8');
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n', 'utf8');

      // Source has TOOL.md + a templates subdir with a plan template
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceTools = join(sourceRoot, 'tools');
      mkdirSync(join(sourceTools, 'onboarding', 'templates'), { recursive: true });
      writeFileSync(join(sourceTools, 'onboarding', 'TOOL.md'), '# Onboarding Tool\n', 'utf8');
      writeFileSync(join(sourceTools, 'onboarding', 'templates', '30-60-90-plan.md'), '# 30/60/90 Plan\n', 'utf8');

      const result = await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: join(sourceRoot, 'skills'),
          tools: sourceTools,
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // The template file should now exist in the workspace
      const templatePath = join(tmpDir, '.cursor', 'tools', 'onboarding', 'templates', '30-60-90-plan.md');
      assert.equal(existsSync(templatePath), true, 'Missing template inside existing tool dir should be backfilled');

      // TOOL.md already existed — should not appear in added
      assert.ok(
        !result.added.some((p) => p === join('tools', 'onboarding', 'TOOL.md')),
        'Pre-existing TOOL.md should not be in result.added',
      );

      // The new template file should be in added
      assert.ok(
        result.added.some((p) => p.includes('30-60-90-plan.md')),
        `Expected 30-60-90-plan.md in result.added, got: ${JSON.stringify(result.added)}`,
      );
    });

    it('syncs core skills from source paths and preserves custom workspace skills', async () => {
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      mkdirSync(join(sourceSkills, 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(sourceSkills, 'meeting-prep', 'SKILL.md'),
        '# Meeting Prep\n\nNew canonical skill content\n',
        'utf8',
      );

      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      // Existing core skill should be updated from source
      mkdirSync(join(tmpDir, '.agents', 'skills', 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.agents', 'skills', 'meeting-prep', 'SKILL.md'),
        '# Meeting Prep\n\nOld content\n',
        'utf8',
      );

      // Custom skill should remain untouched
      mkdirSync(join(tmpDir, '.agents', 'skills', 'my-custom-skill'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.agents', 'skills', 'my-custom-skill', 'SKILL.md'),
        '# Custom Skill\n',
        'utf8',
      );

      const result = await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      assert.ok(
        result.updated.includes('meeting-prep'),
        `Expected meeting-prep in updated. added=${JSON.stringify(result.added)} updated=${JSON.stringify(result.updated)} preserved=${JSON.stringify(result.preserved)}`,
      );
      const updatedContent = readFileSync(
        join(tmpDir, '.agents', 'skills', 'meeting-prep', 'SKILL.md'),
        'utf8',
      );
      assert.ok(updatedContent.includes('New canonical skill content'));

      const customExists = existsSync(
        join(tmpDir, '.agents', 'skills', 'my-custom-skill', 'SKILL.md'),
      );
      assert.equal(customExists, true);
    });

    it('preserves overridden core skills', async () => {
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      mkdirSync(join(sourceSkills, 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(sourceSkills, 'meeting-prep', 'SKILL.md'),
        '# Meeting Prep\n\nCanonical update\n',
        'utf8',
      );

      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const manifestPath = join(tmpDir, 'arete.yaml');
      const manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      const skills = (manifest.skills as Record<string, unknown>) || {};
      skills.overrides = ['meeting-prep'];
      manifest.skills = skills;
      writeFileSync(manifestPath, stringifyYaml(manifest), 'utf8');

      mkdirSync(join(tmpDir, '.agents', 'skills', 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.agents', 'skills', 'meeting-prep', 'SKILL.md'),
        '# Meeting Prep\n\nLocal override content\n',
        'utf8',
      );

      const result = await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      const content = readFileSync(
        join(tmpDir, '.agents', 'skills', 'meeting-prep', 'SKILL.md'),
        'utf8',
      );
      assert.ok(content.includes('Local override content'));
      assert.ok(result.preserved.includes('meeting-prep'));
    });

    it('preserves community skill with colliding core name', async () => {
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      mkdirSync(join(sourceSkills, 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(sourceSkills, 'meeting-prep', 'SKILL.md'),
        '# Meeting Prep\n\nCanonical update\n',
        'utf8',
      );

      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const targetSkillDir = join(tmpDir, '.agents', 'skills', 'meeting-prep');
      mkdirSync(targetSkillDir, { recursive: true });
      writeFileSync(join(targetSkillDir, 'SKILL.md'), '# Meeting Prep\n\nCommunity variant\n', 'utf8');
      writeFileSync(join(targetSkillDir, '.arete-meta.yaml'), 'category: community\n', 'utf8');

      const result = await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      const content = readFileSync(join(targetSkillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('Community variant'));
      assert.ok(result.preserved.includes('meeting-prep'));
    });

    it('regenerates Claude Code slash commands when updating with --ide claude', async () => {
      // Create a cursor workspace first
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      // Set up source paths with a skill so commands can be generated
      const sourceRoot = join(tmpDir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      mkdirSync(join(sourceSkills, 'daily-plan'), { recursive: true });
      writeFileSync(
        join(sourceSkills, 'daily-plan', 'SKILL.md'),
        '---\nid: daily-plan\nname: Daily Plan\ntriggers:\n  - daily plan\n---\n# Daily Plan\n',
        'utf8',
      );

      // Create a rules source dir for Claude Code
      const sourceRules = join(sourceRoot, 'rules');
      mkdirSync(sourceRules, { recursive: true });

      const result = await service.update(tmpDir, {
        ideTarget: 'claude',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: sourceRules,
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // Claude commands directory should exist with generated commands
      const commandsDir = join(tmpDir, '.claude', 'commands');
      assert.equal(existsSync(commandsDir), true, '.claude/commands/ should exist after --ide claude update');

      // Should have at least one command file in the updated results
      const commandEntries = result.updated.filter((p) => p.startsWith('.claude/commands/'));
      assert.ok(
        commandEntries.length > 0,
        `Expected .claude/commands/ entries in result.updated, got: ${JSON.stringify(result.updated)}`,
      );

      // CLAUDE.md should be generated (not AGENTS.md)
      assert.ok(
        result.updated.includes('CLAUDE.md'),
        `Expected CLAUDE.md in result.updated, got: ${JSON.stringify(result.updated)}`,
      );
    });
  });

  describe('updateManifestField', () => {
    it('adds a new field to arete.yaml', async () => {
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        stringifyYaml({ schema: 1, version: '0.1.0', source: 'npm' }),
      );
      await service.updateManifestField(tmpDir, 'qmd_collection', 'my-ws-a3f2');

      const content = readFileSync(join(tmpDir, 'arete.yaml'), 'utf8');
      const parsed = parseYaml(content) as Record<string, unknown>;
      assert.equal(parsed.qmd_collection, 'my-ws-a3f2');
    });

    it('preserves existing fields when adding new one', async () => {
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        stringifyYaml({ schema: 1, version: '0.1.0', source: 'npm', ide_target: 'cursor' }),
      );
      await service.updateManifestField(tmpDir, 'qmd_collection', 'test-coll');

      const content = readFileSync(join(tmpDir, 'arete.yaml'), 'utf8');
      const parsed = parseYaml(content) as Record<string, unknown>;
      assert.equal(parsed.schema, 1);
      assert.equal(parsed.version, '0.1.0');
      assert.equal(parsed.source, 'npm');
      assert.equal(parsed.ide_target, 'cursor');
      assert.equal(parsed.qmd_collection, 'test-coll');
    });

    it('updates an existing field value', async () => {
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        stringifyYaml({ schema: 1, qmd_collection: 'old-name' }),
      );
      await service.updateManifestField(tmpDir, 'qmd_collection', 'new-name');

      const content = readFileSync(join(tmpDir, 'arete.yaml'), 'utf8');
      const parsed = parseYaml(content) as Record<string, unknown>;
      assert.equal(parsed.qmd_collection, 'new-name');
    });

    it('does nothing when manifest file does not exist', async () => {
      // Should not throw
      await service.updateManifestField(tmpDir, 'qmd_collection', 'test');
      assert.equal(existsSync(join(tmpDir, 'arete.yaml')), false);
    });

    it('handles malformed YAML without throwing', async () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), '{{invalid yaml: [[[');
      // Should not throw
      await service.updateManifestField(tmpDir, 'qmd_collection', 'test');
      // File should remain unchanged (no write on parse error)
      const content = readFileSync(join(tmpDir, 'arete.yaml'), 'utf8');
      assert.equal(content, '{{invalid yaml: [[[');
    });
  });

  describe('getStatus', () => {
    it('returns status for workspace with manifest', async () => {
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\n'
      );
      const status = await service.getStatus(tmpDir);
      assert.equal(status.initialized, true);
      assert.equal(status.version, '0.1.0');
    });

    it('returns errors when no manifest', async () => {
      const status = await service.getStatus(tmpDir);
      assert.equal(status.initialized, false);
      assert.ok(status.errors.length > 0);
    });
  });

  describe('update — integration section injection', () => {
    function setupMinimalWorkspace(dir: string): void {
      writeFileSync(
        join(dir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n',
        'utf8',
      );
    }

    it('injects integration section into skills with creates_project during update', async () => {
      setupMinimalWorkspace(tmpDir);

      // Plant a skill with creates_project: true
      const skillDir = join(tmpDir, '.agents', 'skills', 'my-prd-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: My PRD Skill',
          'description: Creates PRDs',
          'creates_project: true',
          'project_template: default',
          '---',
          '',
          '# My PRD Skill',
          '',
          'Does the thing.',
        ].join('\n'),
        'utf8',
      );

      await service.update(tmpDir, {});

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('<!-- ARETE_INTEGRATION_START -->'), 'should inject start sentinel');
      assert.ok(content.includes('<!-- ARETE_INTEGRATION_END -->'), 'should inject end sentinel');
      assert.ok(content.includes('## Areté Integration'), 'should have integration section heading');
    });

    it('injects integration section into skills with explicit integration field during update', async () => {
      setupMinimalWorkspace(tmpDir);

      const skillDir = join(tmpDir, '.agents', 'skills', 'research-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: Research Skill',
          'description: Does research',
          'integration:',
          '  outputs:',
          '    - type: resource',
          '      path: resources/research/',
          '      index: true',
          '  contextUpdates:',
          '    - context/research-notes.md',
          '---',
          '',
          '# Research Skill',
        ].join('\n'),
        'utf8',
      );

      await service.update(tmpDir, {});

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('## Areté Integration'), 'should have integration section');
      assert.ok(content.includes('resources/research/'), 'should mention resource path');
      assert.ok(content.includes('context/research-notes.md'), 'should mention context update');
    });

    it('does not inject section into skills with no integration profile during update', async () => {
      setupMinimalWorkspace(tmpDir);

      const skillDir = join(tmpDir, '.agents', 'skills', 'simple-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: Simple Skill',
          'description: Just a skill, no outputs',
          '---',
          '',
          '# Simple Skill',
        ].join('\n'),
        'utf8',
      );

      await service.update(tmpDir, {});

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(!content.includes('ARETE_INTEGRATION_START'), 'should NOT inject sentinel for skill with no profile');
    });

    it('injection is idempotent — running update twice does not duplicate section', async () => {
      setupMinimalWorkspace(tmpDir);

      const skillDir = join(tmpDir, '.agents', 'skills', 'prd-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: PRD Skill',
          'creates_project: true',
          '---',
          '# PRD Skill',
        ].join('\n'),
        'utf8',
      );

      await service.update(tmpDir, {});
      await service.update(tmpDir, {});

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      const occurrences = (content.match(/ARETE_INTEGRATION_START/g) ?? []).length;
      assert.equal(occurrences, 1, 'sentinel should appear exactly once after two updates');
    });

    it('injection loop runs even when options.sourcePaths is not provided', async () => {
      setupMinimalWorkspace(tmpDir);

      const skillDir = join(tmpDir, '.agents', 'skills', 'standalone-skill');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: Standalone Skill',
          'creates_project: true',
          '---',
          '# Standalone Skill',
        ].join('\n'),
        'utf8',
      );

      // No sourcePaths — update() called with empty options
      await service.update(tmpDir, {});

      const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('ARETE_INTEGRATION_START'), 'injection should run even without sourcePaths');
    });
  });

  describe('create — Claude Code specifics', () => {
    function makeClaudeSourceRuntime(dir: string) {
      const sourceRoot = join(dir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      const sourceRules = join(sourceRoot, 'rules');
      const sourceProfiles = join(sourceRoot, 'profiles');
      mkdirSync(join(sourceSkills, 'meeting-prep'), { recursive: true });
      writeFileSync(
        join(sourceSkills, 'meeting-prep', 'SKILL.md'),
        [
          '---',
          'name: Meeting Prep',
          'description: Prepare for meetings',
          'triggers:',
          '  - meeting prep',
          'category: core',
          '---',
          '',
          '# Meeting Prep',
          '',
          'Prepare for upcoming meetings.',
        ].join('\n'),
        'utf8',
      );
      mkdirSync(sourceRules, { recursive: true });
      // Create all 7 Cursor rules
      for (const rule of [
        'agent-memory.mdc', 'context-management.mdc', 'project-management.mdc',
        'routing-mandatory.mdc', 'pm-workspace.mdc', 'arete-vision.mdc', 'qmd-search.mdc',
      ]) {
        writeFileSync(join(sourceRules, rule), `# ${rule}\nRule content`, 'utf8');
      }
      mkdirSync(sourceProfiles, { recursive: true });
      writeFileSync(join(sourceProfiles, 'guide.md'), '# Guide Profile\n', 'utf8');
      return { sourceRoot, sourceSkills, sourceRules, sourceProfiles };
    }

    it('Claude install copies only 3 rules (reduced set)', async () => {
      const { sourceRoot, sourceSkills, sourceRules, sourceProfiles } = makeClaudeSourceRuntime(tmpDir);
      const result = await service.create(tmpDir, {
        ideTarget: 'claude',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: sourceRules,
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          profiles: sourceProfiles,
        },
      });
      // Claude should get only 3 rules (agent-memory, context-management, project-management)
      assert.equal(result.rules.length, 3, `Expected 3 rules for Claude, got: ${JSON.stringify(result.rules)}`);
      assert.ok(result.rules.includes('agent-memory.md'));
      assert.ok(result.rules.includes('context-management.md'));
      assert.ok(result.rules.includes('project-management.md'));
      // Cursor-only rules should NOT be present
      assert.ok(!result.rules.includes('routing-mandatory.md'));
      assert.ok(!result.rules.includes('pm-workspace.md'));
    });

    it('Cursor install still gets all 7 rules', async () => {
      const { sourceRoot, sourceSkills, sourceRules } = makeClaudeSourceRuntime(tmpDir);
      const result = await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: sourceRules,
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
        },
      });
      assert.equal(result.rules.length, 7, `Expected 7 rules for Cursor, got: ${JSON.stringify(result.rules)}`);
    });

    it('Claude install creates .claude/commands/ with command files', async () => {
      const { sourceRoot, sourceSkills, sourceRules, sourceProfiles } = makeClaudeSourceRuntime(tmpDir);
      const result = await service.create(tmpDir, {
        ideTarget: 'claude',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: sourceRules,
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          profiles: sourceProfiles,
        },
      });
      // Should have command files in result
      const commandFiles = result.files.filter((f) => f.startsWith('.claude/commands/'));
      assert.ok(commandFiles.length > 0, `Expected command files, got: ${JSON.stringify(commandFiles)}`);
      // Verify files exist on disk
      for (const cmdFile of commandFiles) {
        assert.equal(existsSync(join(tmpDir, cmdFile)), true, `${cmdFile} should exist on disk`);
      }
    });

    it('Claude install copies profiles to .agents/profiles/', async () => {
      const { sourceRoot, sourceSkills, sourceRules, sourceProfiles } = makeClaudeSourceRuntime(tmpDir);
      const result = await service.create(tmpDir, {
        ideTarget: 'claude',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: sourceRules,
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          profiles: sourceProfiles,
        },
      });
      const profilePath = join(tmpDir, '.agents', 'profiles', 'guide.md');
      assert.equal(existsSync(profilePath), true, '.agents/profiles/guide.md should exist');
      const content = readFileSync(profilePath, 'utf8');
      assert.ok(content.includes('Guide Profile'));
      assert.ok(
        result.files.some((f) => f.includes('.agents/profiles/guide.md')),
        'Profile should appear in result.files',
      );
    });
  });

  describe('create and syncCoreSkills — root-level .md file deployment', () => {
    function makeSourceRuntime(dir: string): { sourceRoot: string; sourceSkills: string } {
      const sourceRoot = join(dir, 'source-runtime');
      const sourceSkills = join(sourceRoot, 'skills');
      mkdirSync(join(sourceSkills, 'meeting-prep'), { recursive: true });
      writeFileSync(join(sourceSkills, 'meeting-prep', 'SKILL.md'), '# Meeting Prep\n', 'utf8');
      return { sourceRoot, sourceSkills };
    }

    it('create() excludes documentation files (README.md, LEARNINGS.md, etc.) but copies PATTERNS.md from .agents/skills/', async () => {
      // Documentation files in skills/ root that are internal-only should not be copied
      // But PATTERNS.md is referenced by skills and must be present in user workspaces
      const { sourceRoot, sourceSkills } = makeSourceRuntime(tmpDir);
      writeFileSync(join(sourceSkills, 'PATTERNS.md'), '# Skill Patterns\n', 'utf8');
      writeFileSync(join(sourceSkills, 'README.md'), '# Skills README\n', 'utf8');
      writeFileSync(join(sourceSkills, 'LEARNINGS.md'), '# Learnings\n', 'utf8');
      writeFileSync(join(sourceSkills, '_authoring-guide.md'), '# Authoring\n', 'utf8');
      writeFileSync(join(sourceSkills, '_integration-guide.md'), '# Integration\n', 'utf8');
      // A non-doc .md file should still be copied (if we ever have one)
      writeFileSync(join(sourceSkills, 'custom-file.md'), '# Custom\n', 'utf8');

      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // PATTERNS.md SHOULD be copied (skills reference it)
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'PATTERNS.md')),
        true,
        'PATTERNS.md should be copied (skills reference it)',
      );
      // Other documentation files should NOT be copied
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'README.md')),
        false,
        'README.md should NOT be copied (doc file)',
      );
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'LEARNINGS.md')),
        false,
        'LEARNINGS.md should NOT be copied (doc file)',
      );
      // Non-doc files should still be copied
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'custom-file.md')),
        true,
        'Non-documentation .md files should still be copied',
      );
    });

    it('syncCoreSkills via update() copies PATTERNS.md and excludes other documentation files', async () => {
      const { sourceRoot, sourceSkills } = makeSourceRuntime(tmpDir);
      writeFileSync(join(sourceSkills, 'PATTERNS.md'), '# Updated PATTERNS\n', 'utf8');
      writeFileSync(join(sourceSkills, 'README.md'), '# README\n', 'utf8');
      writeFileSync(join(sourceSkills, 'custom-file.md'), '# Custom Updated\n', 'utf8');

      // Pre-plant files in the workspace
      mkdirSync(join(tmpDir, '.agents', 'skills'), { recursive: true });
      writeFileSync(join(tmpDir, '.agents', 'skills', 'custom-file.md'), '# Old Custom\n', 'utf8');
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n', 'utf8');

      await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // PATTERNS.md SHOULD be copied (skills reference it)
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'PATTERNS.md')),
        true,
        'PATTERNS.md should be copied by update (skills reference it)',
      );
      // README.md should NOT be copied (doc file)
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'README.md')),
        false,
        'README.md should NOT be copied by update (doc file)',
      );
      // Non-doc files should be updated
      const content = readFileSync(join(tmpDir, '.agents', 'skills', 'custom-file.md'), 'utf8');
      assert.ok(content.includes('Custom Updated'), 'Non-doc .md files should be overwritten by syncCoreSkills');
    });

    it('syncCoreSkills does not copy nested .md files from skill subdirectories as root-level files', async () => {
      const { sourceRoot, sourceSkills } = makeSourceRuntime(tmpDir);
      // The meeting-prep subdirectory has its own SKILL.md — it should not be copied as a root-level file
      // (it gets copied as part of the subdirectory, not as a root-level .md)

      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n', 'utf8');

      await service.update(tmpDir, {
        sourcePaths: {
          root: sourceRoot,
          skills: sourceSkills,
          tools: join(sourceRoot, 'tools'),
          rules: join(sourceRoot, 'rules'),
          integrations: join(sourceRoot, 'integrations'),
          templates: join(sourceRoot, 'templates'),
          guide: join(sourceRoot, 'GUIDE.md'),
          updates: join(sourceRoot, 'UPDATES.md'),
        },
      });

      // SKILL.md from meeting-prep subdir should NOT appear at .agents/skills/SKILL.md
      assert.equal(
        existsSync(join(tmpDir, '.agents', 'skills', 'SKILL.md')),
        false,
        'nested SKILL.md should not be copied to skills root',
      );
    });
  });
});

describe('workspace-structure constants', () => {
  describe('BASE_WORKSPACE_DIRS', () => {
    it('includes areas directory', () => {
      assert.ok(
        BASE_WORKSPACE_DIRS.includes('areas'),
        'BASE_WORKSPACE_DIRS should include areas directory'
      );
    });
  });

  describe('DEFAULT_FILES', () => {
    it('includes areas/_template.md', () => {
      assert.ok(
        'areas/_template.md' in DEFAULT_FILES,
        'DEFAULT_FILES should include areas/_template.md'
      );
    });

    it('areas template has YAML frontmatter with required fields', () => {
      const template = DEFAULT_FILES['areas/_template.md'];
      assert.ok(template.includes('---'), 'Template should have YAML frontmatter delimiters');
      assert.ok(template.includes('area: {name}'), 'Template should have area field with placeholder');
      assert.ok(template.includes('status: active'), 'Template should have status field');
      assert.ok(template.includes('recurring_meetings:'), 'Template should have recurring_meetings field');
      assert.ok(template.includes('title:'), 'Template should have title in recurring_meetings');
      assert.ok(template.includes('attendees:'), 'Template should have attendees in recurring_meetings');
      assert.ok(template.includes('frequency:'), 'Template should have frequency in recurring_meetings');
    });

    it('areas template has required markdown sections', () => {
      const template = DEFAULT_FILES['areas/_template.md'];
      const requiredSections = [
        '## Goal',
        '## Focus',
        '## Horizon',
        '## Projects',
        '## Backlog',
        '## Stakeholders',
        '## Notes',
      ];

      for (const section of requiredSections) {
        assert.ok(
          template.includes(section),
          `Template should include ${section} section`
        );
      }
    });

    it('areas template uses {variable} placeholder syntax', () => {
      const template = DEFAULT_FILES['areas/_template.md'];
      assert.ok(template.includes('{name}'), 'Template should use {name} placeholder');
      assert.ok(template.includes('{description}'), 'Template should use {description} placeholder');
      assert.ok(template.includes('{meeting_title}'), 'Template should use {meeting_title} placeholder');
    });
  });
});

describe('WorkspaceService areas integration', () => {
  let tmpDir: string;
  let service: WorkspaceService;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `arete-test-areas-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(tmpDir, { recursive: true });
    service = new WorkspaceService(new FileStorageAdapter());
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('create', () => {
    it('creates areas/ directory in new workspaces', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const areasDir = join(tmpDir, 'areas');
      assert.equal(existsSync(areasDir), true, 'areas/ directory should exist after install');
    });

    it('creates areas/_template.md in new workspaces', async () => {
      await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });

      const templatePath = join(tmpDir, 'areas', '_template.md');
      assert.equal(existsSync(templatePath), true, 'areas/_template.md should exist after install');

      const content = readFileSync(templatePath, 'utf8');
      assert.ok(content.includes('area: {name}'), 'Template should have area placeholder');
      assert.ok(content.includes('## Focus'), 'Template should have Focus section');
    });
  });

  describe('update', () => {
    it('backfills areas/ directory in existing workspaces', async () => {
      // Create minimal workspace without areas/
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n',
        'utf8'
      );
      mkdirSync(join(tmpDir, 'context'), { recursive: true });
      mkdirSync(join(tmpDir, '.arete', 'memory'), { recursive: true });

      // Run update
      const result = await service.update(tmpDir, {});

      // areas/ should now exist
      const areasDir = join(tmpDir, 'areas');
      assert.equal(existsSync(areasDir), true, 'areas/ directory should be backfilled on update');
    });

    it('backfills areas/_template.md in existing workspaces', async () => {
      // Create workspace with areas/ but no template
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n',
        'utf8'
      );
      mkdirSync(join(tmpDir, 'areas'), { recursive: true });

      // Run update
      const result = await service.update(tmpDir, {});

      // Template should now exist
      const templatePath = join(tmpDir, 'areas', '_template.md');
      assert.equal(existsSync(templatePath), true, 'areas/_template.md should be backfilled on update');
      assert.ok(
        result.added.includes('areas/_template.md'),
        `Expected areas/_template.md in result.added, got: ${JSON.stringify(result.added)}`
      );
    });

    it('does not overwrite existing area files on update', async () => {
      // Create workspace with custom area file
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\nsource: npm\nide_target: cursor\n',
        'utf8'
      );
      mkdirSync(join(tmpDir, 'areas'), { recursive: true });
      writeFileSync(
        join(tmpDir, 'areas', '_template.md'),
        '# Custom Template\nMy customizations here',
        'utf8'
      );

      // Run update
      await service.update(tmpDir, {});

      // Custom content should be preserved
      const content = readFileSync(join(tmpDir, 'areas', '_template.md'), 'utf8');
      assert.ok(
        content.includes('My customizations here'),
        'Existing template file should not be overwritten'
      );
    });
  });
});
