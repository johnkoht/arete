/**
 * FileStorageAdapter — file system implementation of StorageAdapter.
 * Uses fs-extra for all file operations.
 */

import fs from 'fs-extra';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { ListOptions, StorageAdapter } from './adapter.js';

export class FileStorageAdapter implements StorageAdapter {
  async read(path: string): Promise<string | null> {
    try {
      const content = await fs.readFile(path, 'utf8');
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Atomic write: writes to a temp file in the same directory, then renames
   * into place. On POSIX filesystems `rename(2)` is atomic within a filesystem,
   * so a reader either sees the old content or the new content, never a
   * truncated partial write.
   *
   * Same-directory temp is critical — a rename across filesystems would fall
   * back to copy+unlink and lose atomicity.
   */
  async write(path: string, content: string): Promise<void> {
    const dir = join(path, '..');
    await fs.ensureDir(dir);
    const tmpSuffix = randomBytes(6).toString('hex');
    const tmpPath = `${path}.${tmpSuffix}.tmp`;
    try {
      await fs.writeFile(tmpPath, content, 'utf8');
      await fs.rename(tmpPath, path);
    } catch (err) {
      await fs.remove(tmpPath).catch(() => {});
      throw err;
    }
  }

  async writeIfChanged(path: string, content: string): Promise<'unchanged' | 'updated'> {
    const existing = await this.read(path);
    if (existing === content) return 'unchanged';
    await this.write(path, content);
    return 'updated';
  }

  async exists(path: string): Promise<boolean> {
    return fs.pathExists(path);
  }

  async delete(path: string): Promise<void> {
    await fs.remove(path);
  }

  async list(dir: string, options?: ListOptions): Promise<string[]> {
    const recursive = options?.recursive ?? false;
    const extensions = options?.extensions;

    try {
      const stat = await fs.stat(dir);
      if (stat.isFile()) {
        if (extensions?.length) {
          const ext = extensions.some(e => dir.toLowerCase().endsWith(e.toLowerCase())) ? dir : null;
          return ext ? [dir] : [];
        }
        return [dir];
      }
    } catch {
      return [];
    }

    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (recursive && !e.name.startsWith('.') && !e.name.startsWith('_')) {
          results.push(...(await this.list(full, options)));
        }
      } else if (e.isFile()) {
        const matchExt = !extensions?.length || extensions.some(ext => full.toLowerCase().endsWith(ext.toLowerCase()));
        if (matchExt) {
          results.push(full);
        }
      }
    }
    return results;
  }

  async listSubdirectories(dir: string): Promise<string[]> {
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const subdirs: string[] = [];
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) {
          subdirs.push(join(dir, e.name));
        }
      }
      return subdirs;
    } catch {
      return [];
    }
  }

  async mkdir(dir: string): Promise<void> {
    await fs.ensureDir(dir);
  }

  async getModified(path: string): Promise<Date | null> {
    try {
      const stat = await fs.stat(path);
      return stat.mtime;
    } catch {
      return null;
    }
  }

  async copy(
    src: string,
    dest: string,
    _options?: { recursive?: boolean }
  ): Promise<void> {
    await fs.copy(src, dest, { overwrite: false });
  }
}
