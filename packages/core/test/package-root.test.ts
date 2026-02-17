import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getPackageRoot } from '../src/package-root.js';

describe('getPackageRoot', () => {
  it('resolves to the actual package root, not the nested packages directory', () => {
    const root = getPackageRoot();

    assert.ok(root.length > 0, 'should return a non-empty path');
    assert.notEqual(
      basename(root),
      'packages',
      'should not stop at the nested packages directory',
    );
    assert.ok(
      existsSync(join(root, 'package.json')),
      'resolved root should contain package.json',
    );
    assert.ok(
      existsSync(join(root, 'packages', 'runtime')) ||
        existsSync(join(root, 'runtime')),
      'resolved root should contain runtime content',
    );
  });
});
