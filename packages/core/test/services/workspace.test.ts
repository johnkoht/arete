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
        },
      });

      const toolPath = join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md');
      assert.equal(existsSync(toolPath), true, 'Tool should be backfilled on update');
      assert.ok(
        result.added.some((p) => p.includes('onboarding')),
        `Expected tools/onboarding in result.added, got: ${JSON.stringify(result.added)}`,
      );
    });

    it('does not overwrite existing tools during update', async () => {
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
        },
      });

      const content = readFileSync(join(tmpDir, '.cursor', 'tools', 'onboarding', 'TOOL.md'), 'utf8');
      assert.ok(content.includes('My Custom Version'), 'Existing tool should not be overwritten by update');
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
        },
      });

      const content = readFileSync(join(targetSkillDir, 'SKILL.md'), 'utf8');
      assert.ok(content.includes('Community variant'));
      assert.ok(result.preserved.includes('meeting-prep'));
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
});
