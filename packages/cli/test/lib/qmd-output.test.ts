import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { displayQmdResult } from '../../src/lib/qmd-output.js';

describe('displayQmdResult', () => {
  it('calls listItem with "updated" when result is indexed but not embedded', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult({ indexed: true, skipped: false }, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 1);
    assert.deepEqual(listItem.mock.calls[0].arguments, ['Search index', 'updated']);
    assert.equal(warn.mock.calls.length, 0);
  });

  it('calls listItem with "updated and embedded" when result is indexed and embedded', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult({ indexed: true, skipped: false, embedded: true }, { listItem, warn });

    assert.equal(listItem.mock.calls.length, 1);
    assert.deepEqual(listItem.mock.calls[0].arguments, ['Search index', 'updated and embedded']);
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

  it('calls warn when result has embedWarning', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult(
      { indexed: true, skipped: false, embedded: false, embedWarning: 'qmd embed failed: model download failed' },
      { listItem, warn },
    );

    assert.equal(listItem.mock.calls.length, 1);
    assert.equal(warn.mock.calls.length, 1);
    assert.deepEqual(warn.mock.calls[0].arguments, ['qmd embed failed: model download failed']);
  });

  it('calls warn for both warning and embedWarning when both present', () => {
    const listItem = mock.fn();
    const warn = mock.fn();

    displayQmdResult(
      {
        indexed: true,
        skipped: false,
        warning: 'partial update',
        embedded: false,
        embedWarning: 'embed failed',
      },
      { listItem, warn },
    );

    assert.equal(listItem.mock.calls.length, 1);
    assert.equal(warn.mock.calls.length, 2);
    assert.deepEqual(warn.mock.calls[0].arguments, ['partial update']);
    assert.deepEqual(warn.mock.calls[1].arguments, ['embed failed']);
  });
});
