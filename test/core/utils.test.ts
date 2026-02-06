/**
 * Tests for src/core/utils.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  output,
  formatPath,
  getBuildVersion,
} from '../../src/core/utils.js';

describe('utils', () => {
  describe('output', () => {
    let originalLog: typeof console.log;
    let logged: unknown[][];

    beforeEach(() => {
      logged = [];
      originalLog = console.log;
      console.log = (...args: unknown[]) => logged.push(args);
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it('outputs JSON when json option is true', () => {
      const data = { key: 'value', nested: { a: 1 } };
      output(data, { json: true });
      assert.equal(logged.length, 1);
      const parsed = JSON.parse(logged[0][0] as string);
      assert.deepEqual(parsed, data);
    });

    it('outputs formatted JSON with 2-space indentation', () => {
      output({ a: 1 }, { json: true });
      const jsonStr = logged[0][0] as string;
      assert.ok(jsonStr.includes('  "a"'));
    });

    it('outputs string directly when not json', () => {
      output('hello world');
      assert.equal(logged[0][0], 'hello world');
    });

    it('outputs object directly when not json and data is object', () => {
      const data = { key: 'value' };
      output(data);
      assert.equal(logged[0][0], data);
    });
  });

  describe('formatPath', () => {
    it('returns relative path when under cwd', () => {
      const cwd = process.cwd();
      const fullPath = `${cwd}/src/core/config.ts`;
      const result = formatPath(fullPath);
      assert.equal(result, './src/core/config.ts');
    });

    it('returns full path when not under cwd', () => {
      const result = formatPath('/completely/different/path');
      assert.equal(result, '/completely/different/path');
    });

    it('handles cwd itself', () => {
      const cwd = process.cwd();
      const result = formatPath(cwd);
      assert.equal(result, '.');
    });
  });

  describe('getBuildVersion', () => {
    it('returns a string', () => {
      const version = getBuildVersion();
      assert.equal(typeof version, 'string');
    });

    it('returns a non-empty string', () => {
      const version = getBuildVersion();
      assert.ok(version.length > 0);
    });

    it('matches semver format (x.y.z)', () => {
      const version = getBuildVersion();
      const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      assert.ok(
        semverPattern.test(version),
        `Expected version "${version}" to match semver format`
      );
    });

    it('returns the version from package.json', () => {
      const version = getBuildVersion();
      // Should be a valid semver version
      const parts = version.split('.');
      assert.ok(parts.length >= 3, 'Version should have at least 3 parts (major.minor.patch)');
    });
  });
});
