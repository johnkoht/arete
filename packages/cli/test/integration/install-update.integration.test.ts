import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  createIntegrationSandbox,
  installWorkspace,
  getStatusJson,
  runUpdateJson,
  type IdeTarget,
} from './helpers.js';

describe('integration: workspace install/update journeys', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-install-update');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('installs and validates both cursor and claude workspace invariants', () => {
    const ideTargets: IdeTarget[] = ['cursor', 'claude'];
    for (const ide of ideTargets) {
      const workspace = join(sandboxRoot, ide);
      const install = installWorkspace(workspace, ide);
      assert.equal(install.success, true, `install should succeed for ${ide}`);
      assert.equal(install.path, workspace);

      const manifestPath = join(workspace, 'arete.yaml');
      const manifest = parseYaml(readFileSync(manifestPath, 'utf8')) as {
        schema: number;
        ide_target: string;
      };
      assert.equal(manifest.schema, 1);
      assert.equal(manifest.ide_target, ide);

      if (ide === 'cursor') {
        assert.equal(existsSync(join(workspace, '.cursor', 'rules')), true);
        assert.equal(existsSync(join(workspace, 'AGENTS.md')), true);
        assert.equal(existsSync(join(workspace, '.claude')), false);
      } else {
        assert.equal(existsSync(join(workspace, '.claude', 'rules')), true);
        assert.equal(existsSync(join(workspace, 'CLAUDE.md')), true);
        assert.equal(existsSync(join(workspace, '.cursor')), false);
      }

      const status = getStatusJson(workspace);
      assert.equal(status.success, true);
      assert.equal(status.workspace.ide, ide);
    }
  });

  it('runs update twice idempotently without cross-ide artifact pollution', () => {
    const workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');

    const first = runUpdateJson(workspace);
    const second = runUpdateJson(workspace);

    assert.equal(first.success, true);
    assert.equal(first.mode, 'update');
    assert.equal(second.success, true);
    assert.equal(second.mode, 'update');

    assert.equal(existsSync(join(workspace, '.cursor', 'rules')), true);
    assert.equal(existsSync(join(workspace, 'AGENTS.md')), true);
    assert.equal(existsSync(join(workspace, '.claude')), false);
  });

  it('install ships GUIDE.md and skill-local templates to new workspace', () => {
    const workspace = join(sandboxRoot, 'install-outputs');
    const install = installWorkspace(workspace, 'cursor');
    assert.equal(install.success, true, 'install should succeed');

    // GUIDE.md must be present at workspace root
    assert.equal(
      existsSync(join(workspace, 'GUIDE.md')),
      true,
      'GUIDE.md should be present after install'
    );

    // PRD templates are skill-local, not in templates/outputs/
    for (const variant of ['prd-simple', 'prd-regular', 'prd-full']) {
      assert.equal(
        existsSync(join(workspace, '.agents', 'skills', 'create-prd', 'templates', `${variant}.md`)),
        true,
        `.agents/skills/create-prd/templates/${variant}.md should be present after install`
      );
      assert.equal(
        existsSync(join(workspace, 'templates', 'outputs', `${variant}.md`)),
        false,
        `templates/outputs/${variant}.md should NOT be in outputs (user override space)`
      );
    }

    // Meeting agenda templates are skill-local
    for (const type of ['one-on-one', 'customer', 'leadership', 'dev-team', 'other']) {
      assert.equal(
        existsSync(join(workspace, '.agents', 'skills', 'prepare-meeting-agenda', 'templates', `${type}.md`)),
        true,
        `.agents/skills/prepare-meeting-agenda/templates/${type}.md should be present after install`
      );
    }
  });

  it('update backfills missing GUIDE.md without overwriting existing', () => {
    const workspace = join(sandboxRoot, 'update-guide');
    installWorkspace(workspace, 'cursor');

    const guidePath = join(workspace, 'GUIDE.md');
    assert.equal(existsSync(guidePath), true, 'GUIDE.md should exist after install');

    // Remove GUIDE.md to simulate a workspace that never had it
    unlinkSync(guidePath);
    assert.equal(existsSync(guidePath), false, 'GUIDE.md should be gone');

    // Update should backfill it
    const update = runUpdateJson(workspace);
    assert.equal(update.success, true, 'update should succeed');
    assert.equal(existsSync(guidePath), true, 'GUIDE.md should be backfilled by update');

    // A second update must not overwrite customized content
    writeFileSync(guidePath, '# My custom guide', 'utf-8');
    runUpdateJson(workspace);
    const content = readFileSync(guidePath, 'utf-8');
    assert.equal(content, '# My custom guide', 'update must not overwrite customized GUIDE.md');
  });

  it('update backfills missing templates without overwriting existing', () => {
    const workspace = join(sandboxRoot, 'update-templates');
    installWorkspace(workspace, 'cursor');

    // Use a non-skill template still shipped via templates/ (e.g. plans)
    const planTemplate = join(workspace, 'templates', 'plans', 'week-priorities.md');
    assert.equal(existsSync(planTemplate), true, 'week-priorities.md should exist after install');

    // Remove it to simulate a workspace that lost it
    unlinkSync(planTemplate);
    assert.equal(existsSync(planTemplate), false, 'week-priorities.md should be gone');

    // Update should backfill it
    const update = runUpdateJson(workspace);
    assert.equal(update.success, true, 'update should succeed');
    assert.equal(existsSync(planTemplate), true, 'week-priorities.md should be backfilled by update');

    // A second update must not overwrite customized content
    writeFileSync(planTemplate, '# My custom plan', 'utf-8');
    runUpdateJson(workspace);
    const content = readFileSync(planTemplate, 'utf-8');
    assert.equal(content, '# My custom plan', 'update must not overwrite customized template');
  });
});
