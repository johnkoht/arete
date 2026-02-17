import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseDotEnv, loadEnvFiles } from './helpers.js';

const ORIGINAL_ARETE_E2E_SANDBOX_ROOT = process.env.ARETE_E2E_SANDBOX_ROOT;

afterEach(() => {
  if (ORIGINAL_ARETE_E2E_SANDBOX_ROOT === undefined) {
    delete process.env.ARETE_E2E_SANDBOX_ROOT;
  } else {
    process.env.ARETE_E2E_SANDBOX_ROOT = ORIGINAL_ARETE_E2E_SANDBOX_ROOT;
  }
});

describe('integration helpers env loading', () => {
  it('parses dotenv content with comments, export syntax, and quoted values', () => {
    const parsed = parseDotEnv(`
# comment
ARETE_E2E_SANDBOX_ROOT=~/arete-e2e
export FOO=bar
QUOTED_ONE="value one"
QUOTED_TWO='value two'
INVALID_LINE
`);

    assert.equal(parsed.ARETE_E2E_SANDBOX_ROOT, '~/arete-e2e');
    assert.equal(parsed.FOO, 'bar');
    assert.equal(parsed.QUOTED_ONE, 'value one');
    assert.equal(parsed.QUOTED_TWO, 'value two');
    assert.equal(parsed.INVALID_LINE, undefined);
  });

  it('loads env files when unset and does not override existing process env values', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'arete-env-load-'));

    try {
      writeFileSync(join(tempRoot, '.env'), 'ARETE_E2E_SANDBOX_ROOT=/from-dot-env\n', 'utf8');
      writeFileSync(join(tempRoot, '.env.test'), 'ARETE_E2E_SANDBOX_ROOT=/from-dot-env-test\n', 'utf8');

      delete process.env.ARETE_E2E_SANDBOX_ROOT;
      loadEnvFiles(tempRoot, ['.env.test', '.env']);
      assert.equal(process.env.ARETE_E2E_SANDBOX_ROOT, '/from-dot-env-test');

      process.env.ARETE_E2E_SANDBOX_ROOT = '/already-set';
      loadEnvFiles(tempRoot, ['.env.test', '.env']);
      assert.equal(process.env.ARETE_E2E_SANDBOX_ROOT, '/already-set');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
