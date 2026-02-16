/**
 * Tests for checkDuplicate utility.
 * Ported from scripts/integrations/test_utils.py TestCheckDuplicate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDuplicate } from '../../src/utils/dedup.js';

describe('checkDuplicate', () => {
  it('no duplicate empty dir', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-dedup-'));
    try {
      const result = await checkDuplicate(tmp, 'abc123', 'test.md');
      assert.equal(result, false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('duplicate by filename', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-dedup-'));
    try {
      await writeFile(join(tmp, 'test.md'), 'content', 'utf-8');
      const result = await checkDuplicate(tmp, undefined, 'test.md');
      assert.equal(result, true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('duplicate by meeting id', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-dedup-'));
    try {
      await writeFile(
        join(tmp, 'meeting.md'),
        '**Meeting ID**: abc123\nSome content',
        'utf-8'
      );
      const result = await checkDuplicate(tmp, 'abc123');
      assert.equal(result, true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('no duplicate different id', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-dedup-'));
    try {
      await writeFile(
        join(tmp, 'meeting.md'),
        '**Meeting ID**: xyz789\nSome content',
        'utf-8'
      );
      const result = await checkDuplicate(tmp, 'abc123');
      assert.equal(result, false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('nonexistent directory', async () => {
    const result = await checkDuplicate('/nonexistent', 'abc123', 'test.md');
    assert.equal(result, false);
  });

  it('no args', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-dedup-'));
    try {
      const result = await checkDuplicate(tmp);
      assert.equal(result, false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
