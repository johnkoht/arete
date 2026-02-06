/**
 * Tests for src/core/utils.js
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  output,
  formatPath,
} from '../../src/core/utils.js';

describe('utils', () => {
  describe('output', () => {
    let originalLog;
    let logged;

    beforeEach(() => {
      logged = [];
      originalLog = console.log;
      console.log = (...args) => logged.push(args);
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it('outputs JSON when json option is true', () => {
      const data = { key: 'value', nested: { a: 1 } };
      output(data, { json: true });
      assert.equal(logged.length, 1);
      const parsed = JSON.parse(logged[0][0]);
      assert.deepEqual(parsed, data);
    });

    it('outputs formatted JSON with 2-space indentation', () => {
      output({ a: 1 }, { json: true });
      const jsonStr = logged[0][0];
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
      const fullPath = `${cwd}/src/core/config.js`;
      const result = formatPath(fullPath);
      assert.equal(result, './src/core/config.js');
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
});
