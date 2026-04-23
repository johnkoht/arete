/**
 * Storage adapter interface for file system operations.
 *
 * Allows services to abstract over the file system for testability
 * and alternative backends (e.g., virtual file system).
 */

export interface ListOptions {
  recursive?: boolean;
  extensions?: string[];
}

export interface StorageAdapter {
  read(path: string): Promise<string | null>;
  /**
   * Write content to path atomically. After the call, readers see either the
   * full prior content or the full new content — never a partial write.
   */
  write(path: string, content: string): Promise<void>;
  /**
   * Write only if content differs from what exists on disk. Returns 'unchanged'
   * when the file already has exactly this content (no write performed),
   * 'updated' when the file was written. Load-bearing for idempotency of
   * regenerated files like CLAUDE.md and `.arete/memory/index.md`.
   * Optional — defaults to a read-then-write shim in services when adapter
   * doesn't implement it.
   */
  writeIfChanged?(path: string, content: string): Promise<'unchanged' | 'updated'>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(dir: string, options?: ListOptions): Promise<string[]>;
  /** List immediate subdirectories (full paths), excluding names starting with . or _ */
  listSubdirectories(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
  getModified(path: string): Promise<Date | null>;
  /** Copy file or directory from src to dest. Optional - FileStorageAdapter implements it. */
  copy?(src: string, dest: string, options?: { recursive?: boolean }): Promise<void>;
}
