import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { displayQmdResult } from '../../src/lib/qmd-output.js';

describe('displayQmdResult', () => {
  it('calls listItem when result is indexed', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult({ indexed: true, skipped: false }, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 1);
    assert.deepEqual(listItem.mock.calls[0].arguments, ['Search index', 'qmd index updated']);
    assert.equal(warn.mock.calls.length, 0);
  });

  it('calls warn when result has a warning', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult(
      { indexed: false, skipped: false, warning: 'qmd update failed: timeout' },
      { listItem, warn },
    );

    assert.equal(listItem.mock.calls.length, 0);
    assert.equal(warn.mock.calls.length, 1);
    assert.deepEqual(warn.mock.calls[0].arguments, ['qmd update failed: timeout']);
  });

  it('calls both listItem and warn when indexed with warning', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult(
      { indexed: true, skipped: false, warning: 'partial update' },
      { listItem, warn },
    );

    assert.equal(listItem.mock.calls.length, 1);
    assert.equal(warn.mock.calls.length, 1);
  });

  it('produces no output when result is skipped', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult({ indexed: false, skipped: true }, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 0);
    assert.equal(warn.mock.calls.length, 0);
  });

  it('produces no output when result is undefined', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult(undefined, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 0);
    assert.equal(warn.mock.calls.length, 0);
  });

  it('produces no output when indexed is false and no warning', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult({ indexed: false, skipped: false }, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 0);
    assert.equal(warn.mock.calls.length, 0);
  });
});
