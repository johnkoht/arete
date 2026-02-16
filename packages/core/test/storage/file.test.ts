/**
 * Tests for FileStorageAdapter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('FileStorageAdapter', () => {
  async function withTempDir(
    fn: (dir: string, storage: FileStorageAdapter) => Promise<void>
  ): Promise<void> {
    const tmp = await mkdtemp(join(tmpdir(), 'arete-storage-'));
    const storage = new FileStorageAdapter();
    try {
      await fn(tmp, storage);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  describe('read', () => {
    it('returns content when file exists', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'file.txt');
        await storage.write(path, 'hello world');
        const content = await storage.read(path);
        assert.strictEqual(content, 'hello world');
      });
    });

    it('returns null when file does not exist', async () => {
      await withTempDir(async (dir, storage) => {
        const content = await storage.read(join(dir, 'nonexistent.txt'));
        assert.strictEqual(content, null);
      });
    });
  });

  describe('write', () => {
    it('writes content and creates parent dirs', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'a', 'b', 'file.txt');
        await storage.write(path, 'content');
        const content = await storage.read(path);
        assert.strictEqual(content, 'content');
      });
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'file.txt');
        await storage.write(path, 'x');
        assert.strictEqual(await storage.exists(path), true);
      });
    });

    it('returns false for non-existent path', async () => {
      await withTempDir(async (dir, storage) => {
        assert.strictEqual(await storage.exists(join(dir, 'nope.txt')), false);
      });
    });

    it('returns true for existing directory', async () => {
      await withTempDir(async (dir, storage) => {
        await storage.mkdir(join(dir, 'subdir'));
        assert.strictEqual(await storage.exists(join(dir, 'subdir')), true);
      });
    });
  });

  describe('delete', () => {
    it('removes file', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'file.txt');
        await storage.write(path, 'x');
        assert.strictEqual(await storage.exists(path), true);
        await storage.delete(path);
        assert.strictEqual(await storage.exists(path), false);
      });
    });
  });

  describe('list', () => {
    it('lists files in directory', async () => {
      await withTempDir(async (dir, storage) => {
        await storage.write(join(dir, 'a.md'), 'a');
        await storage.write(join(dir, 'b.md'), 'b');
        const files = await storage.list(dir, { extensions: ['.md'] });
        assert.ok(files.length >= 2);
        assert.ok(files.some(f => f.endsWith('a.md')));
        assert.ok(files.some(f => f.endsWith('b.md')));
      });
    });

    it('supports recursive list', async () => {
      await withTempDir(async (dir, storage) => {
        await storage.write(join(dir, 'sub', 'nested.md'), 'x');
        const files = await storage.list(dir, { recursive: true, extensions: ['.md'] });
        assert.ok(files.some(f => f.endsWith('nested.md')));
      });
    });

    it('returns empty array for non-existent dir', async () => {
      await withTempDir(async (dir, storage) => {
        const files = await storage.list(join(dir, 'nope'));
        assert.deepStrictEqual(files, []);
      });
    });
  });

  describe('mkdir', () => {
    it('creates directory recursively', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'a', 'b', 'c');
        await storage.mkdir(path);
        assert.strictEqual(await storage.exists(path), true);
      });
    });
  });

  describe('getModified', () => {
    it('returns mtime for existing file', async () => {
      await withTempDir(async (dir, storage) => {
        const path = join(dir, 'file.txt');
        await storage.write(path, 'x');
        const mtime = await storage.getModified(path);
        assert.ok(mtime instanceof Date);
      });
    });

    it('returns null for non-existent path', async () => {
      await withTempDir(async (dir, storage) => {
        const mtime = await storage.getModified(join(dir, 'nope.txt'));
        assert.strictEqual(mtime, null);
      });
    });
  });
});
