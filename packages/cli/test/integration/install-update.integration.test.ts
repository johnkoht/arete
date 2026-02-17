import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
});
