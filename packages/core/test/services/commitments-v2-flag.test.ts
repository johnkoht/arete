/**
 * Phase 10a v2 feature-flag tests (Step 5).
 *
 * The flag is read via env + workspace config. Tests cover precedence,
 * truthy/falsy value variants, and graceful default-false on malformed
 * config / no config / no workspace.
 *
 * Uses an in-memory storage adapter shim so no real filesystem is touched.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import {
  isCommitmentsV2Active,
  isCommitmentsV2ActiveFromConfig,
} from '../../src/services/commitments-v2-flag.js';

/**
 * Minimal in-memory storage adapter satisfying just the `read` contract
 * used by the flag resolver. We don't need write/list/exists for these
 * tests; cast on the way out keeps types honest at the call site.
 */
function makeMemoryStorage(files: Record<string, string | null>): StorageAdapter {
  const store: StorageAdapter = {
    async read(path: string) {
      return files[path] ?? null;
    },
    async write() {
      /* not used */
    },
    async exists(path: string) {
      return files[path] !== undefined && files[path] !== null;
    },
    async list() {
      return [];
    },
    async remove() {
      /* not used */
    },
    async mkdir() {
      /* not used */
    },
    async stat() {
      return null;
    },
  } as unknown as StorageAdapter;
  return store;
}

describe('isCommitmentsV2Active — env + config precedence', () => {
  const ROOT = '/tmp/fake-workspace';
  const CONFIG = '/tmp/fake-workspace/.arete/config.json';

  // We mutate process.env in some tests; capture + restore.
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    delete process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    } else {
      process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = originalEnv;
    }
  });

  it('default is false (no env, no config)', async () => {
    const storage = makeMemoryStorage({});
    assert.equal(await isCommitmentsV2Active(ROOT, storage), false);
  });

  it('env=true overrides config=false', async () => {
    process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = 'true';
    const storage = makeMemoryStorage({
      [CONFIG]: JSON.stringify({ commitments_v2_active: false }),
    });
    assert.equal(await isCommitmentsV2Active(ROOT, storage), true);
  });

  it('env=false overrides config=true', async () => {
    process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = 'false';
    const storage = makeMemoryStorage({
      [CONFIG]: JSON.stringify({ commitments_v2_active: true }),
    });
    assert.equal(await isCommitmentsV2Active(ROOT, storage), false);
  });

  it('config=true (no env) → true', async () => {
    const storage = makeMemoryStorage({
      [CONFIG]: JSON.stringify({ commitments_v2_active: true }),
    });
    assert.equal(await isCommitmentsV2Active(ROOT, storage), true);
  });

  it('malformed config falls back to false (no throw)', async () => {
    const storage = makeMemoryStorage({
      [CONFIG]: '{not valid json',
    });
    assert.equal(await isCommitmentsV2Active(ROOT, storage), false);
  });

  it('workspaceRoot=null → false (fresh / non-workspace)', async () => {
    const storage = makeMemoryStorage({});
    assert.equal(await isCommitmentsV2Active(null, storage), false);
  });

  it('env "1" / "0" string variants honored', async () => {
    const storage = makeMemoryStorage({});
    process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = '1';
    assert.equal(await isCommitmentsV2Active(ROOT, storage), true);
    process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = '0';
    assert.equal(await isCommitmentsV2Active(ROOT, storage), false);
  });
});

describe('isCommitmentsV2ActiveFromConfig — synchronous variant', () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    delete process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['ARETE_COMMITMENTS_V2_ACTIVE'];
    } else {
      process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = originalEnv;
    }
  });

  it('null config → false', () => {
    assert.equal(isCommitmentsV2ActiveFromConfig(null), false);
  });

  it('config.commitments_v2_active === true → true', () => {
    assert.equal(
      isCommitmentsV2ActiveFromConfig({ commitments_v2_active: true }),
      true,
    );
  });

  it('env=true overrides config=false', () => {
    process.env['ARETE_COMMITMENTS_V2_ACTIVE'] = 'true';
    assert.equal(
      isCommitmentsV2ActiveFromConfig({ commitments_v2_active: false }),
      true,
    );
  });
});
